import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'
import { getDebtorBalanceSnapshot, recalculateDebtorTotals } from '../services/debtors.service'

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
    scheduleAutoSync()
    return { success: true, id }
  })

  ipcMain.handle(IPC.DEBTORS.UPDATE, (_, id: string, data: any) => {
    getDb().prepare(`
      UPDATE debtors
      SET
        name = COALESCE(?, name),
        phone = ?,
        due_date = ?,
        follow_up_date = ?,
        last_reminder_at = COALESCE(?, last_reminder_at),
        credit_limit = COALESCE(?, credit_limit)
      WHERE id = ?
    `).run(
      data.name,
      data.phone || null,
      data.due_date || null,
      data.follow_up_date || null,
      data.last_reminder_at || null,
      data.credit_limit !== undefined ? data.credit_limit : null,
      id,
    )
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.DEBTORS.DELETE, (_, id: string) => {
    getDb().prepare(`UPDATE debtors SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.DEBTORS.ADD_TRANSACTION, (_, tx: any) => {
    const db = getDb()
    const id = uuid()
    const debtor = db.prepare(`SELECT id FROM debtors WHERE id = ? AND deleted_at IS NULL`).get(tx.debtor_id) as { id?: string } | undefined
    if (!debtor?.id) {
      return { success: false, error: 'Debtor not found.' }
    }

    const rawAmount = Number(tx.amount || 0)
    const amount = Number.isFinite(rawAmount) ? rawAmount : 0
    if (tx.type !== 'note' && amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero.' }
    }

    const txn = db.transaction(() => {
      let effectiveAmount = amount
      if (tx.type === 'payment') {
        const snapshot = getDebtorBalanceSnapshot(db, tx.debtor_id)
        effectiveAmount = Math.min(snapshot.balance, amount)
        if (effectiveAmount <= 0) {
          throw new Error('This debtor has no outstanding balance left to pay.')
        }
      }

      db.prepare(`
        INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, note, order_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tx.debtor_id, tx.type, tx.type === 'note' ? 0 : effectiveAmount, tx.profit || 0,
             tx.note || null, tx.order_id || null, tx.user_id || null)

      if (tx.type === 'debt' || tx.type === 'payment') {
        recalculateDebtorTotals(db, tx.debtor_id)
      }
    })

    try {
      txn()
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }

    scheduleAutoSync()
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

  ipcMain.handle(IPC.DEBTORS.MARK_REMINDER, (_, debtorId: string, note?: string) => {
    const db = getDb()
    const id = uuid()
    const sentAt = new Date().toISOString()
    const txn = db.transaction(() => {
      db.prepare(`UPDATE debtors SET last_reminder_at = ? WHERE id = ?`).run(sentAt, debtorId)
      db.prepare(`
        INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, note)
        VALUES (?, ?, 'note', 0, 0, ?)
      `).run(id, debtorId, note || 'Reminder marked as sent.')
    })
    txn()
    scheduleAutoSync()
    return { success: true, sentAt }
  })
}
