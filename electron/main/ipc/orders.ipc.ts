import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'

function mapOrder(order: any) {
  if (!order) return order
  if (order.payment_breakdown) {
    try {
      order.payment_breakdown = JSON.parse(order.payment_breakdown)
    } catch {
      order.payment_breakdown = []
    }
  } else {
    order.payment_breakdown = []
  }
  return order
}

function generateOrderNumber(db: ReturnType<typeof getDb>): string {
  const today = new Date()
  const datePart = today.getFullYear().toString().slice(2)
    + String(today.getMonth() + 1).padStart(2, '0')
    + String(today.getDate()).padStart(2, '0')
  const prefix = `${datePart}-`
  const row: any = db.prepare(
    `SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1`
  ).get(`${prefix}%`)
  const seq = row?.order_number && /^\d{6}-(\d+)$/.test(row.order_number)
    ? parseInt(row.order_number.split('-')[1], 10)
    : 0
  const last = Number.isFinite(seq) ? seq : 0
  return `${prefix}${String(last + 1).padStart(4, '0')}`
}

function isOrderNumberConflictError(err: unknown) {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed: orders.order_number')
}

export function registerOrderHandlers() {
  // CREATE ORDER (main checkout flow)
  ipcMain.handle(IPC.ORDERS.CREATE, (_, orderData: any) => {
    const db = getDb()
    const createOrderTx = db.transaction((orderId: string, orderNumber: string) => {
      db.prepare(`
        INSERT INTO orders (id, order_number, customer_name, status, subtotal, discount,
          total, payment_amount, change_amount, payment_breakdown, is_credit, debtor_id, user_id, note)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, orderNumber,
        orderData.customer_name || null,
        orderData.subtotal || 0,
        orderData.discount || 0,
        orderData.total,
        orderData.payment_amount || null,
        orderData.change_amount || null,
        JSON.stringify(orderData.payment_breakdown || []),
        orderData.is_credit ? 1 : 0,
        orderData.debtor_id || null,
        orderData.user_id || null,
        orderData.note || null)

      for (const item of orderData.items || []) {
        const itemId = uuid()
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, name, price, cost, quantity, subtotal, is_custom)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, orderId, item.product_id || null, item.name,
          item.price, item.cost || 0, item.quantity, item.subtotal, item.is_custom ? 1 : 0)

        if (item.product_id && !item.is_custom) {
          const inv: any = db.prepare(`SELECT * FROM inventory WHERE product_id = ?`).get(item.product_id)
          if (inv) {
            const newQty = Math.max(0, inv.quantity - item.quantity)
            db.prepare(`UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE product_id = ?`)
              .run(newQty, item.product_id)
            db.prepare(`
              INSERT INTO stock_movements (id, product_id, type, quantity, reference_id)
              VALUES (?, ?, 'sale', ?, ?)
            `).run(uuid(), item.product_id, -item.quantity, orderId)
          }
          db.prepare(`UPDATE products SET monthly_sold = monthly_sold + ? WHERE id = ?`)
            .run(item.quantity, item.product_id)
        }
      }

      if (orderData.is_credit && orderData.debtor_id) {
        const profit = (orderData.items || []).reduce((s: number, i: any) =>
          s + ((i.price - (i.cost || 0)) * i.quantity), 0)
        db.prepare(`UPDATE debtors SET balance = balance + ?, total_credit = total_credit + ? WHERE id = ?`)
          .run(orderData.total, orderData.total, orderData.debtor_id)
        db.prepare(`
          INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, order_id, user_id)
          VALUES (?, ?, 'debt', ?, ?, ?, ?)
        `).run(uuid(), orderData.debtor_id, orderData.total, profit, orderId, orderData.user_id || null)
      }

      return orderId
    })

    let id: string | null = null
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const orderId = uuid()
      const orderNumber = generateOrderNumber(db)
      try {
        id = createOrderTx.immediate(orderId, orderNumber)
        break
      } catch (err) {
        if (!isOrderNumberConflictError(err) || attempt === 5) {
          throw err
        }
        console.warn(`[orders] order_number conflict for ${orderNumber}, retrying (${attempt}/5)`)
      }
    }

    if (!id) {
      throw new Error('Failed to allocate a unique order number after multiple attempts')
    }

    const order = mapOrder(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as any)
    order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id)
    scheduleAutoSync()
    return { success: true, order }
  })

  // GET ALL with filters
  ipcMain.handle(IPC.ORDERS.GET_ALL, (_, filters?: any) => {
    const db = getDb()
    let query = `
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.deleted_at IS NULL
    `
    const params: any[] = []
    if (filters?.status)     { query += ` AND o.status = ?`;               params.push(filters.status) }
    if (filters?.date)       { query += ` AND DATE(o.created_at) = ?`;     params.push(filters.date) }
    if (filters?.date_from)  { query += ` AND DATE(o.created_at) >= ?`;    params.push(filters.date_from) }
    if (filters?.date_to)    { query += ` AND DATE(o.created_at) <= ?`;    params.push(filters.date_to) }
    if (filters?.search)     { query += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ?)`;
                                params.push(`%${filters.search}%`, `%${filters.search}%`) }
    if (filters?.today) {
      query += ` AND DATE(o.created_at, '+8 hours') = DATE('now', '+8 hours')`
    }
    query += ` GROUP BY o.id ORDER BY o.created_at DESC`
    if (filters?.limit) { query += ` LIMIT ?`; params.push(filters.limit) }
    return db.prepare(query).all(...params).map(mapOrder)
  })

  // PER-CASHIER SALES TODAY
  ipcMain.handle(IPC.ORDERS.GET_CASHIER_SALES_TODAY, () => {
    return getDb().prepare(`
      SELECT
        u.id   AS user_id,
        u.name AS cashier_name,
        COALESCE(SUM(CASE WHEN o.exclude_sales = 0 THEN 1 ELSE 0 END), 0) AS order_count,
        COALESCE(SUM(CASE WHEN o.is_credit = 0 AND o.exclude_sales = 0 THEN o.total ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN o.is_credit = 1 AND o.exclude_sales = 0 THEN o.total ELSE 0 END), 0) AS credit_sales,
        COALESCE(SUM(CASE WHEN o.exclude_sales = 0 THEN o.total ELSE 0 END), 0) AS total_sales
      FROM users u
      LEFT JOIN orders o
        ON o.user_id = u.id
        AND o.deleted_at IS NULL
        AND o.status != 'void'
        AND DATE(o.created_at, '+8 hours') = DATE('now', '+8 hours')
      WHERE u.is_active = 1 AND u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY total_sales DESC
    `).all()
  })

  // GET BY ID with items
  ipcMain.handle(IPC.ORDERS.GET_BY_ID, (_, id: string) => {
    const db = getDb()
    const order: any = mapOrder(db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id))
    if (!order) return null
    order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id)
    return order
  })

  ipcMain.handle(IPC.ORDERS.UPDATE_STATUS, (_, id: string, status: string) => {
    getDb().prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, id)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.ORDERS.EXCLUDE_SALES, (_, id: string, exclude: boolean) => {
    getDb().prepare(`UPDATE orders SET exclude_sales = ? WHERE id = ?`).run(exclude ? 1 : 0, id)
    scheduleAutoSync()
    return { success: true }
  })

  // SAVE CART FOR LATER
  ipcMain.handle(IPC.ORDERS.SAVE_CART, (_, data: any) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO saved_orders (id, name, items_json, total) VALUES (?, ?, ?, ?)`)
      .run(id, data.name, JSON.stringify(data.items), data.total)
    return { success: true, id }
  })

  ipcMain.handle(IPC.ORDERS.GET_SAVED, () => {
    return getDb().prepare(`SELECT * FROM saved_orders ORDER BY created_at DESC`).all()
  })

  ipcMain.handle(IPC.ORDERS.DELETE_SAVED, (_, id: string) => {
    getDb().prepare(`DELETE FROM saved_orders WHERE id = ?`).run(id)
    return { success: true }
  })

  // REFUND — void order + restore inventory + reverse debtor balance if credit
  ipcMain.handle(IPC.ORDERS.REFUND, (_, id: string) => {
    const db = getDb()
    const order: any = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id)
    if (!order) return { success: false, error: 'Order not found.' }
    if (order.status === 'void') return { success: false, error: 'Order is already voided.' }

    const items: any[] = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id)

    db.transaction(() => {
      // Mark order as void
      db.prepare(`UPDATE orders SET status = 'void', updated_at = datetime('now') WHERE id = ?`).run(id)

      // Restore inventory
      for (const item of items) {
        if (!item.product_id || item.is_custom) continue
        db.prepare(`UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE product_id = ?`)
          .run(item.quantity, item.product_id)
        db.prepare(`INSERT INTO stock_movements (id, product_id, type, quantity, reference_id, note) VALUES (?, ?, 'return', ?, ?, 'Refund')`)
          .run(uuid(), item.product_id, item.quantity, id)
        db.prepare(`UPDATE products SET monthly_sold = MAX(0, monthly_sold - ?) WHERE id = ?`)
          .run(item.quantity, item.product_id)
      }

      // Reverse debtor balance if credit order
      if (order.is_credit && order.debtor_id) {
        db.prepare(`UPDATE debtors SET balance = MAX(0, balance - ?), total_credit = MAX(0, total_credit - ?) WHERE id = ?`)
          .run(order.total, order.total, order.debtor_id)
        db.prepare(`INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, order_id, note) VALUES (?, ?, 'note', 0, 0, ?, 'Order refunded/voided')`)
          .run(uuid(), order.debtor_id, id)
      }
    })()

    scheduleAutoSync()
    return { success: true }
  })

  // PARTIAL REFUND — refund selected items at specified quantities
  ipcMain.handle(IPC.ORDERS.PARTIAL_REFUND, (_, orderId: string, refundItems: Array<{ item_id: string; qty: number; amount: number }>) => {
    const db = getDb()
    const order: any = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId)
    if (!order) return { success: false, error: 'Order not found.' }
    if (order.status === 'void') return { success: false, error: 'Order is already voided.' }

    const allItems: any[] = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId)

    // Determine if this is a full refund (all items at full qty)
    const isFullRefund = refundItems.length === allItems.length &&
      refundItems.every(ri => {
        const orig = allItems.find((i: any) => i.id === ri.item_id)
        return orig && ri.qty >= orig.quantity
      })

    const refundTotal = refundItems.reduce((s, ri) => s + ri.amount, 0)

    db.transaction(() => {
      // Restore inventory for each refunded item
      for (const ri of refundItems) {
        const item = allItems.find((i: any) => i.id === ri.item_id)
        if (!item || item.is_custom || !item.product_id) continue
        db.prepare(`UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE product_id = ?`)
          .run(ri.qty, item.product_id)
        db.prepare(`INSERT INTO stock_movements (id, product_id, type, quantity, reference_id, note) VALUES (?, ?, 'return', ?, ?, ?)`)
          .run(uuid(), item.product_id, ri.qty, orderId, isFullRefund ? 'Full refund' : 'Partial refund')
        db.prepare(`UPDATE products SET monthly_sold = MAX(0, monthly_sold - ?) WHERE id = ?`)
          .run(ri.qty, item.product_id)
      }

      if (isFullRefund) {
        db.prepare(`UPDATE orders SET status = 'void', updated_at = datetime('now') WHERE id = ?`).run(orderId)
        if (order.is_credit && order.debtor_id) {
          db.prepare(`UPDATE debtors SET balance = MAX(0, balance - ?), total_credit = MAX(0, total_credit - ?) WHERE id = ?`)
            .run(order.total, order.total, order.debtor_id)
          db.prepare(`INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, order_id, note) VALUES (?, ?, 'note', 0, 0, ?, 'Order fully refunded/voided')`)
            .run(uuid(), order.debtor_id, orderId)
        }
      } else {
        // Partial — append a note, reverse partial debtor balance if credit
        const noteAppend = `Partial refund ₱${refundTotal.toFixed(2)} (${refundItems.length} item${refundItems.length > 1 ? 's' : ''})`
        db.prepare(`UPDATE orders SET note = COALESCE(NULLIF(note,'') || ' | ', '') || ?, updated_at = datetime('now') WHERE id = ?`)
          .run(noteAppend, orderId)
        if (order.is_credit && order.debtor_id) {
          db.prepare(`UPDATE debtors SET balance = MAX(0, balance - ?), total_credit = MAX(0, total_credit - ?) WHERE id = ?`)
            .run(refundTotal, refundTotal, order.debtor_id)
          db.prepare(`INSERT INTO debtor_transactions (id, debtor_id, type, amount, profit, order_id, note) VALUES (?, ?, 'note', 0, 0, ?, ?)`)
            .run(uuid(), order.debtor_id, orderId, `Partial refund: ₱${refundTotal.toFixed(2)}`)
        }
      }
    })()

    scheduleAutoSync()
    return { success: true, is_full: isFullRefund, refund_total: refundTotal }
  })

  ipcMain.handle(IPC.ORDERS.GET_PENDING, () => {
    return getDb().prepare(`
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = 'pending' AND o.deleted_at IS NULL
      GROUP BY o.id ORDER BY o.created_at DESC
    `).all()
  })
}
