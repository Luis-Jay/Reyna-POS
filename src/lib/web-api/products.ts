import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function mapProduct(p: any) {
  return {
    ...p,
    // Normalize Supabase column names to match local SQLite shape
    image_path: p.image_url || p.image_data || null,
    has_variations: p.has_variations ? 1 : 0,
    allow_fractions: p.allow_fractions ? 1 : 0,
    track_inventory: p.track_inventory ? 1 : 0,
    is_active: p.is_active ? 1 : 0,
    // Join data from catalog_inventory
    stock: p.catalog_inventory?.[0]?.quantity ?? null,
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
      if (error) throw error
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
      if (error) return null
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
      if (error) return null
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
      if (error) return []
      return (data ?? []).map(p => ({ ...mapProduct({ ...p, catalog_inventory: invMap[p.id] != null ? [{ quantity: invMap[p.id] }] : [] }), category_name: p.catalog_categories?.name ?? null }))
    } catch {
      return []
    }
  },

  create: async (data: any) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('catalog_products').insert({
        id, business_id: businessId,
        name: data.name,
        description: data.description || null,
        image_url: data.image_path || null,
        barcode: data.barcode || null,
        category_id: data.category_id || null,
        base_price: data.base_price ?? 0,
        retail_price: data.retail_price ?? 0,
        wholesale_price: data.wholesale_price ?? null,
        base_cost: data.base_cost ?? 0,
        markup_pct: data.markup_pct ?? null,
        has_variations: !!data.has_variations,
        variation_group_id: data.variation_group_id || null,
        allow_fractions: !!data.allow_fractions,
        track_inventory: data.track_inventory !== 0,
        sort_order: data.sort_order ?? 0,
      })
      if (error) return { success: false, error: error.message }

      // Create matching inventory row
      await supabase.from('catalog_inventory').insert({
        id: uuid(),
        business_id: businessId,
        product_id: id,
        quantity: 0,
        low_threshold: 5,
      })

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
          } else {
            updates[f] = data[f]
          }
        }
      }
      if ('image_path' in data) updates['image_url'] = data.image_path
      if ('is_active' in data) updates['is_active'] = !!data.is_active

      const { error } = await supabase
        .from('catalog_products')
        .update(updates)
        .eq('id', id)
        .eq('business_id', businessId)

      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { error } = await supabase
        .from('catalog_products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', businessId)
      if (error) return { success: false }
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  bulkPrices: async (updates: { id: string; price?: number; retail_price?: number; wholesale_price?: number; base_price?: number; markup_pct?: number | null }[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(updates.map(u => {
        const patch: any = { updated_at: new Date().toISOString() }
        const nextPrice = u.price ?? u.retail_price ?? u.base_price
        if (nextPrice !== undefined) {
          patch.retail_price = nextPrice
          patch.base_price = nextPrice
        }
        if (u.wholesale_price !== undefined) patch.wholesale_price = u.wholesale_price
        if (u.markup_pct !== undefined) patch.markup_pct = u.markup_pct
        return supabase.from('catalog_products').update(patch).eq('id', u.id).eq('business_id', businessId)
      }))
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  bulkNames: async (updates: { id: string; name: string }[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(updates.map(u =>
        supabase.from('catalog_products').update({ name: u.name, updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
      ))
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  bulkBarcodes: async (updates: { id: string; barcode: string }[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(updates.map(u =>
        supabase.from('catalog_products').update({ barcode: u.barcode, updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
      ))
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  bulkCosts: async (updates: { id: string; cost?: number; base_cost?: number }[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(updates.map(u =>
        supabase.from('catalog_products').update({ base_cost: u.cost ?? u.base_cost ?? 0, updated_at: new Date().toISOString() })
          .eq('id', u.id).eq('business_id', businessId)
      ))
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  // For web, images are stored as base64 data URLs in image_data column
  saveImage: async (productId: string, dataUrl: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_products')
        .update({ image_data: dataUrl, updated_at: new Date().toISOString() })
        .eq('id', productId).eq('business_id', businessId)
      return { success: true, path: dataUrl }
    } catch {
      return { success: false }
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
