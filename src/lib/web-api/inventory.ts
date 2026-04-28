import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function stockStatus(qty: number, threshold: number): 'out' | 'critical' | 'low' | 'safe' {
  if (qty <= 0) return 'out'
  if (qty <= threshold * 0.5) return 'critical'
  if (qty <= threshold) return 'low'
  return 'safe'
}

export const inventoryApi = {
  getAll: async (filter?: string) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('catalog_inventory')
        .select('*, catalog_products(name, image_url, image_data, barcode, base_price, base_cost, retail_price, wholesale_price, monthly_sold, is_active, deleted_at)')
        .eq('business_id', businessId)

      const { data, error } = await query
      if (error) throw error

      let rows = (data ?? [])
        .filter(r => !r.catalog_products?.deleted_at && r.catalog_products?.is_active)
        .map(r => ({
          id: r.id,
          product_id: r.product_id,
          product_name: r.catalog_products?.name ?? '',
          image_path: r.catalog_products?.image_url ?? r.catalog_products?.image_data ?? null,
          barcode: r.catalog_products?.barcode ?? null,
          base_price: r.catalog_products?.base_price ?? 0,
          base_cost: r.catalog_products?.base_cost ?? 0,
          retail_price: r.catalog_products?.retail_price ?? 0,
          wholesale_price: r.catalog_products?.wholesale_price ?? null,
          quantity: r.quantity,
          low_threshold: r.low_threshold,
          monthly_sold: r.catalog_products?.monthly_sold ?? 0,
          updated_at: r.updated_at,
          status: stockStatus(r.quantity, r.low_threshold),
        }))

      if (filter === 'low') rows = rows.filter(r => r.status === 'low' || r.status === 'critical' || r.status === 'out')
      if (filter === 'out') rows = rows.filter(r => r.status === 'out')

      return rows.sort((a, b) => a.product_name.localeCompare(b.product_name))
    } catch {
      return []
    }
  },

  getReport: async () => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('catalog_inventory')
        .select('*, catalog_products(name, retail_price, base_cost, monthly_sold, is_active, deleted_at)')
        .eq('business_id', businessId)

      return (data ?? [])
        .filter(r => !r.catalog_products?.deleted_at && r.catalog_products?.is_active)
        .map(r => ({
          product_id: r.product_id,
          product_name: r.catalog_products?.name ?? '',
          quantity: r.quantity,
          low_threshold: r.low_threshold,
          retail_price: r.catalog_products?.retail_price ?? 0,
          base_cost: r.catalog_products?.base_cost ?? 0,
          monthly_sold: r.catalog_products?.monthly_sold ?? 0,
          status: stockStatus(r.quantity, r.low_threshold),
          stock_value: r.quantity * (r.catalog_products?.base_cost ?? 0),
          potential_revenue: r.quantity * (r.catalog_products?.retail_price ?? 0),
        }))
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
