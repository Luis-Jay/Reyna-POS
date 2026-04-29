import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function stockStatus(qty: number, threshold: number): 'out' | 'critical' | 'low' | 'safe' {
  if (qty <= 0) return 'out'
  if (qty <= threshold * 0.5) return 'critical'
  if (qty <= threshold) return 'low'
  return 'safe'
}

function normalizeInventoryRow(product: any) {
  const inventory = product.catalog_inventory?.[0]
  const quantity = Number(inventory?.quantity ?? 0)
  const lowThreshold = Number(inventory?.low_threshold ?? 5)

  return {
    id: inventory?.id ?? `missing-${product.id}`,
    product_id: product.id,
    product_name: product.name ?? '',
    image_path: product.image_url ?? product.image_data ?? null,
    barcode: product.barcode ?? null,
    base_price: Number(product.base_price ?? 0),
    base_cost: Number(product.base_cost ?? 0),
    retail_price: Number(product.retail_price ?? product.base_price ?? 0),
    wholesale_price: Number(product.wholesale_price ?? product.retail_price ?? product.base_price ?? 0),
    quantity,
    low_threshold: lowThreshold,
    monthly_sold: Number(product.monthly_sold ?? 0),
    updated_at: inventory?.updated_at ?? product.updated_at ?? new Date().toISOString(),
    status: stockStatus(quantity, lowThreshold),
    category_name: product.catalog_categories?.name ?? null,
    description: product.description ?? null,
  }
}

async function fetchProducts(businessId: string): Promise<any> {
  return supabase
    .from('catalog_products')
    .select('*')
    .eq('business_id', businessId)
}

export const inventoryApi = {
  getAll: async (filter?: string) => {
    try {
      const businessId = await getBusinessId()
      const [productsRes, inventoryRes] = await Promise.all([
        fetchProducts(businessId),
        supabase
          .from('catalog_inventory')
          .select('id, product_id, quantity, low_threshold, updated_at')
          .eq('business_id', businessId),
      ])
      if (productsRes.error) {
        console.error('[inventory] catalog_products error:', productsRes.error)
        throw productsRes.error
      }
      if (inventoryRes.error) {
        console.error('[inventory] catalog_inventory error:', inventoryRes.error)
        throw inventoryRes.error
      }

      const invMap: Record<string, any> = {}
      for (const inv of inventoryRes.data ?? []) invMap[inv.product_id] = inv

      const merged = ((productsRes.data ?? []) as any[]).map(p => ({
        ...p,
        catalog_inventory: invMap[p.id] ? [invMap[p.id]] : [],
      }))

      let rows = merged
        .filter(p => !p.deleted_at && p.is_active && p.track_inventory)
        .map(normalizeInventoryRow)

      if (filter === 'Low Stock' || filter === 'low') {
        rows = rows.filter(r => r.status === 'low' || r.status === 'critical' || r.status === 'out')
      } else if (filter === 'Out of Stock' || filter === 'out') {
        rows = rows.filter(r => r.status === 'out')
      } else if (filter === 'Critical' || filter === 'critical') {
        rows = rows.filter(r => r.status === 'critical')
      } else if (filter === 'Fast Moving') {
        rows = [...rows].sort((a, b) => (b.monthly_sold ?? 0) - (a.monthly_sold ?? 0))
      } else {
        rows = [...rows].sort((a, b) => a.product_name.localeCompare(b.product_name))
      }

      return rows
    } catch (err: any) {
      console.error('[inventory] getAll error:', err?.message ?? err)
      return []
    }
  },

  getReport: async () => {
    try {
      const businessId = await getBusinessId()
      const [productsRes, inventoryRes, categoriesRes] = await Promise.all([
        supabase
          .from('catalog_products')
          .select('id, name, barcode, description, category_id, retail_price, wholesale_price, base_cost, monthly_sold, is_active, deleted_at, track_inventory, updated_at')
          .eq('business_id', businessId),
        supabase
          .from('catalog_inventory')
          .select('id, product_id, quantity, low_threshold, updated_at')
          .eq('business_id', businessId),
        supabase
          .from('catalog_categories')
          .select('id, name')
          .eq('business_id', businessId),
      ])
      if (productsRes.error) throw productsRes.error
      if (inventoryRes.error) throw inventoryRes.error
      if (categoriesRes.error) throw categoriesRes.error

      const invMap: Record<string, any> = {}
      for (const inv of inventoryRes.data ?? []) invMap[inv.product_id] = inv
      const catMap: Record<string, string> = {}
      for (const cat of categoriesRes.data ?? []) catMap[cat.id] = cat.name

      const data = (productsRes.data ?? []).map(p => ({
        ...p,
        catalog_inventory: invMap[p.id] ? [invMap[p.id]] : [],
        catalog_categories: p.category_id ? { name: catMap[p.category_id] ?? null } : null,
      }))

      return data
        .filter(p => !p.deleted_at && p.is_active && p.track_inventory)
        .map(product => {
          const row = normalizeInventoryRow(product)
          return {
            barcode: row.barcode,
            product_id: row.product_id,
            product_name: row.product_name,
            category_name: row.category_name,
            quantity: row.quantity,
            low_threshold: row.low_threshold,
            retail_price: row.retail_price,
            wholesale_price: row.wholesale_price,
            base_cost: row.base_cost,
            description: row.description,
            monthly_sold: row.monthly_sold,
            status: row.status,
            stock_value: row.quantity * row.base_cost,
            potential_revenue: row.quantity * row.retail_price,
          }
        })
    } catch {
      return []
    }
  },

  addStock: async (productId: string, qty: number, note?: string, _pricing?: any) => {
    try {
      const businessId = await getBusinessId()
      const { data: inv } = await supabase
        .from('catalog_inventory')
        .select('quantity')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .single()

      const newQty = (inv?.quantity ?? 0) + qty
      if (inv) {
        await supabase.from('catalog_inventory')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('product_id', productId).eq('business_id', businessId)
      } else {
        await supabase.from('catalog_inventory').insert({
          id: uuid(), business_id: businessId, product_id: productId,
          quantity: qty, low_threshold: 5,
        })
      }

      // Log stock movement
      await supabase.from('stock_movements').insert({
        id: uuid(), business_id: businessId, product_id: productId,
        type: 'restock', quantity: qty, note: note || null,
      }).select()

      return { success: true, newQuantity: newQty }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  setStock: async (productId: string, qty: number, note?: string) => {
    try {
      const businessId = await getBusinessId()
      const { data: inv } = await supabase
        .from('catalog_inventory')
        .select('quantity')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .single()

      const diff = qty - (inv?.quantity ?? 0)

      if (inv) {
        await supabase.from('catalog_inventory')
          .update({ quantity: qty, updated_at: new Date().toISOString() })
          .eq('product_id', productId).eq('business_id', businessId)
      } else {
        await supabase.from('catalog_inventory').insert({
          id: uuid(), business_id: businessId, product_id: productId,
          quantity: qty, low_threshold: 5,
        })
      }

      await supabase.from('stock_movements').insert({
        id: uuid(), business_id: businessId, product_id: productId,
        type: 'adjustment', quantity: diff, note: note || null,
      }).select()

      return { success: true, newQuantity: qty }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getMovements: async (productId: string) => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    } catch {
      return []
    }
  },

  setThreshold: async (productId: string, threshold: number) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_inventory')
        .update({ low_threshold: threshold })
        .eq('product_id', productId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
