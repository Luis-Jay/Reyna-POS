import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'
import { localDb, LocalProduct } from '../local-db'
import {
  assertBasicProductAccessible,
  assertBasicProductCreationAllowed,
  ensureBasicProductAccess,
} from './basic-product-access'
import { assertProAccess, getProAccessState } from './pro-access'

function asNumber(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseImportNumber(value: any, fallback?: number) {
  if (value == null) return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '').replace(/[₱$]/g, '')
    if (!cleaned) return fallback
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function parseImportBoolean(value: any, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return fallback
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  }
  return fallback
}

function asTrimmedString(value: any) {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeLookupKey(value: any) {
  return asTrimmedString(value).toLowerCase()
}

function uniqueNameMap(rows: any[]) {
  const counts = new Map<string, number>()
  const ids = new Map<string, string>()

  for (const row of rows ?? []) {
    const key = normalizeLookupKey(row.name)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
    ids.set(key, row.id)
  }

  const map = new Map<string, string>()
  for (const [key, count] of counts.entries()) {
    if (count === 1) map.set(key, ids.get(key)!)
  }
  return map
}

async function replacePriceTiers(
  businessId: string,
  productId: string,
  tiers: { min_qty: number; price: number; label?: string | null }[],
) {
  if (tiers.length > 0) {
    await assertProAccess('Price tiers are available on Reyna Pro only.')
  }

  const { error: deleteError } = await supabase
    .from('price_tiers')
    .delete()
    .eq('business_id', businessId)
    .eq('product_id', productId)
  assertNoError(deleteError, 'Failed to clear price tiers.')

  if (tiers.length === 0) return

  const { error: insertError } = await supabase
    .from('price_tiers')
    .insert(
      tiers.map((tier) => ({
        business_id: businessId,
        product_id: productId,
        min_qty: tier.min_qty,
        price: tier.price,
        label: tier.label || null,
      })),
    )
  assertNoError(insertError, 'Failed to save price tiers.')
}

function toImagePath(p: any) {
  if (typeof p.image_path === 'string' && p.image_path.trim()) return p.image_path
  if (typeof p.image_url === 'string' && p.image_url.trim()) return p.image_url
  if (typeof p.image_data === 'string' && p.image_data.trim()) return p.image_data
  return null
}

function assertNoError(error: any, fallbackMessage: string) {
  if (error) {
    throw new Error(error.message || fallbackMessage)
  }
}

function mapProduct(p: any) {
  return {
    ...p,
    // Normalize Supabase column names to match local SQLite shape
    image_path: toImagePath(p),
    base_price: asNumber(p.base_price),
    retail_price: asNumber(p.retail_price, asNumber(p.base_price)),
    wholesale_price: p.wholesale_price == null ? null : asNumber(p.wholesale_price),
    base_cost: asNumber(p.base_cost),
    markup_pct: p.markup_pct == null ? null : asNumber(p.markup_pct),
    monthly_sold: asNumber(p.monthly_sold),
    sort_order: asNumber(p.sort_order),
    has_variations: p.has_variations ? 1 : 0,
    allow_fractions: p.allow_fractions ? 1 : 0,
    track_inventory: p.track_inventory ? 1 : 0,
    is_active: p.is_active ? 1 : 0,
    basic_locked: p.basic_locked ? 1 : 0,
    // Join data from catalog_inventory
    stock: p.catalog_inventory?.[0]?.quantity == null ? null : asNumber(p.catalog_inventory[0].quantity),
  }
}

async function fetchInventoryMap(businessId: string): Promise<Record<string, number>> {
  try {
    const { data } = await supabase
      .from('catalog_inventory')
      .select('product_id, quantity')
      .eq('business_id', businessId)
      .limit(10000)
    const map: Record<string, number> = {}
    for (const row of data ?? []) map[row.product_id] = row.quantity
    return map
  } catch {
    return {}
  }
}

function buildLocalProductResult(p: LocalProduct) {
  return {
    ...p,
    image_path: p.image_url,
    has_variations: p.has_variations,
    allow_fractions: p.allow_fractions,
    track_inventory: p.track_inventory,
    is_active: p.is_active,
    basic_locked: p.basic_locked,
    variation_group_name: null,
  }
}

export const productsApi = {
  getAll: async (filters?: { category?: string; letter?: string; search?: string }) => {
    try {
      const businessId = await getBusinessId()
      const access = await ensureBasicProductAccess(businessId)
      // image_url is safe to include now that images are in Storage (short URL, not base64)
      let query = supabase
        .from('catalog_products')
        .select('id, name, description, image_url, barcode, category_id, base_price, retail_price, wholesale_price, base_cost, markup_pct, has_variations, variation_group_id, allow_fractions, track_inventory, is_active, sort_order, monthly_sold, basic_locked, updated_at, deleted_at, catalog_categories(name), catalog_variation_groups(name)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
        .limit(10000)
      if (!access.activated) query = query.eq('basic_locked', false)

      if (filters?.category) query = query.eq('category_id', filters.category)
      if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,barcode.eq.${filters.search}`)
      if (filters?.letter) query = query.ilike('name', `${filters.letter}%`)

      const [{ data, error }, invMap] = await Promise.all([query, fetchInventoryMap(businessId)])
      assertNoError(error, 'Failed to load products.')
      const results = (data ?? []).map((p: any) => ({
        ...mapProduct({ ...p, catalog_inventory: invMap[p.id] != null ? [{ quantity: invMap[p.id] }] : [] }),
        category_name: p.catalog_categories?.name ?? null,
        variation_group_name: p.catalog_variation_groups?.name ?? null,
      }))

      // Update local cache (fire and forget)
      void localDb.products.bulkPut(results.map(p => ({
        id: p.id,
        business_id: businessId,
        name: p.name,
        description: p.description ?? null,
        image_url: p.image_path ?? null,
        barcode: p.barcode ?? null,
        category_id: p.category_id ?? null,
        base_price: asNumber(p.base_price),
        retail_price: asNumber(p.retail_price),
        wholesale_price: p.wholesale_price == null ? null : asNumber(p.wholesale_price),
        base_cost: asNumber(p.base_cost),
        markup_pct: p.markup_pct == null ? null : asNumber(p.markup_pct),
        has_variations: p.has_variations ? 1 : 0,
        variation_group_id: p.variation_group_id ?? null,
        allow_fractions: p.allow_fractions ? 1 : 0,
        track_inventory: p.track_inventory ? 1 : 0,
        is_active: p.is_active ? 1 : 0,
        sort_order: asNumber(p.sort_order),
        monthly_sold: asNumber(p.monthly_sold),
        basic_locked: asNumber(p.basic_locked),
        updated_at: (p as any).updated_at ?? new Date().toISOString(),
        deleted_at: (p as any).deleted_at ?? null,
        stock: p.stock ?? null,
        category_name: p.category_name ?? null,
      } satisfies LocalProduct)))

      return results
    } catch {
      // Offline fallback: serve from IndexedDB cache
      try {
        const businessId = localStorage.getItem('reyna_business_id')
        if (!businessId) return []
        let cached = await localDb.products
          .where('business_id').equals(businessId)
          .filter(p => !p.deleted_at && p.is_active === 1 && p.basic_locked !== 1)
          .toArray()

        if (filters?.category) cached = cached.filter(p => p.category_id === filters.category)
        if (filters?.search) {
          const q = filters.search.toLowerCase()
          cached = cached.filter(p => p.name.toLowerCase().includes(q) || p.barcode === filters.search)
        }
        if (filters?.letter) cached = cached.filter(p => p.name.toLowerCase().startsWith(filters.letter!.toLowerCase()))

        cached.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
        return cached.map(buildLocalProductResult)
      } catch {
        return []
      }
    }
  },

  getById: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const access = await ensureBasicProductAccess(businessId)
      const [{ data, error }, invMap] = await Promise.all([
        (() => {
          let query = supabase.from('catalog_products').select('*, catalog_categories(name)').eq('id', id).eq('business_id', businessId).is('deleted_at', null)
          if (!access.activated) query = query.eq('basic_locked', false)
          return query.single()
        })(),
        fetchInventoryMap(businessId),
      ])
      if (error) throw error
      return { ...mapProduct({ ...data, catalog_inventory: invMap[id] != null ? [{ quantity: invMap[id] }] : [] }), category_name: data.catalog_categories?.name ?? null }
    } catch {
      return null
    }
  },

  getByBarcode: async (barcode: string) => {
    try {
      const businessId = await getBusinessId()
      const access = await ensureBasicProductAccess(businessId)
      let query = supabase
        .from('catalog_products')
        .select('*, catalog_categories(name)')
        .eq('barcode', barcode)
        .eq('business_id', businessId)
        .is('deleted_at', null)
      if (!access.activated) query = query.eq('basic_locked', false)
      const { data, error } = await query.single()
      if (error) throw error
      const { data: inv } = await supabase.from('catalog_inventory').select('quantity').eq('product_id', data.id).eq('business_id', businessId).single()
      return { ...mapProduct({ ...data, catalog_inventory: inv ? [inv] : [] }), category_name: data.catalog_categories?.name ?? null }
    } catch {
      // Offline fallback
      try {
        const businessId = localStorage.getItem('reyna_business_id')
        if (!businessId) return null
        const cached = await localDb.products.where('business_id').equals(businessId).filter(p => p.barcode === barcode && !p.deleted_at && p.basic_locked !== 1).first()
        return cached ? buildLocalProductResult(cached) : null
      } catch {
        return null
      }
    }
  },

  search: async (q: string) => {
    try {
      const businessId = await getBusinessId()
      const access = await ensureBasicProductAccess(businessId)
      const [{ data, error }, invMap] = await Promise.all([
        (() => {
          let query = supabase
            .from('catalog_products')
            .select('id, name, description, image_url, barcode, category_id, base_price, retail_price, wholesale_price, base_cost, markup_pct, has_variations, variation_group_id, allow_fractions, track_inventory, is_active, sort_order, monthly_sold, basic_locked, updated_at, deleted_at, catalog_categories(name)')
            .eq('business_id', businessId)
            .is('deleted_at', null)
            .eq('is_active', true)
            .or(`name.ilike.%${q}%,barcode.eq.${q}`)
            .order('sort_order')
            .order('name')
            .limit(20)
          if (!access.activated) query = query.eq('basic_locked', false)
          return query
        })(),
        fetchInventoryMap(businessId),
      ])
      assertNoError(error, 'Failed to search products.')
      return (data ?? []).map((p: any) => ({ ...mapProduct({ ...p, catalog_inventory: invMap[p.id] != null ? [{ quantity: invMap[p.id] }] : [] }), category_name: p.catalog_categories?.name ?? null }))
    } catch {
      // Offline fallback
      try {
        const businessId = localStorage.getItem('reyna_business_id')
        if (!businessId) return []
        const ql = q.toLowerCase()
        const cached = await localDb.products
          .where('business_id').equals(businessId)
          .filter(p => !p.deleted_at && p.is_active === 1 && p.basic_locked !== 1 && (p.name.toLowerCase().includes(ql) || p.barcode === q))
          .toArray()
        cached.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
        return cached.slice(0, 20).map(buildLocalProductResult)
      } catch {
        return []
      }
    }
  },

  create: async (data: any) => {
    try {
      const businessId = await getBusinessId()
      await assertBasicProductCreationAllowed(businessId)
      const id = uuid()
      const imagePath = typeof data.image_path === 'string' && data.image_path.trim() ? data.image_path : null
      const initialStock = asNumber(data.initial_stock)
      const { error } = await supabase.from('catalog_products').insert({
        id, business_id: businessId,
        name: data.name,
        description: data.description || null,
        image_url: imagePath,
        barcode: data.barcode || null,
        category_id: data.category_id || null,
        base_price: asNumber(data.base_price ?? data.retail_price),
        retail_price: asNumber(data.retail_price ?? data.base_price),
        wholesale_price: data.wholesale_price == null ? null : asNumber(data.wholesale_price),
        base_cost: asNumber(data.base_cost),
        markup_pct: data.markup_pct ?? null,
        has_variations: !!data.has_variations,
        variation_group_id: data.variation_group_id || null,
        allow_fractions: !!data.allow_fractions,
        track_inventory: data.track_inventory !== 0,
        sort_order: data.sort_order ?? 0,
        basic_locked: false,
      })
      assertNoError(error, 'Failed to create product.')

      // Create matching inventory row
      const { error: inventoryError } = await supabase.from('catalog_inventory').insert({
        id: uuid(),
        business_id: businessId,
        product_id: id,
        quantity: initialStock,
        low_threshold: 5,
      })
      assertNoError(inventoryError, 'Failed to create product inventory.')

      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  update: async (id: string, data: any) => {
    try {
      const businessId = await getBusinessId()
      await assertBasicProductAccessible(businessId, id)
      const updates: any = { updated_at: new Date().toISOString() }
      const fields = [
        'name','description','barcode','category_id','base_price','retail_price',
        'wholesale_price','base_cost','markup_pct','has_variations','variation_group_id',
        'allow_fractions','track_inventory','sort_order',
      ]
      for (const f of fields) {
        if (f in data) {
          if (f === 'has_variations' || f === 'allow_fractions' || f === 'track_inventory') {
            updates[f] = !!data[f]
          } else if (['base_price', 'retail_price', 'wholesale_price', 'base_cost', 'markup_pct', 'sort_order'].includes(f)) {
            updates[f] = data[f] == null ? null : asNumber(data[f])
          } else {
            updates[f] = data[f]
          }
        }
      }
      if ('image_path' in data) {
        const imagePath = typeof data.image_path === 'string' && data.image_path.trim() ? data.image_path : null
        updates.image_url = imagePath
      }
      if ('is_active' in data) updates['is_active'] = !!data.is_active

      const { error } = await supabase
        .from('catalog_products')
        .update(updates)
        .eq('id', id)
        .eq('business_id', businessId)

      assertNoError(error, 'Failed to update product.')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await assertBasicProductAccessible(businessId, id)
      const { data, error } = await supabase
        .from('catalog_products')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
        .eq('business_id', businessId)
        .select('id')
      assertNoError(error, 'Failed to delete product.')
      if (!data || data.length === 0) throw new Error('Product not found or already deleted.')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  bulkPrices: async (updates: { id: string; price?: number; retail_price?: number; wholesale_price?: number; base_price?: number; markup_pct?: number | null }[]) => {
    try {
      await assertProAccess('Bulk price management is available on Reyna Pro only.')
      const businessId = await getBusinessId()
      for (const update of updates) await assertBasicProductAccessible(businessId, update.id)
      await Promise.all(updates.map(async u => {
        const patch: any = { updated_at: new Date().toISOString() }
        const nextPrice = u.price ?? u.retail_price ?? u.base_price
        if (nextPrice !== undefined) {
          patch.retail_price = asNumber(nextPrice)
          patch.base_price = asNumber(nextPrice)
        }
        if (u.wholesale_price !== undefined) patch.wholesale_price = u.wholesale_price == null ? null : asNumber(u.wholesale_price)
        if (u.markup_pct !== undefined) patch.markup_pct = u.markup_pct == null ? null : asNumber(u.markup_pct)
        const { error } = await supabase.from('catalog_products').update(patch).eq('id', u.id).eq('business_id', businessId)
        assertNoError(error, 'Failed to update product prices.')
      }))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  bulkNames: async (updates: { id: string; name: string }[]) => {
    try {
      const businessId = await getBusinessId()
      for (const update of updates) await assertBasicProductAccessible(businessId, update.id)
      await Promise.all(updates.map(async u => {
        const { error } = await supabase
          .from('catalog_products')
          .update({ name: u.name, updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
        assertNoError(error, 'Failed to update product name.')
      }))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  bulkBarcodes: async (updates: { id: string; barcode: string }[]) => {
    try {
      const businessId = await getBusinessId()
      for (const update of updates) await assertBasicProductAccessible(businessId, update.id)
      await Promise.all(updates.map(async u => {
        const { error } = await supabase
          .from('catalog_products')
          .update({ barcode: u.barcode, updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
        assertNoError(error, 'Failed to update barcode.')
      }))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  bulkCosts: async (updates: { id: string; cost?: number; base_cost?: number }[]) => {
    try {
      await assertProAccess('Bulk price management is available on Reyna Pro only.')
      const businessId = await getBusinessId()
      for (const update of updates) await assertBasicProductAccessible(businessId, update.id)
      await Promise.all(updates.map(async u => {
        const { error } = await supabase
          .from('catalog_products')
          .update({ base_cost: asNumber(u.cost ?? u.base_cost), updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
        assertNoError(error, 'Failed to update product cost.')
      }))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  saveImage: async (productId: string, dataUrl: string) => {
    try {
      const businessId = await getBusinessId()
      await assertBasicProductAccessible(businessId, productId)

      if (!dataUrl || !dataUrl.startsWith('data:')) {
        throw new Error('Invalid image data.')
      }

      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
      if (!match) throw new Error('Invalid image data URL format.')
      const [, mimeType, base64] = match
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
      const path = `${businessId}/${productId}.${ext}`

      // Convert base64 to Blob and upload to Storage
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: mimeType })

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, blob, { contentType: mimeType, upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('catalog_products')
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', productId)
        .eq('business_id', businessId)

      if (updateError) throw new Error(updateError.message)

      return { success: true, path: publicUrl }
    } catch (err: any) {
      console.error('[saveImage]', err)
      return { success: false, error: err?.message || 'Failed to save image.' }
    }
  },

  importBatch: async (rows: any[], onProgress?: (done: number, total: number) => void) => {
    try {
      const businessId = await getBusinessId()
      await assertBasicProductCreationAllowed(businessId)
      const proAccess = await getProAccessState()
      const [
        { data: existingProducts, error: productsError },
        { data: existingCategories, error: categoriesError },
        { data: existingGroups, error: groupsError },
        { data: existingInventory, error: inventoryFetchError },
      ] = await Promise.all([
        supabase.from('catalog_products').select('id, name, barcode').eq('business_id', businessId).is('deleted_at', null),
        supabase.from('catalog_categories').select('id, name').eq('business_id', businessId).is('deleted_at', null),
        supabase.from('catalog_variation_groups').select('id, name').eq('business_id', businessId).is('deleted_at', null),
        supabase.from('catalog_inventory').select('id, product_id').eq('business_id', businessId),
      ])
      assertNoError(productsError, 'Failed to load existing products.')
      assertNoError(categoriesError, 'Failed to load categories.')
      assertNoError(groupsError, 'Failed to load variation groups.')
      assertNoError(inventoryFetchError, 'Failed to load inventory.')

      // Map product_id → inventory row id so we can UPDATE existing rows
      // instead of upserting with a new random id (which would change the PK).
      const inventoryIdByProductId = new Map<string, string>(
        (existingInventory ?? []).map((inv: any) => [inv.product_id, inv.id] as [string, string])
      )

      const categoryMap = new Map((existingCategories ?? []).map((row: any) => [normalizeLookupKey(row.name), row.id]))
      const variationGroupMap = new Map((existingGroups ?? []).map((row: any) => [normalizeLookupKey(row.name), row.id]))
      const barcodeMap = new Map<string, string>()
      for (const row of existingProducts ?? []) {
        const barcodeKey = asTrimmedString(row.barcode)
        if (barcodeKey) barcodeMap.set(barcodeKey, row.id)
      }
      const nameMap = uniqueNameMap(existingProducts ?? [])

      const ensureCategory = async (name: any) => {
        const normalized = normalizeLookupKey(name)
        if (!normalized) return null
        const existingId = categoryMap.get(normalized)
        if (existingId) return existingId
        const id = uuid()
        const { error } = await supabase.from('catalog_categories').insert({
          id,
          business_id: businessId,
          name: asTrimmedString(name),
        })
        assertNoError(error, `Failed to create category "${asTrimmedString(name)}".`)
        categoryMap.set(normalized, id)
        return id
      }

      const ensureVariationGroup = async (name: any) => {
        const normalized = normalizeLookupKey(name)
        if (!normalized) return null
        const existingId = variationGroupMap.get(normalized)
        if (existingId) return existingId
        const id = uuid()
        const { error } = await supabase.from('catalog_variation_groups').insert({
          id,
          business_id: businessId,
          name: asTrimmedString(name),
        })
        assertNoError(error, `Failed to create variation group "${asTrimmedString(name)}".`)
        variationGroupMap.set(normalized, id)
        return id
      }

      const errors: string[] = []
      let created = 0
      let updated = 0
      let skipped = 0

      for (const [index, row] of rows.entries()) {
        try {
          const rowLabel = `Row ${index + 2}`
          const name = asTrimmedString(row.name)
          if (!name) throw new Error(`${rowLabel}: product name is required.`)

          const retailPrice = parseImportNumber(row.price ?? row.retail_price ?? row.base_price)
          if (retailPrice == null || retailPrice < 0) throw new Error(`${rowLabel}: price must be a valid number.`)

          const wholesalePrice = parseImportNumber(row.wholesale_price)
          if (wholesalePrice != null && wholesalePrice < 0) {
            throw new Error(`${rowLabel}: wholesale_price cannot be negative.`)
          }

          const baseCost = parseImportNumber(row.cost ?? row.base_cost, 0) ?? 0
          if (baseCost < 0) throw new Error(`${rowLabel}: cost cannot be negative.`)

          const stock = parseImportNumber(row.stock ?? row.quantity, 0)
          if (stock == null || stock < 0) throw new Error(`${rowLabel}: stock must be 0 or higher.`)

          const barcode = asTrimmedString(row.barcode) || null
          const categoryId = row.category_id || await ensureCategory(row.category)
          const variationGroupId = row.variation_group_id || await ensureVariationGroup(row.variation_group)
          const allowFractions = parseImportBoolean(row.allow_fractions, false)
          const trackInventory = parseImportBoolean(row.track_inventory, true)
          const tiers: { min_qty: number; price: number; label?: string | null }[] = []

          for (let tierNumber = 1; tierNumber <= 3; tierNumber++) {
            const minQty = parseImportNumber(row[`tier${tierNumber}_min_qty`])
            const tierPrice = parseImportNumber(row[`tier${tierNumber}_price`])
            const label = asTrimmedString(row[`tier${tierNumber}_label`]) || null

            if (minQty == null && tierPrice == null && !label) continue
            if (minQty == null || minQty <= 0) {
              throw new Error(`${rowLabel}: tier${tierNumber}_min_qty must be greater than 0 when a tier is provided.`)
            }
            if (tierPrice == null || tierPrice < 0) {
              throw new Error(`${rowLabel}: tier${tierNumber}_price must be a valid number when a tier is provided.`)
            }
            tiers.push({ min_qty: minQty, price: tierPrice, label })
          }

          if (tiers.length > 0 && !proAccess.activated) {
            throw new Error(`${rowLabel}: price tiers are available on Reyna Pro only.`)
          }

          tiers.sort((a, b) => a.min_qty - b.min_qty)
          for (let tierIndex = 1; tierIndex < tiers.length; tierIndex++) {
            if (tiers[tierIndex].min_qty === tiers[tierIndex - 1].min_qty) {
              throw new Error(`${rowLabel}: price tier minimum quantities must be unique.`)
            }
          }

          const explicitId = asTrimmedString(row.id)
          const matchedId =
            explicitId ||
            (barcode ? barcodeMap.get(barcode) : undefined) ||
            nameMap.get(normalizeLookupKey(name)) ||
            ''
          const id = matchedId || uuid()
          const hasVariations = !!variationGroupId || parseImportBoolean(row.has_variations, false)

          const { error: productError } = await supabase.from('catalog_products').upsert({
            id,
            business_id: businessId,
            name,
            description: asTrimmedString(row.description) || null,
            barcode,
            category_id: categoryId || null,
            base_price: retailPrice,
            retail_price: retailPrice,
            wholesale_price: wholesalePrice ?? null,
            base_cost: baseCost,
            has_variations: hasVariations,
            variation_group_id: variationGroupId || null,
            allow_fractions: allowFractions,
            track_inventory: trackInventory,
            is_active: true,
            basic_locked: false,
            updated_at: new Date().toISOString(),
          })
          assertNoError(productError, `Failed to save ${name}.`)

          const existingInvId = inventoryIdByProductId.get(id)
          if (existingInvId) {
            const { error: invUpdateError } = await supabase
              .from('catalog_inventory')
              .update({
                quantity: stock,
                low_threshold: parseImportNumber(row.low_threshold, 5) ?? 5,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingInvId)
            assertNoError(invUpdateError, `Failed to update inventory for ${name}.`)
          } else {
            const newInvId = uuid()
            const { error: invInsertError } = await supabase
              .from('catalog_inventory')
              .insert({
                id: newInvId,
                business_id: businessId,
                product_id: id,
                quantity: stock,
                low_threshold: parseImportNumber(row.low_threshold, 5) ?? 5,
              })
            assertNoError(invInsertError, `Failed to create inventory for ${name}.`)
            inventoryIdByProductId.set(id, newInvId)
          }

          await replacePriceTiers(businessId, id, tiers)

          if (barcode) barcodeMap.set(barcode, id)
          nameMap.set(normalizeLookupKey(name), id)

          if (matchedId) updated++
          else created++
        } catch (error: any) {
          skipped++
          errors.push(error?.message || `Row ${index + 2}: import failed.`)
        }
        onProgress?.(index + 1, rows.length)
      }

      return {
        success: true,
        created,
        updated,
        skipped,
        errors,
      }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },
}
