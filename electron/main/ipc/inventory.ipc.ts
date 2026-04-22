import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'
import { addStockBatch, consumeStockBatches } from '../services/stock-batches.service'

function getStatus(qty: number, threshold: number): string {
  if (qty <= 0) return 'out'
  if (qty <= threshold / 2) return 'critical'
  if (qty <= threshold) return 'low'
  return 'safe'
}

export function registerInventoryHandlers() {
  ipcMain.handle(IPC.INVENTORY.GET_REPORT, () => {
    const db = getDb()
    const rows: any[] = db.prepare(`
      SELECT
        p.barcode,
        p.name        AS product_name,
        c.name        AS category_name,
        i.quantity,
        p.base_cost,
        p.retail_price,
        p.wholesale_price,
        i.low_threshold,
        p.description
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      ORDER BY c.name ASC, p.name ASC
    `).all()
    return rows
  })

  ipcMain.handle(IPC.INVENTORY.GET_ALL, (_, filter?: string) => {
    const db = getDb()
    let query = `
      SELECT i.*, p.name as product_name, p.image_path, p.monthly_sold,
             p.track_inventory, p.is_active, p.base_price, p.retail_price,
             p.wholesale_price, p.base_cost, p.barcode
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1 AND p.track_inventory = 1
    `
    const params: any[] = []

    if (filter === 'Fast Moving') {
      query += ` ORDER BY p.monthly_sold DESC`
    } else if (filter === 'Low Stock') {
      query += ` AND i.quantity <= i.low_threshold AND i.quantity > 0 ORDER BY i.quantity ASC`
    } else if (filter === 'Out of Stock') {
      query += ` AND i.quantity <= 0 ORDER BY p.monthly_sold DESC`
    } else if (filter === 'Critical') {
      query += ` AND i.quantity <= i.low_threshold / 2 ORDER BY i.quantity ASC`
    } else {
      query += ` ORDER BY p.monthly_sold DESC`
    }

    const rows: any[] = db.prepare(query).all(...params)
    return rows.map(r => ({
      ...r,
      status: getStatus(r.quantity, r.low_threshold),
    }))
  })

  ipcMain.handle(IPC.INVENTORY.ADD_STOCK, (_, productId: string, qty: number, note?: string, pricing?: any) => {
    const db = getDb()
    const tx = db.transaction(() => {
      const inv: any = db.prepare(`SELECT * FROM inventory WHERE product_id = ?`).get(productId)
      if (!inv) {
        db.prepare(`INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`)
          .run(uuid(), productId, qty)
      } else {
        db.prepare(`UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE product_id = ?`)
          .run(qty, productId)
      }
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, type, quantity, note)
        VALUES (?, ?, 'restock', ?, ?)
      `).run(uuid(), productId, qty, note || null)
      addStockBatch(db, productId, {
        quantity: qty,
        unitCost: pricing?.unit_cost,
        retailPrice: pricing?.retail_price,
        wholesalePrice: pricing?.wholesale_price,
        note: note || 'Manual stock add',
      })
    })
    tx()
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.INVENTORY.SET_STOCK, (_, productId: string, qty: number, note?: string) => {
    const db = getDb()
    const tx = db.transaction(() => {
      const inv: any = db.prepare(`SELECT * FROM inventory WHERE product_id = ?`).get(productId)
      const previous = inv?.quantity ?? 0
      const diff = qty - previous
      if (!inv) {
        db.prepare(`INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`)
          .run(uuid(), productId, qty)
      } else {
        db.prepare(`UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE product_id = ?`)
          .run(qty, productId)
      }
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, type, quantity, note)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), productId, diff >= 0 ? 'restock' : 'adjustment', Math.abs(diff), note || `Set to ${qty}`)
      if (diff > 0) {
        addStockBatch(db, productId, {
          quantity: diff,
          note: note || `Set stock to ${qty}`,
        })
      } else if (diff < 0) {
        consumeStockBatches(db, productId, Math.abs(diff))
      }
    })
    tx()
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.INVENTORY.GET_MOVEMENTS, (_, productId: string) => {
    return getDb().prepare(`
      SELECT sm.*, p.name as product_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      WHERE sm.product_id = ?
      ORDER BY sm.created_at DESC LIMIT 50
    `).all(productId)
  })

  ipcMain.handle(IPC.INVENTORY.SET_THRESHOLD, (_, productId: string, threshold: number) => {
    getDb().prepare(`UPDATE inventory SET low_threshold = ? WHERE product_id = ?`).run(threshold, productId)
    scheduleAutoSync()
    return { success: true }
  })
}
