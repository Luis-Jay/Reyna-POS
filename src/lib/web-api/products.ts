import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function asNumber(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
    const map: Record<string, number> = {}
    for (const row of data ?? []) map[row.product_id] = row.quantity
    return map
  } catch {
    return {}
  }
}

export const productsApi = {
  getAll: async (filters?: { category?: string; letter?: string; search?: string }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('catalog_products')
        .select('*, catalog_categories(name), catalog_variation_groups(name)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')

      if (filters?.category) query = query.eq('category_id', filters.category)
      if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,barcode.eq.${filters.search}`)
      if (filters?.letter) query = query.ilike('name', `${filters.letter}%`)

      const [{ data, error }, invMap] = await Promise.all([query, fetchInventoryMap(businessId)])
      assertNoError(error, 'Failed to load products.')
      return (data ?? []).map(p => ({
        ...mapProduct({ ...p, catalog_inventory: invMap[p.id] != null ? [{ quantity: invMap[p.id] }] : [] }),
        category_name: p.catalog_categories?.name ?? null,
        variation_group_name: p.catalog_variation_groups?.name ?? null,
      }))
    } catch {
      return []
    }
  },

  getById: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const [{ data, error }, invMap] = await Promise.all([
        supabase.from('catalog_products').select('*, catalog_categories(name)').eq('id', id).eq('business_id', businessId).is('deleted_at', null).single(),
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
      const { data, error } = await supabase
        .from('catalog_products')
        .select('*, catalog_categories(name)')
        .eq('barcode', barcode)
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .single()
      if (error) throw error
      const { data: inv } = await supabase.from('catalog_inventory').select('quantity').eq('product_id', data.id).eq('business_id', businessId).single()
      return { ...mapProduct({ ...data, catalog_inventory: inv ? [inv] : [] }), category_name: data.catalog_categories?.name ?? null }
    } catch {
      return null
    }
  },

  search: async (q: string) => {
    try {
      const businessId = await getBusinessId()
      const [{ data, error }, invMap] = await Promise.all([
        supabase.from('catalog_products').select('*, catalog_categories(name)').eq('business_id', businessId).is('deleted_at', null).eq('is_active', true).or(`name.ilike.%${q}%,barcode.eq.${q}`).order('sort_order').order('name').limit(20),
        fetchInventoryMap(businessId),
      ])
      assertNoError(error, 'Failed to search products.')
      return (data ?? []).map(p => ({ ...mapProduct({ ...p, catalog_inventory: invMap[p.id] != null ? [{ quantity: invMap[p.id] }] : [] }), category_name: p.catalog_categories?.name ?? null }))
    } catch {
      return []
    }
  },

  create: async (data: any) => {
    try {
      const businessId = await getBusinessId()
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
      const businessId = await getBusinessId()
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
      const businessId = await getBusinessId()
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

  // Upload image to Supabase Storage and store the public URL in image_url.
  // Storing the URL (not base64) keeps DB rows small and reads reliable.
  saveImage: async (productId: string, dataUrl: string) => {
    try {
      const businessId = await getBusinessId()

      // Convert base64 data URL → Blob for Storage upload
      const [header, b64] = dataUrl.split(',')
      const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })

      // Upsert into product-images bucket at businessId/productId.jpg
      const storagePath = `${businessId}/${productId}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' })
      if (uploadError) throw new Error(uploadError.message)

      // Get permanent public URL (no expiry — bucket is public)
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(storagePath)
      const publicUrl = urlData.publicUrl

      // Persist the URL in the product row
      const { data, error } = await supabase.from('catalog_products')
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .select('id, image_url')
        .eq('id', productId).eq('business_id', businessId)
        .single()
      assertNoError(error, 'Failed to save product image reference.')
      if (!data?.id) throw new Error('Product image was not saved. Please refresh and try again.')

      return { success: true, path: publicUrl }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  importBatch: async (rows: any[]) => {
    try {
      const businessId = await getBusinessId()
      let created = 0, updated = 0, errors = 0
      for (const row of rows) {
        try {
          const id = row.id || uuid()
          await supabase.from('catalog_products').upsert({
            id, business_id: businessId,
            name: row.name,
            barcode: row.barcode || null,
            category_id: row.category_id || null,
            base_price: row.base_price ?? 0,
            retail_price: row.retail_price ?? row.base_price ?? 0,
            wholesale_price: row.wholesale_price ?? null,
            base_cost: row.base_cost ?? 0,
            track_inventory: true,
            is_active: true,
          })
          await supabase.from('catalog_inventory').upsert({
            id: `inv-${id}`,
            business_id: businessId,
            product_id: id,
            quantity: Number(row.quantity ?? row.stock ?? 0),
            low_threshold: Number(row.low_threshold ?? 5),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'business_id,product_id',
          })
          if (row.id) updated++; else created++
        } catch { errors++ }
      }
      return { success: true, created, updated, errors }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },
}
