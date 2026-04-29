import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerShiftHandlers() {
  ipcMain.handle(IPC.SHIFTS.TIME_IN, (_, data: { userId: string; startMoney: number; note?: string }) => {
    const db = getDb()
    // Only one active shift per user
    const existing: any = db.prepare(
      `SELECT id FROM cashier_shifts WHERE user_id = ? AND time_out IS NULL LIMIT 1`
    ).get(data.userId)
    if (existing) return { success: false, error: 'Cashier already has an open shift.' }

    const id = uuid()
    db.prepare(`INSERT INTO cashier_shifts (id, user_id, start_money, note) VALUES (?, ?, ?, ?)`)
      .run(id, data.userId, data.startMoney, data.note || null)
    return { success: true, id }
  })

  ipcMain.handle(IPC.SHIFTS.TIME_OUT, (_, data: { shiftId: string; endMoney: number; note?: string }) => {
    const db = getDb()
    const shift: any = db.prepare(`SELECT * FROM cashier_shifts WHERE id = ?`).get(data.shiftId)
    if (!shift) return { success: false, error: 'Shift not found.' }
    if (shift.time_out) return { success: false, error: 'Shift already closed.' }

    db.prepare(`UPDATE cashier_shifts SET time_out = datetime('now'), end_money = ?, note = COALESCE(?, note) WHERE id = ?`)
      .run(data.endMoney, data.note || null, data.shiftId)
    return { success: true }
  })

  ipcMain.handle(IPC.SHIFTS.GET_ACTIVE, (_, userId?: string) => {
    let sql = `
      SELECT s.*, u.name as cashier_name
      FROM cashier_shifts s JOIN users u ON u.id = s.user_id
      WHERE s.time_out IS NULL
    `
    const params: any[] = []
    if (userId) { sql += ` AND s.user_id = ?`; params.push(userId) }
    sql += ` ORDER BY s.time_in DESC`
    return getDb().prepare(sql).all(...params)
  })

  ipcMain.handle(IPC.SHIFTS.GET_ALL, (_, filters?: { userId?: string; from?: string; to?: string }) => {
    let sql = `
      SELECT s.*, u.name as cashier_name
      FROM cashier_shifts s JOIN users u ON u.id = s.user_id
      WHERE 1=1
    `
    const params: any[] = []
    if (filters?.userId) { sql += ` AND s.user_id = ?`; params.push(filters.userId) }
    if (filters?.from)   { sql += ` AND DATE(s.time_in) >= ?`; params.push(filters.from) }
    if (filters?.to)     { sql += ` AND DATE(s.time_in) <= ?`; params.push(filters.to) }
    sql += ` ORDER BY s.time_in DESC LIMIT 100`
    return getDb().prepare(sql).all(...params)
  })

  ipcMain.handle(IPC.SHIFTS.ADD_PETTY_CASH, (_, data: { shiftId: string; description: string; amount: number }) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO petty_cash (id, shift_id, description, amount) VALUES (?, ?, ?, ?)`)
      .run(id, data.shiftId, data.description, data.amount)
    db.prepare(`UPDATE cashier_shifts SET petty_cash_total = petty_cash_total + ? WHERE id = ?`)
      .run(data.amount, data.shiftId)
    return { success: true, id }
  })

  ipcMain.handle(IPC.SHIFTS.GET_PETTY_CASH, (_, shiftId: string) => {
    return getDb().prepare(`SELECT * FROM petty_cash WHERE shift_id = ? ORDER BY created_at`).all(shiftId)
  })
}
