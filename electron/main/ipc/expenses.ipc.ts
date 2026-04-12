import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export const EXPENSE_CATEGORIES = [
  'Utilities', 'Rent', 'Salaries', 'Supplies',
  'Maintenance', 'Transportation', 'Other',
]

export function registerExpenseHandlers() {
  ipcMain.handle(IPC.EXPENSES.GET_ALL, (_, filters?: { from?: string; to?: string; category?: string }) => {
    let sql = `SELECT * FROM expenses WHERE 1=1`
    const params: any[] = []
    if (filters?.from)     { sql += ` AND date >= ?`; params.push(filters.from) }
    if (filters?.to)       { sql += ` AND date <= ?`; params.push(filters.to) }
    if (filters?.category) { sql += ` AND category = ?`; params.push(filters.category) }
    sql += ` ORDER BY date DESC, created_at DESC`
    return getDb().prepare(sql).all(...params)
  })

  ipcMain.handle(IPC.EXPENSES.CREATE, (_, data: { category: string; description?: string; amount: number; date: string }) => {
    const id = uuid()
    getDb().prepare(`INSERT INTO expenses (id, category, description, amount, date) VALUES (?, ?, ?, ?, ?)`)
      .run(id, data.category || 'Other', data.description || '', data.amount, data.date)
    return { success: true, id }
  })

  ipcMain.handle(IPC.EXPENSES.UPDATE, (_, id: string, data: { category?: string; description?: string; amount?: number; date?: string }) => {
    getDb().prepare(`UPDATE expenses SET category = COALESCE(?, category), description = COALESCE(?, description), amount = COALESCE(?, amount), date = COALESCE(?, date) WHERE id = ?`)
      .run(data.category, data.description, data.amount, data.date, id)
    return { success: true }
  })

  ipcMain.handle(IPC.EXPENSES.DELETE, (_, id: string) => {
    getDb().prepare(`DELETE FROM expenses WHERE id = ?`).run(id)
    return { success: true }
  })

  ipcMain.handle(IPC.EXPENSES.GET_SUMMARY, (_, period: 'today' | 'week' | 'month' | 'year') => {
    const periodSql: Record<string, string> = {
      today: `date = date('now')`,
      week:  `date >= date('now', '-6 days')`,
      month: `date >= date('now', 'start of month')`,
      year:  `date >= date('now', 'start of year')`,
    }
    const where = periodSql[period] || periodSql.month
    const rows = getDb().prepare(`
      SELECT category, SUM(amount) as total
      FROM expenses WHERE ${where}
      GROUP BY category ORDER BY total DESC
    `).all()
    const total = (rows as any[]).reduce((s, r) => s + r.total, 0)
    return { rows, total }
  })
}
