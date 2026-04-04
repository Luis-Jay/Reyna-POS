import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

function dateFilter(period: string): { from: string; to: string } {
  const now = new Date()
  if (period === 'today') {
    const d = now.toISOString().split('T')[0]
    return { from: d, to: d }
  }
  if (period === 'this_month') {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0')
    return { from: `${y}-${m}-01`, to: now.toISOString().split('T')[0] }
  }
  if (period === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const e = new Date(now.getFullYear(), now.getMonth(), 0)
    return {
      from: d.toISOString().split('T')[0],
      to: e.toISOString().split('T')[0],
    }
  }
  // default: this month
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: now.toISOString().split('T')[0] }
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

  ipcMain.handle(IPC.ANALYTICS.GET_REPORT, (_, period: string) => {
    const db = getDb()
    const { from, to } = dateFilter(period)
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
        AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
    `).get(from, to)

    const net_profit = (row?.total_sales || 0) - (row?.total_cost || 0)

    const debt: any = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(balance),0) FROM debtors WHERE deleted_at IS NULL) as outstanding,
        COALESCE(SUM(CASE WHEN type='debt' THEN amount ELSE 0 END), 0) as added,
        COALESCE(SUM(CASE WHEN type='payment' THEN amount ELSE 0 END), 0) as paid
      FROM debtor_transactions
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    `).get(from, to)

    return {
      total_sales: row?.total_sales || 0,
      net_profit,
      total_cost: row?.total_cost || 0,
      order_count: row?.order_count || 0,
      avg_sale: row?.avg_sale || 0,
      debt_outstanding: debt?.outstanding || 0,
      debt_added: debt?.added || 0,
      debt_paid: debt?.paid || 0,
    }
  })

  ipcMain.handle(IPC.ANALYTICS.GET_DAILY, (_, days: number) => {
    const db = getDb()
    return db.prepare(`
      SELECT DATE(o.created_at) as date,
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
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at) >= DATE('now', ? || ' days')
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
    `).all(`-${days}`)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_HOURLY, (_, date?: string) => {
    const db = getDb()
    const targetDate = date || new Date().toISOString().split('T')[0]
    return db.prepare(`
      SELECT CAST(strftime('%H', o.created_at, '+8 hours') AS INTEGER) as hour,
             COUNT(o.id) as count
      FROM orders o
      WHERE o.deleted_at IS NULL AND o.status = 'completed'
        AND DATE(o.created_at, '+8 hours') = ?
      GROUP BY hour ORDER BY hour
    `).all(targetDate)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_TOP_PRODUCTS, (_, period: string) => {
    const db = getDb()
    const { from, to } = dateFilter(period)
    return db.prepare(`
      SELECT oi.product_id, p.name, p.image_path,
             COALESCE(SUM(oi.quantity), 0) as total_qty,
             COALESCE(SUM(oi.subtotal), 0) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
        AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
      ORDER BY total_revenue DESC LIMIT 10
    `).all(from, to)
  })

  ipcMain.handle(IPC.ANALYTICS.GET_CATEGORIES, (_, period: string) => {
    const db = getDb()
    const { from, to } = dateFilter(period)
    const rows: any[] = db.prepare(`
      SELECT COALESCE(c.name, 'Uncategorized') as category_name,
             COALESCE(SUM(oi.subtotal), 0) as total
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE o.deleted_at IS NULL AND o.status = 'completed' AND o.exclude_sales = 0
        AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?
      GROUP BY category_name
      ORDER BY total DESC
    `).all(from, to)

    const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1
    return rows.map(r => ({ ...r, pct: Math.round((r.total / grandTotal) * 100) }))
  })
}
