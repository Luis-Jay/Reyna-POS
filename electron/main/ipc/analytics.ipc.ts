import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

type AnalyticsRangeInput =
  | string
  | {
      preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_month' | 'this_month'
      from?: string
      to?: string
    }

function manilaDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

function shiftDays(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T00:00:00+08:00`)
  date.setDate(date.getDate() + delta)
  return manilaDate(date)
}

function monthBounds(offsetMonths = 0): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = offsetMonths === 0
    ? new Date()
    : new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0)
  return { from: manilaDate(start), to: manilaDate(end) }
}

function resolveDateRange(input?: AnalyticsRangeInput): { from: string; to: string } {
  if (input && typeof input === 'object' && input.from && input.to) {
    return { from: input.from, to: input.to }
  }

  const preset = typeof input === 'string'
    ? input
    : input?.preset || 'this_month'

  const today = manilaDate()

  if (preset === 'today') {
    return { from: today, to: today }
  }
  if (preset === 'yesterday') {
    const yesterday = shiftDays(today, -1)
    return { from: yesterday, to: yesterday }
  }
  if (preset === 'last_7_days') {
    return { from: shiftDays(today, -6), to: today }
  }
  if (preset === 'last_month') {
    return monthBounds(-1)
  }
  return monthBounds(0)
}

function getDailySeries(from: string, to: string) {
  const db = getDb()
  const orderRows: any[] = db.prepare(`
    SELECT
      DATE(o.created_at, '+8 hours') as date,
      COALESCE(SUM(o.total), 0) as sales,
      COALESCE(SUM(
        (SELECT COALESCE(SUM((oi.price - oi.cost) * oi.quantity),0)
         FROM order_items oi WHERE oi.order_id = o.id)
      ), 0) as profit,
      COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.cost * oi.quantity),0)
         FROM order_items oi WHERE oi.order_id = o.id)
      ), 0) as cost
    FROM orders o
    WHERE o.deleted_at IS NULL
      AND o.status = 'completed'
      AND o.exclude_sales = 0
      AND DATE(o.created_at, '+8 hours') >= ?
      AND DATE(o.created_at, '+8 hours') <= ?
    GROUP BY DATE(o.created_at, '+8 hours')
    ORDER BY date ASC
  `).all(from, to)

  const expenseRows: any[] = db.prepare(`
    SELECT date, COALESCE(SUM(amount), 0) as expenses
    FROM expenses
    WHERE DATE(date) >= ? AND DATE(date) <= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(from, to)

  const refundRows: any[] = db.prepare(`
    SELECT
      DATE(created_at, '+8 hours') as date,
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN amount ELSE 0 END), 0) as refund_amount,
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN cost_amount ELSE 0 END), 0) as refund_cost,
      COALESCE(SUM(CASE WHEN event_type = 'damage' THEN cost_amount ELSE 0 END), 0) as damage_cost
    FROM return_events
    WHERE DATE(created_at, '+8 hours') >= ? AND DATE(created_at, '+8 hours') <= ?
    GROUP BY DATE(created_at, '+8 hours')
    ORDER BY date ASC
  `).all(from, to)

  const byDate = new Map<string, {
    sales: number
    profit: number
    cost: number
    expenses: number
    refunds: number
    damages: number
  }>()
  for (const row of orderRows) {
    byDate.set(row.date, {
      sales: row.sales || 0,
      profit: row.profit || 0,
      cost: row.cost || 0,
      expenses: 0,
      refunds: 0,
      damages: 0,
    })
  }
  for (const row of expenseRows) {
    const current = byDate.get(row.date) || { sales: 0, profit: 0, cost: 0, expenses: 0, refunds: 0, damages: 0 }
    current.expenses = row.expenses || 0
    byDate.set(row.date, current)
  }
  for (const row of refundRows) {
    const current = byDate.get(row.date) || { sales: 0, profit: 0, cost: 0, expenses: 0, refunds: 0, damages: 0 }
    const refundAmount = row.refund_amount || 0
    const refundCost = row.refund_cost || 0
    const damageCost = row.damage_cost || 0
    current.sales -= refundAmount
    current.cost -= refundCost
    current.profit -= (refundAmount - refundCost)
    current.expenses += damageCost
    current.refunds += refundAmount
    current.damages += damageCost
    byDate.set(row.date, current)
  }

  const series = []
  for (let cursor = from; cursor <= to; cursor = shiftDays(cursor, 1)) {
    const point = byDate.get(cursor) || { sales: 0, profit: 0, cost: 0, expenses: 0, refunds: 0, damages: 0 }
    series.push({
      date: cursor,
      sales: point.sales,
      profit: point.profit,
      cost: point.cost,
      expenses: point.expenses,
      net_income: point.profit - point.expenses,
    })
  }
  return series
}

function getSalesSnapshot(db: ReturnType<typeof getDb>, from: string, to: string) {
  return db.prepare(`
    SELECT
      COALESCE(COUNT(o.id), 0) as receipt_count,
      COALESCE(SUM(o.subtotal), 0) as gross_sales,
      COALESCE(SUM(o.discount), 0) as total_discounts,
      COALESCE(SUM(o.total), 0) as total_sales,
      COALESCE(SUM(CASE WHEN o.is_credit = 0 THEN o.total ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN o.is_credit = 1 THEN o.total ELSE 0 END), 0) as credit_sales,
      COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.cost * oi.quantity),0)
         FROM order_items oi WHERE oi.order_id = o.id)
      ), 0) as total_cost
    FROM orders o
    WHERE o.deleted_at IS NULL
      AND o.status = 'completed'
      AND o.exclude_sales = 0
      AND DATE(o.created_at, '+8 hours') >= ?
      AND DATE(o.created_at, '+8 hours') <= ?
  `).get(from, to) as any
}

function getReturnSnapshot(db: ReturnType<typeof getDb>, from: string, to: string) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN amount ELSE 0 END), 0) as refund_amount,
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN cost_amount ELSE 0 END), 0) as refund_cost,
      COALESCE(SUM(CASE WHEN event_type = 'damage' THEN cost_amount ELSE 0 END), 0) as damage_cost
    FROM return_events
    WHERE DATE(created_at, '+8 hours') >= ? AND DATE(created_at, '+8 hours') <= ?
  `).get(from, to) as any
}

function getDailySalesSummary(db: ReturnType<typeof getDb>, from: string, to: string) {
  const salesRows: any[] = db.prepare(`
    SELECT
      DATE(o.created_at, '+8 hours') as date,
      COUNT(o.id) as transaction_count,
      COALESCE(SUM(o.subtotal), 0) as gross_sales,
      COALESCE(SUM(o.discount), 0) as discounts,
      COALESCE(SUM(o.total), 0) as total_sales
    FROM orders o
    WHERE o.deleted_at IS NULL
      AND o.status = 'completed'
      AND o.exclude_sales = 0
      AND DATE(o.created_at, '+8 hours') >= ?
      AND DATE(o.created_at, '+8 hours') <= ?
    GROUP BY DATE(o.created_at, '+8 hours')
    ORDER BY date ASC
  `).all(from, to)

  const returnRows: any[] = db.prepare(`
    SELECT
      DATE(created_at, '+8 hours') as date,
      COALESCE(SUM(CASE WHEN event_type = 'refund' THEN amount ELSE 0 END), 0) as returns
    FROM return_events
    WHERE DATE(created_at, '+8 hours') >= ?
      AND DATE(created_at, '+8 hours') <= ?
    GROUP BY DATE(created_at, '+8 hours')
    ORDER BY date ASC
  `).all(from, to)

  const salesByDate = new Map<string, any>()
  for (const row of salesRows) {
    salesByDate.set(row.date, {
      date: row.date,
      day: new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' }).format(new Date(`${row.date}T12:00:00+08:00`)),
      transaction_count: row.transaction_count || 0,
      gross_sales: row.gross_sales || 0,
      discounts: row.discounts || 0,
      returns: 0,
      net_sales: row.total_sales || 0,
      avg_basket: (row.transaction_count || 0) > 0 ? (row.total_sales || 0) / row.transaction_count : 0,
    })
  }

  for (const row of returnRows) {
    const current = salesByDate.get(row.date) || {
      date: row.date,
      day: new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' }).format(new Date(`${row.date}T12:00:00+08:00`)),
      transaction_count: 0,
      gross_sales: 0,
      discounts: 0,
      returns: 0,
      net_sales: 0,
      avg_basket: 0,
    }
    current.returns = row.returns || 0
    current.net_sales = Math.max(0, current.net_sales - current.returns)
    current.avg_basket = current.transaction_count > 0 ? current.net_sales / current.transaction_count : 0
    salesByDate.set(row.date, current)
  }

  const rows = []
  for (let cursor = from; cursor <= to; cursor = shiftDays(cursor, 1)) {
    const current = salesByDate.get(cursor)
    if (!current) continue
    rows.push(current)
  }
  return rows
}

export function registerAnalyticsHandlers() {
  ipcMain.handle(IPC.ANALYTICS.GET_DASHBOARD, () => {
    const db = getDb()
    // Today in Manila (+8)
    const today = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as sales,
             COALESCE(SUM(
               (SELECT COALESCE(SUM((oi.price - oi.cost) * oi.quantity),0)
                FROM order_items oi WHERE oi.order_id = o.id)
             ), 0) as profit
      FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'completed'
        AND o.exclude_sales = 0
        AND DATE(o.created_at, '+8 hours') = DATE('now', '+8 hours')
    `).get() as any

    const totalProducts: any = db.prepare(`SELECT COUNT(*) as c FROM products WHERE deleted_at IS NULL AND is_active = 1`).get()

    const recentOrders = db.prepare(`
      SELECT o.id, o.order_number, o.total, o.created_at,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.deleted_at IS NULL
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT 7
    `).all()

    return {
      sales_today: today?.sales || 0,
      profit_today: today?.profit || 0,
      total_products: totalProducts?.c || 0,
      recent_orders: recentOrders,
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_REPORT, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const row: any = db.prepare(`
      SELECT
        COALESCE(SUM(o.total), 0) as total_sales,
        COALESCE(COUNT(o.id), 0) as order_count,
        COALESCE(AVG(o.total), 0) as avg_sale,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(oi.cost * oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id)
        ), 0) as total_cost
      FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at, '+8 hours') >= ? AND DATE(o.created_at, '+8 hours') <= ?
    `).get(from, to)

    const expenses: any = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE DATE(date) >= ? AND DATE(date) <= ?
    `).get(from, to)

    const returnAdjustments: any = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'refund' THEN amount ELSE 0 END), 0) as refund_amount,
        COALESCE(SUM(CASE WHEN event_type = 'refund' THEN cost_amount ELSE 0 END), 0) as refund_cost,
        COALESCE(SUM(CASE WHEN event_type = 'damage' THEN cost_amount ELSE 0 END), 0) as damage_cost
      FROM return_events
      WHERE DATE(created_at, '+8 hours') >= ? AND DATE(created_at, '+8 hours') <= ?
    `).get(from, to)

    const refundAmount = returnAdjustments?.refund_amount || 0
    const refundCost = returnAdjustments?.refund_cost || 0
    const damageCost = returnAdjustments?.damage_cost || 0
    const netSales = (row?.total_sales || 0) - refundAmount
    const netCost = (row?.total_cost || 0) - refundCost
    const net_profit = netSales - netCost
    const total_expenses = (expenses?.total_expenses || 0) + damageCost
    const net_income = net_profit - total_expenses

    const debt: any = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(balance),0) FROM debtors WHERE deleted_at IS NULL) as outstanding,
        COALESCE(SUM(CASE WHEN type='debt' THEN amount ELSE 0 END), 0) as added,
        COALESCE(SUM(CASE WHEN type='payment' THEN amount ELSE 0 END), 0) as paid
      FROM debtor_transactions
      WHERE DATE(created_at, '+8 hours') >= ? AND DATE(created_at, '+8 hours') <= ?
    `).get(from, to)

    return {
      total_sales: netSales,
      net_profit,
      net_income,
      total_cost: netCost,
      total_expenses,
      order_count: row?.order_count || 0,
      avg_sale: row?.avg_sale || 0,
      debt_outstanding: debt?.outstanding || 0,
      debt_added: debt?.added || 0,
      debt_paid: debt?.paid || 0,
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_DAILY, (_, days: number) => {
    const to = manilaDate()
    const from = shiftDays(to, -(Math.max(1, days) - 1))
    return getDailySeries(from, to).reverse()
  })

  ipcMain.handle(IPC.ANALYTICS.GET_CASHFLOW, (_, periodOrRange: AnalyticsRangeInput) => {
    const { from, to } = resolveDateRange(periodOrRange)
    return getDailySeries(from, to)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_HOURLY, (_, dateOrRange?: string | AnalyticsRangeInput) => {
    const db = getDb()
    const targetDate = typeof dateOrRange === 'string'
      ? dateOrRange
      : resolveDateRange(dateOrRange).to
    return db.prepare(`
      SELECT CAST(strftime('%H', o.created_at, '+8 hours') AS INTEGER) as hour,
             COUNT(o.id) as count
      FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'completed'
        AND DATE(o.created_at, '+8 hours') = ?
      GROUP BY hour ORDER BY hour
    `).all(targetDate)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_TOP_PRODUCTS, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    return db.prepare(`
      SELECT oi.product_id, p.name, p.image_path,
             COALESCE(SUM(oi.quantity), 0) as total_qty,
             COALESCE(SUM(oi.subtotal), 0) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at, '+8 hours') >= ? AND DATE(o.created_at, '+8 hours') <= ?
        AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
      ORDER BY total_revenue DESC LIMIT 10
    `).all(from, to)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_CATEGORIES, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const rows: any[] = db.prepare(`
      SELECT COALESCE(c.name, 'Uncategorized') as category_name,
             COALESCE(SUM(oi.subtotal), 0) as total
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at, '+8 hours') >= ? AND DATE(o.created_at, '+8 hours') <= ?
      GROUP BY category_name
      ORDER BY total DESC
    `).all(from, to)

    const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1
    return rows.map(r => ({ ...r, pct: Math.round((r.total / grandTotal) * 100) }))
  })

  ipcMain.handle(IPC.ANALYTICS.GET_FINANCIALS, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)

    const sales = getSalesSnapshot(db, from, to)

    const debtors: any = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as receivables,
        COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as total_paid
      FROM debtor_transactions
      WHERE DATE(created_at, '+8 hours') <= ?
    `).get(to)

    const debtorPayments: any = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as paid
      FROM debtor_transactions
      WHERE type = 'payment'
        AND DATE(created_at, '+8 hours') >= ?
        AND DATE(created_at, '+8 hours') <= ?
    `).get(from, to)

    const inventory: any = db.prepare(`
      SELECT
        COALESCE(SUM(i.quantity * p.base_cost), 0) as inventory_cost
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE p.deleted_at IS NULL
        AND p.is_active = 1
    `).get()

    const expensesResult: any = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE DATE(date) >= ? AND DATE(date) <= ?
    `).get(from, to)

    const returnAdjustments = getReturnSnapshot(db, from, to)

    const revenue = (sales?.total_sales || 0) - (returnAdjustments?.refund_amount || 0)
    const costOfGoodsSold = (sales?.total_cost || 0) - (returnAdjustments?.refund_cost || 0)
    const grossProfit = revenue - costOfGoodsSold
    const operatingExpenses = (expensesResult?.total_expenses || 0) + (returnAdjustments?.damage_cost || 0)
    const netIncome = grossProfit - operatingExpenses
    const cashOnHandEstimate = (sales?.cash_sales || 0) + (debtorPayments?.paid || 0)
    const accountsReceivable = debtors?.receivables || 0
    const inventoryCost = inventory?.inventory_cost || 0

    const trialBalanceLines = [
      { label: 'Cash Receipts (Estimated)', amount: cashOnHandEstimate, type: 'debit' as const },
      { label: 'Accounts Receivable', amount: accountsReceivable, type: 'debit' as const },
      { label: 'Inventory on Hand', amount: inventoryCost, type: 'debit' as const },
      { label: 'Cost of Goods Sold', amount: costOfGoodsSold, type: 'debit' as const },
      ...(operatingExpenses > 0 ? [{ label: 'Operating Expenses', amount: operatingExpenses, type: 'debit' as const }] : []),
      { label: 'Sales Revenue', amount: revenue, type: 'credit' as const },
    ]

    const debitTotal = trialBalanceLines
      .filter(line => line.type === 'debit')
      .reduce((sum, line) => sum + line.amount, 0)
    const creditTotal = trialBalanceLines
      .filter(line => line.type === 'credit')
      .reduce((sum, line) => sum + line.amount, 0)

    const imbalance = debitTotal - creditTotal
    let balancedLines = trialBalanceLines
    let balancedCredits = creditTotal
    let balancedDebits = debitTotal

    if (imbalance > 0) {
      // Debits exceed credits, add balancing credit
      balancedLines = [...trialBalanceLines, { label: 'Balancing Equity (Estimated)', amount: imbalance, type: 'credit' as const }]
      balancedCredits = creditTotal + imbalance
    } else if (imbalance < 0) {
      // Credits exceed debits, add balancing debit
      balancedLines = [...trialBalanceLines, { label: 'Balancing Equity (Estimated)', amount: -imbalance, type: 'debit' as const }]
      balancedDebits = debitTotal - imbalance
    }

    return {
      period: { from, to },
      profit_and_loss: {
        revenue,
        cost_of_goods_sold: costOfGoodsSold,
        gross_profit: grossProfit,
        net_profit: netIncome,
      },
      income_statement: {
        gross_sales: sales?.gross_sales || 0,
        discounts: sales?.total_discounts || 0,
        returns: returnAdjustments?.refund_amount || 0,
        net_sales: revenue,
        cost_of_sales: costOfGoodsSold,
        gross_income: grossProfit,
        operating_expenses: operatingExpenses,
        net_income: netIncome,
        note: operatingExpenses > 0
          ? 'Operating expenses are sourced from recorded expense entries for this period.'
          : 'No operating expenses recorded for this period.',
      },
      trial_balance: {
        lines: balancedLines,
        total_debits: balancedDebits,
        total_credits: balancedCredits,
        note: 'This is an operational estimate based on recorded sales, debtor balances, payments, and current inventory cost. Inventory valuation reflects present-day stock levels and costs, not historical values at period end. It is not a full accounting ledger.',
      },
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_EXPENSE_REPORT, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const rows = db.prepare(`
      SELECT id, category, description, amount, date
      FROM expenses
      WHERE DATE(date) >= ? AND DATE(date) <= ?
      ORDER BY DATE(date) DESC, created_at DESC
    `).all(from, to)
    const total = (rows as any[]).reduce((sum, row) => sum + (row.amount || 0), 0)
    return { period: { from, to }, rows, total }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_PAYMENTS_REPORT, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const rows: any[] = db.prepare(`
      SELECT
        dt.id,
        dt.created_at as date,
        d.name as customer_name,
        d.phone as customer_phone,
        dt.amount,
        dt.note,
        o.order_number
      FROM debtor_transactions dt
      JOIN debtors d ON d.id = dt.debtor_id
      LEFT JOIN orders o ON o.id = dt.order_id
      WHERE dt.type = 'payment'
        AND DATE(dt.created_at, '+8 hours') >= ?
        AND DATE(dt.created_at, '+8 hours') <= ?
      ORDER BY dt.created_at DESC
    `).all(from, to)

    return {
      period: { from, to },
      rows,
      total: rows.reduce((sum, row) => sum + row.amount, 0),
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_CUSTOMER_REPORT, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const rows = db.prepare(`
      SELECT
        d.id,
        d.name,
        d.phone,
        d.balance,
        d.total_credit,
        d.total_paid,
        COALESCE(SUM(CASE WHEN dt.type = 'debt' THEN dt.amount ELSE 0 END), 0) as period_credit,
        COALESCE(SUM(CASE WHEN dt.type = 'payment' THEN dt.amount ELSE 0 END), 0) as period_paid
      FROM debtors d
      LEFT JOIN debtor_transactions dt
        ON dt.debtor_id = d.id
        AND DATE(dt.created_at, '+8 hours') >= ?
        AND DATE(dt.created_at, '+8 hours') <= ?
      WHERE d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.balance DESC, d.name ASC
    `).all(from, to)
    return { period: { from, to }, rows }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_RETURN_REPORT, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    const rows = db.prepare(`
      SELECT
        re.*,
        o.order_number
      FROM return_events re
      JOIN orders o ON o.id = re.order_id
      WHERE DATE(re.created_at, '+8 hours') >= ?
        AND DATE(re.created_at, '+8 hours') <= ?
      ORDER BY re.created_at DESC
    `).all(from, to)

    return {
      period: { from, to },
      rows,
      refund_total: (rows as any[]).reduce((sum, row) => sum + (row.event_type === 'refund' ? row.amount : 0), 0),
      damage_total: (rows as any[]).reduce((sum, row) => sum + (row.event_type === 'damage' ? row.cost_amount : 0), 0),
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_Z_READING, (_, periodOrRange: AnalyticsRangeInput) => {
    const report = resolveDateRange(periodOrRange)
    const db = getDb()
    const sales = getSalesSnapshot(db, report.from, report.to)
    const returns = getReturnSnapshot(db, report.from, report.to)
    const creditPayments: any = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM debtor_transactions
      WHERE type = 'payment'
        AND DATE(created_at, '+8 hours') >= ?
        AND DATE(created_at, '+8 hours') <= ?
    `).get(report.from, report.to)

    return {
      period: report,
      receipt_count: sales?.receipt_count || 0,
      gross_sales: sales?.gross_sales || 0,
      discounts: sales?.total_discounts || 0,
      returns: returns?.refund_amount || 0,
      net_sales: (sales?.total_sales || 0) - (returns?.refund_amount || 0),
      cash_sales: sales?.cash_sales || 0,
      credit_sales: sales?.credit_sales || 0,
      credit_collections: creditPayments?.total || 0,
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_E_SALES, (_, periodOrRange: AnalyticsRangeInput) => {
    const { from, to } = resolveDateRange(periodOrRange)
    const db = getDb()
    const sales = getSalesSnapshot(db, from, to)
    const returns = getReturnSnapshot(db, from, to)
    const netSales = (sales?.total_sales || 0) - (returns?.refund_amount || 0)
    const dailyRows = getDailySalesSummary(db, from, to)

    return {
      period: { from, to },
      gross_sales: sales?.gross_sales || 0,
      total_discounts: sales?.total_discounts || 0,
      total_returns: returns?.refund_amount || 0,
      net_sales: netSales,
      transaction_count: sales?.receipt_count || 0,
      average_sale: (sales?.receipt_count || 0) > 0 ? netSales / sales.receipt_count : 0,
      cash_sales: sales?.cash_sales || 0,
      credit_sales: sales?.credit_sales || 0,
      daily_rows: dailyRows,
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_TOP_DEBTORS, () => {
    return getDb().prepare(`
      SELECT id, name, phone, balance
      FROM debtors
      WHERE deleted_at IS NULL AND balance > 0
      ORDER BY balance DESC LIMIT 10
    `).all()
  })

  ipcMain.handle(IPC.ANALYTICS.GET_SLOW_MOVING, (_, periodOrRange: AnalyticsRangeInput) => {
    const db = getDb()
    const { from, to } = resolveDateRange(periodOrRange)
    return db.prepare(`
      SELECT p.id, p.name, p.monthly_sold,
             COALESCE(SUM(oi.quantity), 0) as period_sold
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
        AND oi.order_id IN (
          SELECT id FROM orders
          WHERE deleted_at IS NULL AND status = 'completed' AND exclude_sales = 0
            AND DATE(created_at, '+8 hours') >= ? AND DATE(created_at, '+8 hours') <= ?
        )
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      GROUP BY p.id
      ORDER BY period_sold ASC, p.monthly_sold ASC
      LIMIT 10
    `).all(from, to)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_PAYMENT_BREAKDOWN, (_, days: number) => {
    const db = getDb()
    const rows: any[] = db.prepare(`
      SELECT DATE(o.created_at) as date, o.payment_breakdown
      FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at) >= DATE('now', ? || ' days')
      ORDER BY date
    `).all(`-${days}`)

    const byDate: Record<string, { cash: number; gcash: number; card: number; other: number }> = {}
    for (const row of rows) {
      const d = row.date
      if (!byDate[d]) byDate[d] = { cash: 0, gcash: 0, card: 0, other: 0 }
      let breakdown: any[] = []
      try { breakdown = JSON.parse(row.payment_breakdown || '[]') } catch { breakdown = [] }
      for (const entry of breakdown) {
        const m = (entry.method || 'cash').toLowerCase()
        const amt = entry.amount || 0
        if (m === 'gcash') byDate[d].gcash += amt
        else if (m === 'card') byDate[d].card += amt
        else if (m === 'other') byDate[d].other += amt
        else byDate[d].cash += amt
      }
    }
    return Object.entries(byDate).map(([date, v]) => ({ date, ...v }))
  })
}
