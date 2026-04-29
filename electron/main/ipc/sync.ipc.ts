import { BrowserWindow, ipcMain } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { getCurrentProductImagesDir, getDb } from '../db'
import { getValidCloudToken } from './auth.ipc'
import { broadcastDataUpdated, updateRealtimeAuth } from '../realtime'
import { IPC } from '../../../shared/ipc-channels'
import { recalculateAllDebtorTotals } from '../services/debtors.service'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
const AUTO_SYNC_INTERVAL_MS = 20 * 1000
const AUTO_SYNC_DEBOUNCE_MS = 3 * 1000

type SyncTrigger = 'manual' | 'startup' | 'interval' | 'online' | 'local_change' | 'realtime'

type SyncResult = {
  success: boolean
  message: string
}

let syncInFlight: Promise<SyncResult> | null = null
let autoSyncTimer: NodeJS.Timeout | null = null
let autoSyncInterval: NodeJS.Timeout | null = null
let lastSyncedAt: string | null = null
let lastSyncError: string | null = null
let lastSyncTrigger: SyncTrigger | null = null

function readImageAsDataUrl(imagePath?: string | null): string | null {
  if (!imagePath || !fs.existsSync(imagePath)) return null
  const buffer = fs.readFileSync(imagePath)
  const ext = path.extname(imagePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function getCatalogSnapshot() {
  const db = getDb()
  const products = db.prepare(`
    SELECT
      id, name, description, image_path, barcode, category_id, base_price, retail_price, wholesale_price, base_cost, markup_pct,
      has_variations, variation_group_id, allow_fractions, track_inventory, is_active,
      sort_order, monthly_sold, created_at, updated_at, deleted_at
    FROM products
  `).all() as any[]

  return {
    categories: db.prepare(`
      SELECT id, name, sort_order, deleted_at
      FROM categories
    `).all(),
    variationGroups: db.prepare(`
      SELECT id, name, deleted_at
      FROM variation_groups
    `).all(),
    variationOptions: db.prepare(`
      SELECT id, group_id, name, price, cost, sort_order, deleted_at
      FROM variation_options
    `).all(),
    productPriceTiers: db.prepare(`
      SELECT id, product_id, min_qty, price, label, created_at
      FROM product_price_tiers
    `).all(),
    products: products.map(p => ({
      ...p,
      image_data: readImageAsDataUrl(p.image_path),
    })),
    inventory: db.prepare(`
      SELECT id, product_id, quantity, low_threshold, updated_at
      FROM inventory
    `).all(),
  }
}


function persistProductImage(productId: string, imageData?: string | null) {
  if (!imageData || typeof imageData !== 'string') return null

  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null

  const [, mimeType, base64] = match
  const ext =
    mimeType === 'image/png' ? 'png' :
    mimeType === 'image/webp' ? 'webp' :
    mimeType === 'image/gif' ? 'gif' :
    'jpg'

  const filePath = path.join(getCurrentProductImagesDir(), `${productId}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return filePath
}

function getSalesSnapshot() {
  const db = getDb()

  return {
    debtors: db.prepare(`
      SELECT
        id, name, phone, balance, total_credit, total_paid, credit_limit,
        due_date, follow_up_date, last_reminder_at, created_at, deleted_at
      FROM debtors
      WHERE synced = 0
    `).all(),
    debtorTransactions: db.prepare(`
      SELECT
        id, debtor_id, type, amount, profit, note, order_id, user_id, created_at
      FROM debtor_transactions
      WHERE synced = 0
    `).all(),
    orders: db.prepare(`
      SELECT
        id, order_number, customer_name, status, subtotal, discount, total,
        payment_amount, change_amount, payment_breakdown, is_credit, debtor_id,
        user_id, note, exclude_sales, created_at, deleted_at
      FROM orders
      WHERE synced = 0
    `).all().map((order: any) => ({
      ...order,
      payment_breakdown: order.payment_breakdown ? JSON.parse(order.payment_breakdown) : [],
    })),
    orderItems: db.prepare(`
      SELECT
        id, order_id, product_id, name, price, cost, quantity, subtotal, is_custom
      FROM order_items
    `).all(),
    stockMovements: db.prepare(`
      SELECT
        id, product_id, type, quantity, note, reference_id, user_id, created_at
      FROM stock_movements
      WHERE synced = 0
    `).all(),
  }
}

function applyCatalogSnapshot(snapshot: any): Array<{ productId: string; url: string }> {
  const db = getDb()
  const pendingImageDownloads: Array<{ productId: string; url: string }> = []
  const tx = db.transaction(() => {
    for (const category of snapshot.categories || []) {
      db.prepare(`
        INSERT INTO categories (id, name, sort_order, deleted_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          sort_order = excluded.sort_order,
          deleted_at = excluded.deleted_at
      `).run(
        category.id,
        category.name,
        category.sort_order ?? 0,
        category.deleted_at ?? null,
      )
    }

    for (const group of snapshot.variationGroups || []) {
      db.prepare(`
        INSERT INTO variation_groups (id, name, deleted_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          deleted_at = excluded.deleted_at
      `).run(
        group.id,
        group.name,
        group.deleted_at ?? null,
      )
    }

    for (const option of snapshot.variationOptions || []) {
      db.prepare(`
        INSERT INTO variation_options (id, group_id, name, price, cost, sort_order, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          group_id = excluded.group_id,
          name = excluded.name,
          price = excluded.price,
          cost = excluded.cost,
          sort_order = excluded.sort_order,
          deleted_at = excluded.deleted_at
      `).run(
        option.id,
        option.group_id,
        option.name,
        option.price ?? 0,
        option.cost ?? 0,
        option.sort_order ?? 0,
        option.deleted_at ?? null,
      )
    }

    const catalogProductIds = new Set<string>()
    for (const tier of snapshot.productPriceTiers || []) {
      if (!tier?.product_id) continue
      catalogProductIds.add(tier.product_id)
    }
    for (const productId of catalogProductIds) {
      db.prepare(`DELETE FROM product_price_tiers WHERE product_id = ?`).run(productId)
    }
    for (const tier of snapshot.productPriceTiers || []) {
      db.prepare(`
        INSERT INTO product_price_tiers (id, product_id, min_qty, price, label, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          product_id = excluded.product_id,
          min_qty = excluded.min_qty,
          price = excluded.price,
          label = excluded.label,
          created_at = excluded.created_at
      `).run(
        tier.id,
        tier.product_id,
        tier.min_qty ?? 0,
        tier.price ?? 0,
        tier.label ?? null,
        tier.created_at ?? new Date().toISOString(),
      )
    }

    for (const product of snapshot.products || []) {
      const existing = db.prepare(`SELECT image_path FROM products WHERE id = ?`).get(product.id) as { image_path?: string } | undefined
      // Prefer base64 image_data (same-session push); fall back to existing local path.
      // If neither exists but a cloud image_url is available, queue an async download.
      let imagePath: string | null = persistProductImage(product.id, product.image_data) ?? existing?.image_path ?? null
      if (!imagePath && product.image_url) {
        pendingImageDownloads.push({ productId: product.id, url: product.image_url })
      }
      db.prepare(`
        INSERT INTO products (
          id, name, description, image_path, barcode, category_id, base_price, retail_price, wholesale_price, base_cost, markup_pct,
          has_variations, variation_group_id, allow_fractions, track_inventory, is_active, sort_order,
          monthly_sold, created_at, updated_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          image_path = excluded.image_path,
          barcode = excluded.barcode,
          category_id = excluded.category_id,
          base_price = excluded.base_price,
          retail_price = excluded.retail_price,
          wholesale_price = excluded.wholesale_price,
          base_cost = excluded.base_cost,
          markup_pct = excluded.markup_pct,
          has_variations = excluded.has_variations,
          variation_group_id = excluded.variation_group_id,
          allow_fractions = excluded.allow_fractions,
          track_inventory = excluded.track_inventory,
          is_active = excluded.is_active,
          sort_order = excluded.sort_order,
          monthly_sold = excluded.monthly_sold,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `).run(
        product.id,
        product.name,
        product.description ?? null,
        imagePath,
        product.barcode ?? null,
        product.category_id ?? null,
        product.retail_price ?? product.base_price ?? 0,
        product.retail_price ?? product.base_price ?? 0,
        product.wholesale_price ?? product.retail_price ?? product.base_price ?? 0,
        product.base_cost ?? 0,
        product.markup_pct ?? null,
        product.has_variations ? 1 : 0,
        product.variation_group_id ?? null,
        product.allow_fractions ? 1 : 0,
        product.track_inventory ? 1 : 0,
        product.is_active ? 1 : 0,
        product.sort_order ?? 0,
        product.monthly_sold ?? 0,
        product.created_at ?? new Date().toISOString(),
        product.updated_at ?? new Date().toISOString(),
        product.deleted_at ?? null,
      )
    }

    for (const item of snapshot.inventory || []) {
      const existing = db.prepare(`SELECT id FROM inventory WHERE product_id = ?`).get(item.product_id) as { id: string } | undefined
      if (existing) {
        db.prepare(`
          UPDATE inventory
          SET quantity = ?, low_threshold = ?, updated_at = ?
          WHERE product_id = ?
        `).run(
          item.quantity ?? 0,
          item.low_threshold ?? 5,
          item.updated_at ?? new Date().toISOString(),
          item.product_id,
        )
      } else {
        db.prepare(`
          INSERT INTO inventory (id, product_id, quantity, low_threshold, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          item.id,
          item.product_id,
          item.quantity ?? 0,
          item.low_threshold ?? 5,
          item.updated_at ?? new Date().toISOString(),
        )
      }
    }
  })

  tx()
  return pendingImageDownloads
}

async function downloadProductImages(downloads: Array<{ productId: string; url: string }>) {
  const db = getDb()
  const imagesDir = getCurrentProductImagesDir()
  for (const { productId, url } of downloads) {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 })
      const contentType: string = res.headers['content-type'] ?? 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const filePath = path.join(imagesDir, `${productId}.${ext}`)
      fs.writeFileSync(filePath, Buffer.from(res.data))
      db.prepare(`UPDATE products SET image_path = ? WHERE id = ?`).run(filePath, productId)
    } catch {
      // Non-fatal — image will be retried on next sync
    }
  }
}

function applySalesSnapshot(snapshot: any) {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const debtor of snapshot.debtors || []) {
      db.prepare(`
        INSERT INTO debtors (
          id, name, phone, balance, total_credit, total_paid,
          credit_limit, due_date, follow_up_date, last_reminder_at, created_at, deleted_at, synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          balance = excluded.balance,
          total_credit = excluded.total_credit,
          total_paid = excluded.total_paid,
          credit_limit = excluded.credit_limit,
          due_date = excluded.due_date,
          follow_up_date = excluded.follow_up_date,
          last_reminder_at = excluded.last_reminder_at,
          created_at = excluded.created_at,
          deleted_at = excluded.deleted_at,
          synced = 1
      `).run(
        debtor.id,
        debtor.name,
        debtor.phone ?? null,
        debtor.balance ?? 0,
        debtor.total_credit ?? 0,
        debtor.total_paid ?? 0,
        debtor.credit_limit ?? 0,
        debtor.due_date ?? null,
        debtor.follow_up_date ?? null,
        debtor.last_reminder_at ?? null,
        debtor.created_at ?? new Date().toISOString(),
        debtor.deleted_at ?? null,
      )
    }

    for (const order of snapshot.orders || []) {
      db.prepare(`
        INSERT INTO orders (
          id, order_number, customer_name, status, subtotal, discount, total,
          payment_amount, change_amount, payment_breakdown, is_credit, debtor_id,
          user_id, note, exclude_sales, created_at, deleted_at, synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          order_number = excluded.order_number,
          customer_name = excluded.customer_name,
          status = excluded.status,
          subtotal = excluded.subtotal,
          discount = excluded.discount,
          total = excluded.total,
          payment_amount = excluded.payment_amount,
          change_amount = excluded.change_amount,
          payment_breakdown = excluded.payment_breakdown,
          is_credit = excluded.is_credit,
          debtor_id = excluded.debtor_id,
          user_id = excluded.user_id,
          note = excluded.note,
          exclude_sales = excluded.exclude_sales,
          created_at = excluded.created_at,
          deleted_at = excluded.deleted_at,
          synced = 1
      `).run(
        order.id,
        order.order_number,
        order.customer_name ?? null,
        order.status ?? 'completed',
        order.subtotal ?? 0,
        order.discount ?? 0,
        order.total ?? 0,
        order.payment_amount ?? null,
        order.change_amount ?? null,
        JSON.stringify(order.payment_breakdown ?? []),
        order.is_credit ? 1 : 0,
        order.debtor_id ?? null,
        order.user_id ?? null,
        order.note ?? null,
        order.exclude_sales ? 1 : 0,
        order.created_at ?? new Date().toISOString(),
        order.deleted_at ?? null,
      )
    }

    for (const item of snapshot.orderItems || []) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, name, price, cost, quantity, subtotal, is_custom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          order_id = excluded.order_id,
          product_id = excluded.product_id,
          name = excluded.name,
          price = excluded.price,
          cost = excluded.cost,
          quantity = excluded.quantity,
          subtotal = excluded.subtotal,
          is_custom = excluded.is_custom
      `).run(
        item.id,
        item.order_id,
        item.product_id ?? null,
        item.name,
        item.price ?? 0,
        item.cost ?? 0,
        item.quantity ?? 0,
        item.subtotal ?? 0,
        item.is_custom ? 1 : 0,
      )
    }

    for (const debtorTransaction of snapshot.debtorTransactions || []) {
      db.prepare(`
        INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, note, order_id, user_id, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          debtor_id = excluded.debtor_id,
          type = excluded.type,
          amount = excluded.amount,
          profit = excluded.profit,
          note = excluded.note,
          order_id = excluded.order_id,
          user_id = excluded.user_id,
          created_at = excluded.created_at,
          synced = 1
      `).run(
        debtorTransaction.id,
        debtorTransaction.debtor_id,
        debtorTransaction.type,
        debtorTransaction.amount ?? 0,
        debtorTransaction.profit ?? 0,
        debtorTransaction.note ?? null,
        debtorTransaction.order_id ?? null,
        debtorTransaction.user_id ?? null,
        debtorTransaction.created_at ?? new Date().toISOString(),
      )
    }

    for (const stockMovement of snapshot.stockMovements || []) {
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, type, quantity, note, reference_id, user_id, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          product_id = excluded.product_id,
          type = excluded.type,
          quantity = excluded.quantity,
          note = excluded.note,
          reference_id = excluded.reference_id,
          user_id = excluded.user_id,
          created_at = excluded.created_at,
          synced = 1
      `).run(
        stockMovement.id,
        stockMovement.product_id,
        stockMovement.type,
        stockMovement.quantity ?? 0,
        stockMovement.note ?? null,
        stockMovement.reference_id ?? null,
        stockMovement.user_id ?? null,
        stockMovement.created_at ?? new Date().toISOString(),
      )
    }

  })

  tx()
  recalculateAllDebtorTotals(db)
}

function getPendingCount() {
  const db = getDb()

  const queueRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM sync_queue
    WHERE synced_at IS NULL
  `).get() as { count: number } | undefined

  const stockRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM stock_movements
    WHERE synced = 0
  `).get() as { count: number } | undefined

  const orderRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM orders
    WHERE synced = 0
  `).get() as { count: number } | undefined

  const debtorRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM debtor_transactions
    WHERE synced = 0
  `).get() as { count: number } | undefined

  return (queueRow?.count || 0) + (stockRow?.count || 0) + (orderRow?.count || 0) + (debtorRow?.count || 0)
}

function buildSyncMessage(tokenPresent: boolean) {
  if (!tokenPresent) {
    return 'Cloud sync is unavailable until you sign in to a cloud account.'
  }

  if (syncInFlight) {
    return 'Cloud account is connected. Sync is running in the background.'
  }

  if (lastSyncError) {
    return `Cloud account is connected, but the last sync failed: ${lastSyncError}`
  }

  if (lastSyncedAt) {
    return 'Cloud account is connected. Auto-sync is enabled for catalog, cashiers, sales, inventory, and debtor records.'
  }

  return 'Cloud account is connected. Auto-sync is enabled for catalog, cashiers, sales, inventory, and debtor records.'
}

async function getSyncStatusPayload() {
  const token = await getValidCloudToken()
  const pending = getPendingCount()

  return {
    status: token ? 'connected' : 'not_signed_in',
    pending,
    cloudSignedIn: Boolean(token),
    mode: 'catalog_and_cashiers',
    syncing: Boolean(syncInFlight),
    lastSyncedAt,
    lastError: lastSyncError,
    lastTrigger: lastSyncTrigger,
    message: buildSyncMessage(Boolean(token)),
  }
}

async function broadcastSyncStatus() {
  const payload = await getSyncStatusPayload()

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.PUSH.SYNC_STATUS, payload)
    }
  }
}

async function runSync(trigger: SyncTrigger): Promise<SyncResult> {
  const token = await getValidCloudToken()
  if (token) updateRealtimeAuth(token)
  if (!token) {
    lastSyncTrigger = trigger
    await broadcastSyncStatus()
    return { success: false, message: 'Sign in to your cloud account first.' }
  }

  lastSyncTrigger = trigger
  lastSyncError = null
  await broadcastSyncStatus()

  try {
    const db = getDb()
    const users = db.prepare(`
      SELECT id, name, pin, role, is_active
      FROM users
      WHERE deleted_at IS NULL
    `).all()

    await axios.post(
      `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
      { cashiers: users },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    )

    const localCatalog = getCatalogSnapshot()
    await axios.post(
      `${SUPABASE_FUNCTIONS_URL}/sync-catalog`,
      localCatalog,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    )

    const remoteCatalog = await axios.get(
      `${SUPABASE_FUNCTIONS_URL}/sync-catalog`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    )

    const pendingImages = applyCatalogSnapshot(remoteCatalog.data)
    if (pendingImages.length > 0) void downloadProductImages(pendingImages)

    const syncStart = new Date().toISOString()
    const localSales = getSalesSnapshot()

    // Capture IDs of records being synced
    const syncedOrderIds = localSales.orders.map((o: any) => o.id)
    const syncedDebtorTransactionIds = localSales.debtorTransactions.map((dt: any) => dt.id)
    const syncedDebtorIds = localSales.debtors.map((d: any) => d.id)
    const syncedStockMovementIds = localSales.stockMovements.map((sm: any) => sm.id)

    await axios.post(
      `${SUPABASE_FUNCTIONS_URL}/sync-sales`,
      localSales,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    )

    const remoteSales = await axios.get(
      `${SUPABASE_FUNCTIONS_URL}/sync-sales`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    )

    applySalesSnapshot(remoteSales.data)

    // Mark the records that were sent as synced
    if (syncedOrderIds.length > 0) {
      db.prepare(`UPDATE orders SET synced = 1 WHERE id IN (${syncedOrderIds.map(() => '?').join(',')})`).run(...syncedOrderIds)
    }
    if (syncedDebtorTransactionIds.length > 0) {
      db.prepare(`UPDATE debtor_transactions SET synced = 1 WHERE id IN (${syncedDebtorTransactionIds.map(() => '?').join(',')})`).run(...syncedDebtorTransactionIds)
    }
    if (syncedDebtorIds.length > 0) {
      db.prepare(`UPDATE debtors SET synced = 1 WHERE id IN (${syncedDebtorIds.map(() => '?').join(',')})`).run(...syncedDebtorIds)
    }
    if (syncedStockMovementIds.length > 0) {
      db.prepare(`UPDATE stock_movements SET synced = 1 WHERE id IN (${syncedStockMovementIds.map(() => '?').join(',')})`).run(...syncedStockMovementIds)
    }

    lastSyncedAt = new Date().toISOString()
    lastSyncError = null

    // Notify other devices only when this device pushed data (not on realtime-triggered pulls)
    if (trigger !== 'realtime') {
      void broadcastDataUpdated()
    }

    return {
      success: true,
      message: 'Cashiers, catalog, inventory, stock history, orders, and debtors synced successfully across connected devices.',
    }
  } catch (err: any) {
    const message = err?.response?.data?.error || err?.message || 'Failed to sync with the cloud service.'
    lastSyncError = message
    return {
      success: false,
      message,
    }
  } finally {
    await broadcastSyncStatus()
  }
}

export function scheduleAutoSync(trigger: SyncTrigger = 'local_change', delayMs = AUTO_SYNC_DEBOUNCE_MS) {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer)
  }

  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null
    void ensureSync(trigger)
  }, delayMs)
}

export function startAutoSync() {
  if (!autoSyncInterval) {
    autoSyncInterval = setInterval(() => {
      void ensureSync('interval')
    }, AUTO_SYNC_INTERVAL_MS)
  }

  scheduleAutoSync('startup', 5 * 1000)
}

async function ensureSync(trigger: SyncTrigger): Promise<SyncResult> {
  if (syncInFlight) {
    return syncInFlight
  }

  syncInFlight = runSync(trigger)
  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
    await broadcastSyncStatus()
  }
}

export function registerSyncHandlers() {
  ipcMain.handle(IPC.SYNC.GET_STATUS, async () => {
    return getSyncStatusPayload()
  })

  ipcMain.handle(IPC.SYNC.FORCE, async () => {
    return ensureSync('manual')
  })

  ipcMain.handle(IPC.SYNC.TRIGGER_AUTO, async (_, reason?: string) => {
    const trigger: SyncTrigger = reason === 'online' ? 'online' : 'local_change'
    scheduleAutoSync(trigger, trigger === 'online' ? 1_000 : AUTO_SYNC_DEBOUNCE_MS)
    await broadcastSyncStatus()
    return { success: true }
  })
}
