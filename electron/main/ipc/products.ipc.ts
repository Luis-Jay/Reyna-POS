import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerProductHandlers() {
  // GET ALL with optional filters
  ipcMain.handle(IPC.PRODUCTS.GET_ALL, (_, filters?: { category?: string; letter?: string; search?: string }) => {
    const db = getDb()
    let query = `
      SELECT p.*, c.name as category_name, i.quantity as stock,
             vg.name as variation_group_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN variation_groups vg ON p.variation_group_id = vg.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
    `
    const params: any[] = []
    if (filters?.category) { query += ` AND p.category_id = ?`; params.push(filters.category) }
    if (filters?.letter)   { query += ` AND UPPER(SUBSTR(p.name,1,1)) = ?`; params.push(filters.letter.toUpperCase()) }
    if (filters?.search)   { query += ` AND (p.name LIKE ? OR p.barcode = ?)`; params.push(`%${filters.search}%`, filters.search) }
    query += ` ORDER BY p.sort_order, p.name`
    return db.prepare(query).all(...params)
  })

  // GET BY ID
  ipcMain.handle(IPC.PRODUCTS.GET_BY_ID, (_, id: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(id)
  })

  // GET BY BARCODE
  ipcMain.handle(IPC.PRODUCTS.GET_BY_BARCODE, (_, barcode: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.barcode = ? AND p.deleted_at IS NULL
    `).get(barcode)
  })

  // SEARCH
  ipcMain.handle(IPC.PRODUCTS.SEARCH, (_, q: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
        AND (LOWER(p.name) LIKE LOWER(?) OR p.barcode = ?)
      ORDER BY p.sort_order, p.name LIMIT 20
    `).all(`%${q}%`, q)
  })

  // CREATE
  ipcMain.handle(IPC.PRODUCTS.CREATE, (_, data: any) => {
    const db = getDb()
    const id = uuid()
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO products (id, name, description, image_path, barcode, category_id,
          base_price, base_cost, markup_pct, has_variations, variation_group_id,
          allow_fractions, track_inventory, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.image_path || null,
             data.barcode || null, data.category_id || null,
             data.base_price || 0, data.base_cost || 0,
             data.markup_pct != null ? data.markup_pct : null,
             data.has_variations ? 1 : 0, data.variation_group_id || null,
             data.allow_fractions ? 1 : 0, data.track_inventory !== false ? 1 : 0,
             data.sort_order || 0)

      // Init inventory record
      db.prepare(`INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`)
        .run(uuid(), id, data.initial_stock || 0)
    })
    tx()
    return { success: true, id }
  })

  // UPDATE
  ipcMain.handle(IPC.PRODUCTS.UPDATE, (_, id: string, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        image_path = COALESCE(?, image_path),
        barcode = ?,
        category_id = ?,
        base_price = COALESCE(?, base_price),
        base_cost = COALESCE(?, base_cost),
        markup_pct = ?,
        has_variations = COALESCE(?, has_variations),
        variation_group_id = ?,
        allow_fractions = COALESCE(?, allow_fractions),
        track_inventory = COALESCE(?, track_inventory),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(data.name, data.description, data.image_path,
           data.barcode !== undefined ? data.barcode : undefined,
           data.category_id !== undefined ? data.category_id : undefined,
           data.base_price, data.base_cost,
           data.markup_pct !== undefined ? data.markup_pct : null,
           data.has_variations != null ? (data.has_variations ? 1 : 0) : null,
           data.variation_group_id !== undefined ? data.variation_group_id : undefined,
           data.allow_fractions != null ? (data.allow_fractions ? 1 : 0) : null,
           data.track_inventory != null ? (data.track_inventory ? 1 : 0) : null,
           id)
    return { success: true }
  })

  // DELETE (soft)
  ipcMain.handle(IPC.PRODUCTS.DELETE, (_, id: string) => {
    getDb().prepare(`UPDATE products SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    return { success: true }
  })

  // BULK PRICES
  ipcMain.handle(IPC.PRODUCTS.BULK_PRICES, (_, updates: { id: string; price: number; markup_pct?: number }[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const u of updates) {
        db.prepare(`UPDATE products SET base_price = ?, markup_pct = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(u.price, u.markup_pct != null ? u.markup_pct : null, u.id)
      }
    })
    tx()
    return { success: true }
  })

  // BULK NAMES
  ipcMain.handle(IPC.PRODUCTS.BULK_NAMES, (_, updates: { id: string; name: string }[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const u of updates) {
        db.prepare(`UPDATE products SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(u.name, u.id)
      }
    })
    tx()
    return { success: true }
  })

  // BULK BARCODES
  ipcMain.handle(IPC.PRODUCTS.BULK_BARCODES, (_, updates: { id: string; barcode: string }[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const u of updates) {
        db.prepare(`UPDATE products SET barcode = ?, updated_at = datetime('now') WHERE id = ?`).run(u.barcode || null, u.id)
      }
    })
    tx()
    return { success: true }
  })

  // BULK COSTS
  ipcMain.handle(IPC.PRODUCTS.BULK_COSTS, (_, updates: { id: string; cost: number }[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const u of updates) {
        db.prepare(`UPDATE products SET base_cost = ?, updated_at = datetime('now') WHERE id = ?`).run(u.cost, u.id)
      }
    })
    tx()
    return { success: true }
  })

  // SAVE IMAGE
  ipcMain.handle(IPC.PRODUCTS.SAVE_IMAGE, (_, productId: string, dataUrl: string) => {
    try {
      const imagesDir = path.join(app.getPath('userData'), 'product-images')
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })

      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'jpg'
      const filename = `${productId}.${ext}`
      const filePath = path.join(imagesDir, filename)
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))

      getDb().prepare(`UPDATE products SET image_path = ? WHERE id = ?`).run(filePath, productId)
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
