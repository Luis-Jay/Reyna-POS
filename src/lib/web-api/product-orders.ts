import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const productOrdersApi = {
  getAll: async () => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('product_orders')
        .select('*, catalog_products(name, barcode, base_cost, retail_price, wholesale_price, image_url, image_data)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })

      return (data ?? []).map(o => ({
        ...o,
        product_name: (o.catalog_products as any)?.name ?? '',
        barcode: (o.catalog_products as any)?.barcode ?? null,
        base_cost: (o.catalog_products as any)?.base_cost ?? 0,
        current_retail_price: (o.catalog_products as any)?.retail_price ?? 0,
        current_wholesale_price: (o.catalog_products as any)?.wholesale_price ?? null,
        image_path: (o.catalog_products as any)?.image_url ?? (o.catalog_products as any)?.image_data ?? null,
      }))
    } catch {
      return []
    }
  },

  getPending: async () => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('product_orders')
        .select('*, catalog_products(name, barcode, retail_price, wholesale_price, image_url, image_data)')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      return (data ?? []).map(o => ({
        ...o,
        product_name: (o.catalog_products as any)?.name ?? '',
        barcode: (o.catalog_products as any)?.barcode ?? null,
        current_retail_price: (o.catalog_products as any)?.retail_price ?? 0,
        current_wholesale_price: (o.catalog_products as any)?.wholesale_price ?? null,
        image_path: (o.catalog_products as any)?.image_url ?? (o.catalog_products as any)?.image_data ?? null,
      }))
    } catch {
      return []
    }
  },

  create: async (data: any) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('product_orders').insert({
        id, business_id: businessId,
        product_id: data.product_id,
        vendor_name: data.vendor_name || null,
        quantity: data.quantity,
        unit_cost: data.unit_cost ?? 0,
        retail_price: data.retail_price ?? null,
        wholesale_price: data.wholesale_price ?? null,
        expected_at: data.expected_at || null,
        notes: data.notes || null,
        status: 'pending',
      })
      if (error) return { ok: false }
      return { id }
    } catch {
      return { ok: false }
    }
  },

  receive: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { data: order } = await supabase
        .from('product_orders').select('*').eq('id', id).single()
      if (!order || order.status !== 'pending') return { ok: false }

      // Update inventory
      const { data: inv } = await supabase
        .from('catalog_inventory')
        .select('quantity').eq('product_id', order.product_id).eq('business_id', businessId).single()

      if (inv) {
        await supabase.from('catalog_inventory')
          .update({ quantity: inv.quantity + order.quantity, updated_at: new Date().toISOString() })
          .eq('product_id', order.product_id).eq('business_id', businessId)
      } else {
        await supabase.from('catalog_inventory').insert({
          id: uuid(), business_id: businessId,
          product_id: order.product_id, quantity: order.quantity, low_threshold: 5,
        })
      }

      // Update product prices if provided
      if (order.retail_price != null || order.wholesale_price != null || order.unit_cost != null) {
        const priceUpdate: any = { updated_at: new Date().toISOString() }
        if (order.retail_price != null) priceUpdate.retail_price = order.retail_price
        if (order.wholesale_price != null) priceUpdate.wholesale_price = order.wholesale_price
        if (order.unit_cost != null) priceUpdate.base_cost = order.unit_cost
        await supabase.from('catalog_products').update(priceUpdate)
          .eq('id', order.product_id).eq('business_id', businessId)
      }

      await supabase.from('product_orders')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)

      return { ok: true }
    } catch {
      return { ok: false }
    }
  },

  cancel: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('product_orders')
        .update({ status: 'cancelled' }).eq('id', id).eq('business_id', businessId)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  },
}
