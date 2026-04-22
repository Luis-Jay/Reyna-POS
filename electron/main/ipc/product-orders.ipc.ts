import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { randomUUID } from 'crypto'
import { addStockBatch } from '../services/stock-batches.service'

export function registerProductOrderHandlers() {
  const db = getDb()

  ipcMain.handle(IPC.PRODUCT_ORDERS.GET_ALL, () => {
    return db.prepare(`
      SELECT po.*, p.name AS product_name, p.barcode, p.base_cost,
             p.retail_price AS current_retail_price,
             p.wholesale_price AS current_wholesale_price,
             p.image_path
      FROM product_orders po
      JOIN products p ON p.id = po.product_id
      ORDER BY po.created_at DESC
    `).all()
  })

  ipcMain.handle(IPC.PRODUCT_ORDERS.GET_PENDING, () => {
    return db.prepare(`
      SELECT po.*, p.name AS product_name, p.barcode,
             p.retail_price AS current_retail_price,
             p.wholesale_price AS current_wholesale_price,
             p.image_path
      FROM product_orders po
      JOIN products p ON p.id = po.product_id
      WHERE po.status = 'pending'
      ORDER BY po.created_at DESC
    `).all()
  })

  ipcMain.handle(IPC.PRODUCT_ORDERS.CREATE, (_e, data: any) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO product_orders (
        id, product_id, vendor_name, quantity, unit_cost, retail_price, wholesale_price, expected_at, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.product_id, data.vendor_name || null, data.quantity, data.unit_cost || 0,
           data.retail_price ?? null, data.wholesale_price ?? null, data.expected_at || null, data.notes || null)
    return { id }
  })

  ipcMain.handle(IPC.PRODUCT_ORDERS.RECEIVE, (_e, id: string) => {
    const order = db.prepare('SELECT * FROM product_orders WHERE id = ?').get(id) as any
    if (!order || order.status !== 'pending') return { ok: false }

    db.transaction(() => {
      // Add stock
      const inv = db.prepare('SELECT id, quantity FROM inventory WHERE product_id = ?').get(order.product_id) as any
      if (inv) {
        db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?')
          .run(order.quantity, order.product_id)
      } else {
        db.prepare(`INSERT INTO inventory (id, product_id, quantity, low_threshold)
                    VALUES (?, ?, ?, 5)`)
          .run(randomUUID(), order.product_id, order.quantity)
      }
      addStockBatch(db, order.product_id, {
        quantity: order.quantity,
        unitCost: order.unit_cost,
        retailPrice: order.retail_price,
        wholesalePrice: order.wholesale_price,
        sourceOrderId: order.id,
        note: `Received order from ${order.vendor_name || 'vendor'}`,
      })

      // Log movement
      db.prepare(`INSERT INTO stock_movements (id, product_id, type, quantity, note, created_at)
                  VALUES (?, ?, 'restock', ?, ?, datetime('now'))`)
        .run(randomUUID(), order.product_id, order.quantity,
             `Received order from ${order.vendor_name || 'vendor'}`)

      // Mark order received
      db.prepare(`UPDATE product_orders SET status = 'received', received_at = datetime('now') WHERE id = ?`)
        .run(id)
    })()

    return { ok: true }
  })

  ipcMain.handle(IPC.PRODUCT_ORDERS.CANCEL, (_e, id: string) => {
    db.prepare(`UPDATE product_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(id)
    return { ok: true }
  })
}
