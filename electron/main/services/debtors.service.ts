import type Database from 'better-sqlite3'

export function getDebtorBalanceSnapshot(db: Database.Database, debtorId: string) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE 0 END), 0) AS total_credit,
      COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) AS total_paid
    FROM debtor_transactions
    WHERE debtor_id = ?
  `).get(debtorId) as { total_credit?: number; total_paid?: number } | undefined

  const totalCredit = Number(row?.total_credit || 0)
  const totalPaid = Number(row?.total_paid || 0)

  return {
    balance: Math.max(0, totalCredit - totalPaid),
    totalCredit,
    totalPaid,
  }
}

export function recalculateDebtorTotals(db: Database.Database, debtorId: string) {
  const debtor = db.prepare(`SELECT id FROM debtors WHERE id = ?`).get(debtorId) as { id?: string } | undefined
  if (!debtor?.id) return

  const snapshot = getDebtorBalanceSnapshot(db, debtorId)
  db.prepare(`
    UPDATE debtors
    SET balance = ?, total_credit = ?, total_paid = ?
    WHERE id = ?
  `).run(snapshot.balance, snapshot.totalCredit, snapshot.totalPaid, debtorId)
}

export function recalculateAllDebtorTotals(db: Database.Database) {
  const debtors = db.prepare(`SELECT id FROM debtors`).all() as Array<{ id: string }>
  for (const debtor of debtors) {
    recalculateDebtorTotals(db, debtor.id)
  }
}
