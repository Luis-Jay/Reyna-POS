import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerPriceTierHandlers() {
  ipcMain.handle(IPC.PRICE_TIERS.GET, (_, productId: string) => {
    return getDb()
      .prepare(`SELECT * FROM product_price_tiers WHERE product_id = ? ORDER BY min_qty ASC`)
      .all(productId)
  })

  ipcMain.handle(IPC.PRICE_TIERS.SET, (_, productId: string, tiers: { min_qty: number; price: number; label?: string }[]) => {
    const db = getDb()
    db.transaction(() => {
      db.prepare(`DELETE FROM product_price_tiers WHERE product_id = ?`).run(productId)
      for (const t of tiers) {
        db.prepare(`INSERT INTO product_price_tiers (id, product_id, min_qty, price, label) VALUES (?, ?, ?, ?, ?)`)
          .run(uuid(), productId, t.min_qty, t.price, t.label || null)
      }
    })()
    return { success: true }
  })

  ipcMain.handle(IPC.PRICE_TIERS.DELETE, (_, productId: string) => {
    getDb().prepare(`DELETE FROM product_price_tiers WHERE product_id = ?`).run(productId)
    return { success: true }
  })
}
