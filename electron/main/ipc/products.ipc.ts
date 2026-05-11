import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { getCurrentProductImagesDir, getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'
import { addStockBatch, applyBatchPricing, getRemainingStockBatches } from '../services/stock-batches.service'

function normalizeImportKey(key: string) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildNormalizedRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeImportKey(key)
    if (!(normalizedKey in normalized)) normalized[normalizedKey] = value
  }
  return normalized
}

function getImportValue(row: Record<string, any>, normalizedRow: Record<string, any>, aliases: string[]) {
  for (const alias of aliases) {
    if (row[alias] !== undefined) return row[alias]
    const normalizedAlias = normalizeImportKey(alias)
    if (normalizedRow[normalizedAlias] !== undefined) return normalizedRow[normalizedAlias]
  }
  return undefined
}

function parseImportedNumber(value: any): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  let text = String(value).trim()
  if (!text) return null

  if (text.startsWith('=')) text = text.slice(1).trim()

  const isNegativeByParens = /^\(.*\)$/.test(text)
  text = text.replace(/[()]/g, '')
  text = text.replace(/[^0-9,.\-]/g, '')

  if (!text || text === '-' || text === '.' || text === ',') return null

  if (text.includes(',')) {
    if (text.includes('.')) {
      text = text.replace(/,/g, '')
    } else {
      const parts = text.split(',')
      const lastPart = parts[parts.length - 1]
      if (parts.length > 2 || (lastPart && lastPart.length === 3)) {
        text = parts.join('')
      } else {
        text = parts.join('.')
      }
    }
  }

  const parsed = Number.parseFloat(text)
  if (!Number.isFinite(parsed)) return null
  return isNegativeByParens ? -parsed : parsed
}

function withBatchDetails(db: ReturnType<typeof getDb>, row: any) {
  const priceTiers = getRemainingStockBatches(db, row.id).map(batch => ({
    id: batch.id,
    quantity: batch.remaining_quantity,
    unit_cost: batch.unit_cost,
    retail_price: batch.retail_price,
    wholesale_price: batch.wholesale_price,
    received_at: batch.received_at,
    note: batch.note,
    source_order_id: batch.source_order_id,
  }))

  return {
    ...applyBatchPricing(db, row),
    price_tiers: priceTiers,
    price_tier_count: priceTiers.length,
  }
}

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
    const rows = db.prepare(query).all(...params) as any[]
    return rows.map(row => withBatchDetails(db, row))
  })

  // GET BY ID
  ipcMain.handle(IPC.PRODUCTS.GET_BY_ID, (_, id: string) => {
    const db = getDb()
    const row = db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(id) as any
    return row ? withBatchDetails(db, row) : row
  })

  // GET BY BARCODE
  ipcMain.handle(IPC.PRODUCTS.GET_BY_BARCODE, (_, barcode: string) => {
    const db = getDb()
    const row = db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.barcode = ? AND p.deleted_at IS NULL
    `).get(barcode) as any
    return row ? withBatchDetails(db, row) : row
  })

  // SEARCH
  ipcMain.handle(IPC.PRODUCTS.SEARCH, (_, q: string) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
        AND (LOWER(p.name) LIKE LOWER(?) OR p.barcode = ?)
      ORDER BY p.sort_order, p.name LIMIT 20
    `).all(`%${q}%`, q) as any[]
    return rows.map(row => withBatchDetails(db, row))
  })

  // CREATE
  ipcMain.handle(IPC.PRODUCTS.CREATE, (_, data: any) => {
    const db = getDb()
    const id = uuid()
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO products (id, name, description, image_path, barcode, category_id,
          base_price, retail_price, wholesale_price, base_cost, markup_pct, has_variations, variation_group_id,
          allow_fractions, track_inventory, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description || null, data.image_path || null,
             data.barcode || null, data.category_id || null,
             data.retail_price ?? data.base_price ?? 0,
             data.retail_price ?? data.base_price ?? 0,
             data.wholesale_price ?? data.retail_price ?? data.base_price ?? 0,
             data.base_cost || 0,
             data.markup_pct != null ? data.markup_pct : null,
             data.has_variations ? 1 : 0, data.variation_group_id || null,
             data.allow_fractions ? 1 : 0, data.track_inventory !== false ? 1 : 0,
             data.sort_order || 0)

      // Init inventory record
      db.prepare(`INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`)
        .run(uuid(), id, data.initial_stock || 0)
      addStockBatch(db, id, {
        quantity: data.initial_stock || 0,
        unitCost: data.base_cost || 0,
        retailPrice: data.retail_price ?? data.base_price ?? 0,
        wholesalePrice: data.wholesale_price ?? data.retail_price ?? data.base_price ?? 0,
        note: 'Initial stock',
      })
    })
    tx()
    scheduleAutoSync()
    return { success: true, id }
  })

  // UPDATE
  ipcMain.handle(IPC.PRODUCTS.UPDATE, (_, id: string, data: any) => {
    const db = getDb()
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          image_path = COALESCE(?, image_path),
          barcode = ?,
          category_id = ?,
          base_price = COALESCE(?, base_price),
          retail_price = COALESCE(?, retail_price),
          wholesale_price = COALESCE(?, wholesale_price),
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
             data.retail_price ?? data.base_price,
             data.retail_price ?? data.base_price,
             data.wholesale_price,
             data.base_cost,
             data.markup_pct !== undefined ? data.markup_pct : null,
             data.has_variations != null ? (data.has_variations ? 1 : 0) : null,
             data.variation_group_id !== undefined ? data.variation_group_id : undefined,
             data.allow_fractions != null ? (data.allow_fractions ? 1 : 0) : null,
             data.track_inventory != null ? (data.track_inventory ? 1 : 0) : null,
             id)

      // Keep product defaults editable without rewriting historical stock batches.
      // New restocks should create their own batch with their own cost/prices.
    })
    tx()
    scheduleAutoSync()
    return { success: true }
  })

  // DELETE (soft)
  ipcMain.handle(IPC.PRODUCTS.DELETE, (_, id: string) => {
    getDb().prepare(`UPDATE products SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    scheduleAutoSync()
    return { success: true }
  })

  // BULK PRICES
  ipcMain.handle(IPC.PRODUCTS.BULK_PRICES, (_, updates: { id: string; price: number; markup_pct?: number }[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const u of updates) {
        db.prepare(`
          UPDATE products
          SET base_price = ?,
              retail_price = ?,
              markup_pct = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `)
          .run(u.price, u.price, u.markup_pct != null ? u.markup_pct : null, u.id)
      }
    })
    tx()
    scheduleAutoSync()
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
    scheduleAutoSync()
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
    scheduleAutoSync()
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
    scheduleAutoSync()
    return { success: true }
  })

  // IMPORT BATCH — accepts parsed rows from renderer (CSV or XLSX)
  ipcMain.handle(IPC.PRODUCTS.IMPORT_BATCH, (_, rows: any[]) => {
    const db = getDb()
    const existingCats: { id: string; name: string }[] = db.prepare(
      `SELECT id, name FROM categories WHERE deleted_at IS NULL`
    ).all() as any[]
    const existingGroups: { id: string; name: string }[] = db.prepare(
      `SELECT id, name FROM variation_groups WHERE deleted_at IS NULL`
    ).all() as any[]

    let created = 0
    let skipped = 0
    const errors: string[] = []

    const isTruthy = (v: any) => ['yes', '1', 'true'].includes(String(v ?? '').toLowerCase().trim())
    const isFalsy  = (v: any) => ['no',  '0', 'false'].includes(String(v ?? '').toLowerCase().trim())

    const tx = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const normalizedRow = buildNormalizedRow(row)
        const rowNum = i + 2

        const name = String(getImportValue(row, normalizedRow, ['name', 'product_name', 'item_name', 'product']) || '').trim()
        if (!name) {
          errors.push(`Row ${rowNum}: Name is required`)
          skipped++
          continue
        }

        const retailPriceRaw = getImportValue(row, normalizedRow, [
          'price',
          'retail_price',
          'retail price',
          'retailprice',
          'selling_price',
          'selling price',
          'srp',
          'base_price',
          'base price',
        ])
        const retailPrice = parseImportedNumber(retailPriceRaw)
        if (retailPrice == null || retailPrice < 0) {
          errors.push(`Row ${rowNum}: Invalid price for "${name}"`)
          skipped++
          continue
        }

        const wholesaleRaw = getImportValue(row, normalizedRow, [
          'wholesale_price',
          'wholesale price',
          'wholesale',
          'wholesaleprice',
          'bulk_price',
          'bulk price',
        ])
        const wholesaleParsed = parseImportedNumber(wholesaleRaw)
        const wholesalePrice = wholesaleParsed == null ? retailPrice : wholesaleParsed

        const costRaw = getImportValue(row, normalizedRow, [
          'cost',
          'Cost',
          'cost_price',
          'cost price',
          'base_cost',
          'base cost',
          'unit_cost',
          'unit cost',
        ])
        const cost = parseImportedNumber(costRaw) ?? 0

        const stockRaw = getImportValue(row, normalizedRow, [
          'stock',
          'Stock',
          'initial_stock',
          'initial stock',
          'quantity',
          'qty',
        ])
        const stock = Math.trunc(parseImportedNumber(stockRaw) ?? 0)
        const barcode = String(getImportValue(row, normalizedRow, ['barcode', 'Barcode', 'bar_code']) ?? '').trim() || null
        const description = String(getImportValue(row, normalizedRow, ['description', 'details']) ?? '').trim() || null
        const catName = String(getImportValue(row, normalizedRow, ['category', 'Category']) ?? '').trim()
        const allowFractions = isTruthy(getImportValue(row, normalizedRow, ['allow_fractions', 'allow fractions', 'weighted', 'by_weight'])) ? 1 : 0
        const trackInventory = isFalsy(getImportValue(row, normalizedRow, ['track_inventory', 'track inventory'])) ? 0 : 1
        const variationGroupName = String(getImportValue(row, normalizedRow, ['variation_group', 'variation group']) ?? '').trim()

        console.info('[products:importBatch] parsed row', {
          rowNum,
          rawRow: row,
          normalizedRow,
          mapped: {
            name,
            retailPriceRaw,
            retailPrice,
            wholesaleRaw,
            wholesalePrice,
            costRaw,
            cost,
            stockRaw,
            stock,
            barcode,
            catName,
            variationGroupName,
          },
        })

        // Category
        let categoryId: string | null = null
        if (catName) {
          const found = existingCats.find(c => c.name.toLowerCase() === catName.toLowerCase())
          if (found) {
            categoryId = found.id
          } else {
            const catId = uuid()
            db.prepare(`INSERT INTO categories (id, name) VALUES (?, ?)`).run(catId, catName)
            existingCats.push({ id: catId, name: catName })
            categoryId = catId
          }
        }

        // Variation group
        let variationGroupId: string | null = null
        let hasVariations = 0
        if (variationGroupName) {
          const found = existingGroups.find(g => g.name.toLowerCase() === variationGroupName.toLowerCase())
          if (found) {
            variationGroupId = found.id
          } else {
            const gid = uuid()
            db.prepare(`INSERT INTO variation_groups (id, name) VALUES (?, ?)`).run(gid, variationGroupName)
            existingGroups.push({ id: gid, name: variationGroupName })
            variationGroupId = gid
          }
          hasVariations = 1
        }

        // Price tiers (up to 3)
        const tiers: { min_qty: number; price: number; label: string | null }[] = []
        for (let t = 1; t <= 3; t++) {
          const minQty = parseImportedNumber(getImportValue(row, normalizedRow, [
            `tier${t}_min_qty`,
            `tier${t} min qty`,
            `tier${t}_minimum_qty`,
            `tier${t} minimum qty`,
          ]))
          const tierPrice = parseImportedNumber(getImportValue(row, normalizedRow, [
            `tier${t}_price`,
            `tier${t} price`,
          ]))
          if (minQty != null && tierPrice != null && minQty > 0) {
            tiers.push({
              min_qty: minQty,
              price: tierPrice,
              label: String(getImportValue(row, normalizedRow, [
                `tier${t}_label`,
                `tier${t} label`,
              ]) ?? '').trim() || null,
            })
          }
        }

        const id = uuid()
        db.prepare(`
          INSERT INTO products (id, name, description, barcode, category_id,
            base_price, retail_price, wholesale_price, base_cost,
            allow_fractions, track_inventory, has_variations, variation_group_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, description, barcode, categoryId,
               retailPrice, retailPrice, wholesalePrice, cost,
               allowFractions, trackInventory, hasVariations, variationGroupId)

        for (const tier of tiers) {
          db.prepare(`INSERT INTO product_price_tiers (id, product_id, min_qty, price, label) VALUES (?, ?, ?, ?, ?)`)
            .run(uuid(), id, tier.min_qty, tier.price, tier.label)
        }

        db.prepare(`INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`)
          .run(uuid(), id, stock)
        addStockBatch(db, id, {
          quantity: stock,
          unitCost: cost,
          retailPrice,
          wholesalePrice,
          note: 'Imported stock',
        })

        created++
      }
    })

    try {
      tx()
      scheduleAutoSync()
      return { success: true, created, skipped, errors }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // SAVE IMAGE
  ipcMain.handle(IPC.PRODUCTS.SAVE_IMAGE, (_, productId: string, dataUrl: string) => {
    try {
      const imagesDir = getCurrentProductImagesDir()

      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'jpg'
      const filename = `${productId}.${ext}`
      const filePath = path.join(imagesDir, filename)
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))

      getDb().prepare(`UPDATE products SET image_path = ?, image_url = NULL, image_uploaded = 0 WHERE id = ?`).run(filePath, productId)
      scheduleAutoSync()
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
