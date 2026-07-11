import { supabase } from './supabase'
import { localDb, LocalProduct, LocalCategory, LocalInventory } from './local-db'

// How long to wait before re-running a catalog refresh when the tab becomes visible.
// Products don't change often — 5 minutes is plenty.
const CATALOG_REFRESH_THROTTLE_MS = 5 * 60 * 1000

type SyncStatus = {
  status: 'connected' | 'not_signed_in' | 'syncing' | 'offline'
  pending: number
  syncing: boolean
  lastSyncedAt: string | null
  lastError: string | null
}

type StatusListener = (status: SyncStatus) => void

let syncInFlight = false
let lastSyncedAt: string | null = null
let lastCatalogRefreshedAt = 0
let lastError: string | null = null
const listeners = new Set<StatusListener>()

export function onSyncStatus(cb: StatusListener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

async function broadcast(businessId?: string) {
  const pending = businessId
    ? await localDb.orders_queue.where({ business_id: businessId, synced: 0 }).count()
    : 0

  const { data: { session } } = await supabase.auth.getSession()
  const signedIn = Boolean(session)

  const status: SyncStatus = {
    status: !navigator.onLine ? 'offline' : signedIn ? (syncInFlight ? 'syncing' : 'connected') : 'not_signed_in',
    pending,
    syncing: syncInFlight,
    lastSyncedAt,
    lastError,
  }

  listeners.forEach(cb => cb(status))
}

// Flush all unsynced orders for a business to Supabase.
async function drainOrderQueue(businessId: string): Promise<void> {
  const pending = await localDb.orders_queue
    .where({ business_id: businessId, synced: 0 })
    .toArray()

  for (const queued of pending) {
    try {
      const { orderId, orderNumber, orderData, items } = JSON.parse(queued.payload)

      // Try RPC first, fall back to manual inserts
      const { data, error: rpcError } = await supabase.rpc('create_sale_order', {
        p_business_id: businessId,
        p_order_id: orderId,
        p_customer_name: orderData.customer_name || null,
        p_subtotal: orderData.subtotal ?? 0,
        p_discount: orderData.discount ?? 0,
        p_total: orderData.total ?? 0,
        p_payment_amount: orderData.payment_amount ?? null,
        p_change_amount: orderData.change_amount ?? null,
        p_payment_breakdown: orderData.payment_breakdown ?? [],
        p_is_credit: !!orderData.is_credit,
        p_debtor_id: orderData.debtor_id || null,
        p_user_id: orderData.user_id || null,
        p_note: orderData.note || null,
        p_items: items,
      })

      const rpcFailed = rpcError && (
        rpcError.message.toLowerCase().includes('create_sale_order') ||
        rpcError.message.toLowerCase().includes('could not find') ||
        rpcError.message.toLowerCase().includes('does not exist')
      )

      if (rpcError && !rpcFailed) throw new Error(rpcError.message)

      if (rpcFailed) {
        // Manual fallback
        const { error: orderError } = await supabase.from('sales_orders').upsert({
          id: orderId,
          business_id: businessId,
          order_number: orderNumber,
          customer_name: orderData.customer_name || null,
          status: 'completed',
          subtotal: orderData.subtotal ?? 0,
          discount: orderData.discount ?? 0,
          total: orderData.total,
          payment_amount: orderData.payment_amount ?? null,
          change_amount: orderData.change_amount ?? null,
          payment_breakdown: orderData.payment_breakdown ?? [],
          is_credit: !!orderData.is_credit,
          debtor_id: orderData.debtor_id || null,
          user_id: orderData.user_id || null,
          note: orderData.note || null,
          created_at: queued.created_at,
        })
        if (orderError) throw new Error(orderError.message)

        if (items.length > 0) {
          await supabase.from('sales_order_items').upsert(
            items.map((item: any) => ({
              ...item,
              business_id: businessId,
              order_id: orderId,
            }))
          )
        }

        // Inventory & stock movements
        for (const item of items.filter((i: any) => i.product_id && !i.is_custom)) {
          const { data: inv } = await supabase
            .from('catalog_inventory')
            .select('quantity')
            .eq('product_id', item.product_id)
            .eq('business_id', businessId)
            .single()

          if (inv) {
            const newQty = Math.max(0, Number(inv.quantity ?? 0) - Number(item.quantity ?? 0))
            await supabase.from('catalog_inventory')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('product_id', item.product_id)
              .eq('business_id', businessId)
          }

          await supabase.from('stock_movements').insert({
            id: crypto.randomUUID(),
            business_id: businessId,
            product_id: item.product_id,
            type: 'sale',
            quantity: -Math.abs(Number(item.quantity ?? 0)),
            reference_id: orderId,
            note: orderData.note || null,
            user_id: orderData.user_id || null,
            created_at: queued.created_at,
          })
        }

        // Debtor transaction for credit sales
        if (orderData.is_credit && orderData.debtor_id) {
          const profit = items.reduce((s: number, i: any) =>
            s + ((Number(i.price ?? 0) - Number(i.cost ?? 0)) * Number(i.quantity ?? 0)), 0)

          const { data: debtor } = await supabase.from('sales_debtors')
            .select('balance, total_credit')
            .eq('id', orderData.debtor_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('sales_debtors').update({
            balance: Number(debtor?.balance ?? 0) + Number(orderData.total ?? 0),
            total_credit: Number(debtor?.total_credit ?? 0) + Number(orderData.total ?? 0),
            updated_at: new Date().toISOString(),
          }).eq('id', orderData.debtor_id).eq('business_id', businessId)

          await supabase.from('sales_debtor_transactions').upsert({
            id: crypto.randomUUID(),
            business_id: businessId,
            debtor_id: orderData.debtor_id,
            type: 'debt',
            amount: orderData.total,
            profit,
            order_id: orderId,
            user_id: orderData.user_id || null,
            note: orderData.note || null,
            created_at: queued.created_at,
          })
        }
      } else if (data?.order_number && data.order_number !== orderNumber) {
        // Server used a different order number — update local queue record
        await localDb.orders_queue.update(queued.id, {
          order_number: data.order_number,
        })
      }

      await localDb.orders_queue.update(queued.id, { synced: 1, sync_error: null })
    } catch (err: any) {
      await localDb.orders_queue.update(queued.id, {
        sync_error: err?.message ?? 'Sync failed',
      })
    }
  }
}

// Pull catalog from Supabase and refresh local cache.
export async function refreshCatalogCache(businessId: string): Promise<void> {
  try {
    const [productsRes, categoriesRes, inventoryRes] = await Promise.all([
      supabase
        .from('catalog_products')
        .select('id, name, description, image_url, barcode, category_id, base_price, retail_price, wholesale_price, base_cost, markup_pct, has_variations, variation_group_id, allow_fractions, track_inventory, is_active, sort_order, monthly_sold, basic_locked, updated_at, deleted_at, catalog_categories(name)')
        .eq('business_id', businessId)
        .limit(10000),
      supabase
        .from('catalog_categories')
        .select('id, name, sort_order, updated_at, deleted_at')
        .eq('business_id', businessId)
        .limit(10000),
      supabase
        .from('catalog_inventory')
        .select('product_id, quantity, low_threshold, updated_at')
        .eq('business_id', businessId)
        .limit(10000),
    ])

    if (productsRes.data) {
      const invMap: Record<string, number> = {}
      for (const inv of inventoryRes.data ?? []) invMap[inv.product_id] = inv.quantity

      const products: LocalProduct[] = productsRes.data.map((p: any) => ({
        id: p.id,
        business_id: businessId,
        name: p.name,
        description: p.description ?? null,
        image_url: p.image_url ?? null,
        barcode: p.barcode ?? null,
        category_id: p.category_id ?? null,
        base_price: Number(p.base_price ?? 0),
        retail_price: Number(p.retail_price ?? p.base_price ?? 0),
        wholesale_price: p.wholesale_price == null ? null : Number(p.wholesale_price),
        base_cost: Number(p.base_cost ?? 0),
        markup_pct: p.markup_pct == null ? null : Number(p.markup_pct),
        has_variations: p.has_variations ? 1 : 0,
        variation_group_id: p.variation_group_id ?? null,
        allow_fractions: p.allow_fractions ? 1 : 0,
        track_inventory: p.track_inventory ? 1 : 0,
        is_active: p.is_active ? 1 : 0,
        sort_order: Number(p.sort_order ?? 0),
        monthly_sold: Number(p.monthly_sold ?? 0),
        basic_locked: p.basic_locked ? 1 : 0,
        updated_at: p.updated_at ?? new Date().toISOString(),
        deleted_at: p.deleted_at ?? null,
        stock: invMap[p.id] != null ? invMap[p.id] : null,
        category_name: (p as any).catalog_categories?.name ?? null,
      }))

      await localDb.products.bulkPut(products)
    }

    if (categoriesRes.data) {
      const categories: LocalCategory[] = categoriesRes.data.map((c: any) => ({
        id: c.id,
        business_id: businessId,
        name: c.name,
        sort_order: Number(c.sort_order ?? 0),
        updated_at: c.updated_at ?? null,
        deleted_at: c.deleted_at ?? null,
      }))
      await localDb.categories.bulkPut(categories)
    }

    if (inventoryRes.data) {
      const inventory: LocalInventory[] = inventoryRes.data.map((inv: any) => ({
        product_id: inv.product_id,
        business_id: businessId,
        quantity: Number(inv.quantity ?? 0),
        low_threshold: Number(inv.low_threshold ?? 5),
        updated_at: inv.updated_at ?? new Date().toISOString(),
      }))
      await localDb.inventory.bulkPut(inventory)
    }
  } catch {
    // Non-fatal — cache stays as-is
  }
}

async function runSync(businessId: string, forceCatalogRefresh = false): Promise<void> {
  if (syncInFlight) return
  syncInFlight = true
  lastError = null
  await broadcast(businessId)

  try {
    await drainOrderQueue(businessId)

    const now = Date.now()
    const catalogStale = now - lastCatalogRefreshedAt > CATALOG_REFRESH_THROTTLE_MS
    if (forceCatalogRefresh || catalogStale) {
      await refreshCatalogCache(businessId)
      lastCatalogRefreshedAt = now
    }

    lastSyncedAt = new Date().toISOString()
  } catch (err: any) {
    lastError = err?.message ?? 'Sync failed'
  } finally {
    syncInFlight = false
    await broadcast(businessId)
  }
}

export function startWebSyncService(businessId: string) {
  // Drain queue + refresh catalog on startup
  void runSync(businessId, true)

  // Sync when coming back online (force catalog refresh since we may have missed changes)
  window.addEventListener('online', () => void runSync(businessId, true))

  // When the user returns to the tab, drain any queued orders.
  // Catalog refresh only happens if it's been > 5 minutes (throttled inside runSync).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runSync(businessId)
    }
  })
}

export function stopWebSyncService() {
  // Listeners are intentionally left attached — the service is app-lifetime.
}

export async function triggerSync(businessId: string) {
  await runSync(businessId, false)
}

export async function getSyncStatusPayload(businessId?: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const signedIn = Boolean(session)
  const pending = businessId
    ? await localDb.orders_queue.where({ business_id: businessId, synced: 0 }).count()
    : 0

  return {
    status: !navigator.onLine ? 'offline' : signedIn ? 'connected' : 'not_signed_in',
    cloudSignedIn: signedIn,
    pending,
    pendingCount: pending,
    syncing: syncInFlight,
    lastSyncedAt,
    lastError,
    message: !navigator.onLine
      ? 'You are offline. Sales are being saved locally and will sync when reconnected.'
      : signedIn
        ? pending > 0
          ? `${pending} sale${pending === 1 ? '' : 's'} pending sync.`
          : 'All sales synced.'
        : 'Sign in to your cloud account to sync.',
  }
}
