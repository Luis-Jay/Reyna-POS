import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

function generateOrderNumber(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function registerOrderHandlers() {
  // CREATE ORDER (main checkout flow)
  ipcMain.handle(IPC.ORDERS.CREATE, (_, orderData: any) => {
    const db = getDb()
    const orderId = uuid()
    const orderNumber = generateOrderNumber()

    const tx = db.transaction(() => {
      // Insert order
      db.prepare(`
        INSERT INTO orders (id, order_number, customer_name, status, subtotal, discount,
          total, payment_amount, change_amount, is_credit, debtor_id, user_id, note)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, orderNumber,
             orderData.customer_name || null,
             orderData.subtotal || 0,
             orderData.discount || 0,
             orderData.total,
             orderData.payment_amount || null,
             orderData.change_amount || null,
             orderData.is_credit ? 1 : 0,
             orderData.debtor_id || null,
             orderData.user_id || null,
             orderData.note || null)

      // Insert items + deduct inventory
      for (const item of orderData.items || []) {
        const itemId = uuid()
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, name, price, cost, quantity, subtotal, is_custom)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, orderId, item.product_id || null, item.name,
               item.price, item.cost || 0, item.quantity, item.subtotal, item.is_custom ? 1 : 0)

        // Deduct inventory if tracked
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
          // Update monthly_sold
          db.prepare(`UPDATE products SET monthly_sold = monthly_sold + ? WHERE id = ?`)
            .run(item.quantity, item.product_id)
        }
      }

      // If credit sale, update debtor balance
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

    const id = tx()
    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as any
    order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id)
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
    return db.prepare(query).all(...params)
  })

  // GET BY ID with items
  ipcMain.handle(IPC.ORDERS.GET_BY_ID, (_, id: string) => {
    const db = getDb()
    const order: any = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id)
    if (!order) return null
    order.items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id)
    return order
  })

  ipcMain.handle(IPC.ORDERS.UPDATE_STATUS, (_, id: string, status: string) => {
    getDb().prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, id)
    return { success: true }
  })

  ipcMain.handle(IPC.ORDERS.EXCLUDE_SALES, (_, id: string, exclude: boolean) => {
    getDb().prepare(`UPDATE orders SET exclude_sales = ? WHERE id = ?`).run(exclude ? 1 : 0, id)
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
