import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

type BatchPricing = {
  quantity: number
  unitCost?: number | null
  retailPrice?: number | null
  wholesalePrice?: number | null
  sourceOrderId?: string | null
  note?: string | null
}

function getProductPricing(db: Database.Database, productId: string) {
  return db.prepare(`
    SELECT base_cost, retail_price, wholesale_price
    FROM products
    WHERE id = ?
  `).get(productId) as { base_cost: number; retail_price: number; wholesale_price: number | null } | undefined
}

function isBatchPricingEnabled(db: Database.Database) {
  const setting = db.prepare(`SELECT value FROM settings WHERE key = 'batch_pricing_enabled'`).get() as { value?: string } | undefined
  const activated = db.prepare(`SELECT value FROM settings WHERE key = 'activated'`).get() as { value?: string } | undefined
  const expiresAt = db.prepare(`SELECT value FROM settings WHERE key = 'expires_at'`).get() as { value?: string } | undefined
  const isProActive =
    activated?.value === 'true' &&
    !!expiresAt?.value &&
    new Date(expiresAt.value) > new Date()

  return isProActive && setting?.value === 'true'
}

function updateProductPriceFromActiveBatch(db: Database.Database, productId: string) {
  if (!isBatchPricingEnabled(db)) return

  const batch = db.prepare(`
    SELECT unit_cost, retail_price, wholesale_price
    FROM stock_batches
    WHERE product_id = ? AND remaining_quantity > 0
    ORDER BY datetime(received_at) ASC, datetime(created_at) ASC, rowid ASC
    LIMIT 1
  `).get(productId) as { unit_cost: number; retail_price: number; wholesale_price: number | null } | undefined

  if (!batch) return

  db.prepare(`
    UPDATE products
    SET base_price = ?,
        retail_price = ?,
        wholesale_price = ?,
        base_cost = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(batch.retail_price, batch.retail_price, batch.wholesale_price ?? batch.retail_price, batch.unit_cost, productId)
}

export function addStockBatch(db: Database.Database, productId: string, data: BatchPricing) {
  if (!isBatchPricingEnabled(db)) return
  if (!data.quantity || data.quantity <= 0) return

  const product = getProductPricing(db, productId)
  if (!product) return

  const retailPrice = data.retailPrice ?? product.retail_price ?? 0
  const wholesalePrice = data.wholesalePrice ?? product.wholesale_price ?? retailPrice
  const unitCost = data.unitCost ?? product.base_cost ?? 0

  db.prepare(`
    INSERT INTO stock_batches (
      id, product_id, initial_quantity, remaining_quantity,
      unit_cost, retail_price, wholesale_price, source_order_id, note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    productId,
    data.quantity,
    data.quantity,
    unitCost,
    retailPrice,
    wholesalePrice,
    data.sourceOrderId || null,
    data.note || null,
  )

  const inv = db.prepare(`SELECT quantity FROM inventory WHERE product_id = ?`).get(productId) as { quantity: number } | undefined
  if (!inv || inv.quantity <= 0) {
    updateProductPriceFromActiveBatch(db, productId)
  }
}

export function consumeStockBatches(db: Database.Database, productId: string, quantity: number) {
  if (!isBatchPricingEnabled(db)) return
  let remaining = Math.max(0, quantity || 0)
  if (remaining <= 0) return

  const batches = db.prepare(`
    SELECT id, remaining_quantity
    FROM stock_batches
    WHERE product_id = ? AND remaining_quantity > 0
    ORDER BY datetime(received_at) ASC, datetime(created_at) ASC, rowid ASC
  `).all(productId) as Array<{ id: string; remaining_quantity: number }>

  for (const batch of batches) {
    if (remaining <= 0) break
    const used = Math.min(batch.remaining_quantity, remaining)
    db.prepare(`
      UPDATE stock_batches
      SET remaining_quantity = remaining_quantity - ?
      WHERE id = ?
    `).run(used, batch.id)
    remaining -= used
  }

  updateProductPriceFromActiveBatch(db, productId)
}

export function restoreStockBatch(db: Database.Database, productId: string, quantity: number, price: number, cost: number, note: string) {
  if (!isBatchPricingEnabled(db)) return
  const product = getProductPricing(db, productId)
  addStockBatch(db, productId, {
    quantity,
    unitCost: cost,
    retailPrice: price,
    wholesalePrice: product?.wholesale_price ?? price,
    note,
  })
  updateProductPriceFromActiveBatch(db, productId)
}
