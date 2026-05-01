import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'

export function registerLoyaltyHandlers() {
  ipcMain.handle(IPC.LOYALTY.GET_ALL, (_, search?: string) => {
    const db = getDb()
    if (search) {
      return db.prepare(`
        SELECT * FROM loyalty_accounts
        WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ?)
        ORDER BY name ASC
      `).all(`%${search}%`, `%${search}%`)
    }
    return db.prepare(`
      SELECT * FROM loyalty_accounts WHERE deleted_at IS NULL ORDER BY points DESC
    `).all()
  })

  ipcMain.handle(IPC.LOYALTY.GET_BY_PHONE, (_, phone: string) => {
    return getDb().prepare(`
      SELECT * FROM loyalty_accounts WHERE phone = ? AND deleted_at IS NULL LIMIT 1
    `).get(phone)
  })

  ipcMain.handle(IPC.LOYALTY.CREATE, (_, data: { name: string; phone?: string }) => {
    const id = uuid()
    getDb().prepare(`
      INSERT INTO loyalty_accounts (id, name, phone) VALUES (?, ?, ?)
    `).run(id, data.name, data.phone || null)
    scheduleAutoSync()
    return { success: true, id }
  })

  ipcMain.handle(IPC.LOYALTY.EARN, (_, accountId: string, points: number, orderId?: string, note?: string) => {
    const db = getDb()
    db.transaction(() => {
      db.prepare(`
        UPDATE loyalty_accounts SET points = points + ?, total_earned = total_earned + ? WHERE id = ?
      `).run(points, points, accountId)
      db.prepare(`
        INSERT INTO loyalty_transactions (id, account_id, type, points, order_id, note)
        VALUES (?, ?, 'earn', ?, ?, ?)
      `).run(uuid(), accountId, points, orderId || null, note || null)
    })()
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.LOYALTY.REDEEM, (_, accountId: string, points: number, orderId?: string, note?: string) => {
    const db = getDb()
    const account: any = db.prepare(`SELECT points FROM loyalty_accounts WHERE id = ?`).get(accountId)
    if (!account || account.points < points) {
      return { success: false, error: 'Insufficient points' }
    }
    db.transaction(() => {
      db.prepare(`
        UPDATE loyalty_accounts SET points = points - ?, total_redeemed = total_redeemed + ? WHERE id = ?
      `).run(points, points, accountId)
      db.prepare(`
        INSERT INTO loyalty_transactions (id, account_id, type, points, order_id, note)
        VALUES (?, ?, 'redeem', ?, ?, ?)
      `).run(uuid(), accountId, points, orderId || null, note || null)
    })()
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.LOYALTY.ADJUST, (_, accountId: string, points: number, note?: string) => {
    const db = getDb()
    db.transaction(() => {
      db.prepare(`UPDATE loyalty_accounts SET points = points + ? WHERE id = ?`).run(points, accountId)
      db.prepare(`
        INSERT INTO loyalty_transactions (id, account_id, type, points, note)
        VALUES (?, ?, 'adjust', ?, ?)
      `).run(uuid(), accountId, points, note || null)
    })()
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.LOYALTY.GET_HISTORY, (_, accountId: string) => {
    return getDb().prepare(`
      SELECT * FROM loyalty_transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(accountId)
  })

  ipcMain.handle(IPC.LOYALTY.DELETE, (_, accountId: string) => {
    getDb().prepare(`UPDATE loyalty_accounts SET deleted_at = datetime('now') WHERE id = ?`).run(accountId)
    scheduleAutoSync()
    return { success: true }
  })
}
