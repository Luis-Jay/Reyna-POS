import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerDebtorHandlers() {
  ipcMain.handle(IPC.DEBTORS.GET_ALL, (_, filters?: any) => {
    const db = getDb()
    let query = `
      SELECT d.*,
        (SELECT MAX(created_at) FROM debtor_transactions WHERE debtor_id = d.id) as last_activity
      FROM debtors d
      WHERE d.deleted_at IS NULL
    `
    if (filters?.search) { query += ` AND LOWER(d.name) LIKE LOWER(?)` }
    if (filters?.sort === 'High to Low') query += ` ORDER BY d.balance DESC`
    else if (filters?.sort === 'Low to High') query += ` ORDER BY d.balance ASC`
    else if (filters?.sort === 'A-Z') query += ` ORDER BY d.name ASC`
    else query += ` ORDER BY d.balance DESC`

    const params = filters?.search ? [`%${filters.search}%`] : []
    return db.prepare(query).all(...params)
  })

  ipcMain.handle(IPC.DEBTORS.GET_BY_ID, (_, id: string) => {
    return getDb().prepare(`SELECT * FROM debtors WHERE id = ? AND deleted_at IS NULL`).get(id)
  })

  ipcMain.handle(IPC.DEBTORS.CREATE, (_, data: any) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO debtors (id, name, phone) VALUES (?, ?, ?)`)
      .run(id, data.name, data.phone || null)
    return { success: true, id }
  })

  ipcMain.handle(IPC.DEBTORS.UPDATE, (_, id: string, data: any) => {
    getDb().prepare(`UPDATE debtors SET name = COALESCE(?, name), phone = ? WHERE id = ?`)
      .run(data.name, data.phone || null, id)
    return { success: true }
  })

  ipcMain.handle(IPC.DEBTORS.DELETE, (_, id: string) => {
    getDb().prepare(`UPDATE debtors SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    return { success: true }
  })

  ipcMain.handle(IPC.DEBTORS.ADD_TRANSACTION, (_, tx: any) => {
    const db = getDb()
    const id = uuid()
    const txn = db.transaction(() => {
      db.prepare(`
        INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, note, order_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tx.debtor_id, tx.type, tx.amount || 0, tx.profit || 0,
             tx.note || null, tx.order_id || null, tx.user_id || null)

      if (tx.type === 'debt') {
        db.prepare(`UPDATE debtors SET balance = balance + ?, total_credit = total_credit + ? WHERE id = ?`)
          .run(tx.amount, tx.amount, tx.debtor_id)
      } else if (tx.type === 'payment') {
        db.prepare(`UPDATE debtors SET balance = MAX(0, balance - ?), total_paid = total_paid + ? WHERE id = ?`)
          .run(tx.amount, tx.amount, tx.debtor_id)
      }
    })
    txn()
    return { success: true, id }
  })

  ipcMain.handle(IPC.DEBTORS.GET_TRANSACTIONS, (_, debtorId: string, filter?: string) => {
    const db = getDb()
    let query = `SELECT * FROM debtor_transactions WHERE debtor_id = ?`
    const params: any[] = [debtorId]
    if (filter === 'This Month') {
      query += ` AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    } else if (filter === 'Last Month') {
      query += ` AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')`
    }
    query += ` ORDER BY created_at DESC`
    return db.prepare(query).all(...params)
  })
}
