import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

async function fetchProductMap(businessId: string): Promise<Record<string, any>> {
  try {
    const { data } = await supabase
      .from('catalog_products')
      .select('id, name, barcode, base_cost, retail_price, wholesale_price, image_url, image_data')
      .eq('business_id', businessId)
    const map: Record<string, any> = {}
    for (const p of data ?? []) map[p.id] = p
    return map
  } catch {
    return {}
  }
}

function mergeProduct(o: any, productMap: Record<string, any>) {
  const p = productMap[o.product_id] ?? {}
  return {
    ...o,
    product_name: p.name ?? '',
    barcode: p.barcode ?? null,
    base_cost: p.base_cost ?? 0,
    current_retail_price: p.retail_price ?? 0,
    current_wholesale_price: p.wholesale_price ?? null,
    image_path: p.image_url ?? p.image_data ?? null,
  }
}

export const productOrdersApi = {
  getAll: async () => {
    try {
      const businessId = await getBusinessId()
      const [{ data }, productMap] = await Promise.all([
        supabase
          .from('product_orders')
          .select('id, product_id, vendor_name, quantity, unit_cost, retail_price, wholesale_price, expected_at, received_at, status, notes, created_at')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false }),
        fetchProductMap(businessId),
      ])
      return (data ?? []).map(o => mergeProduct(o, productMap))
    } catch {
      return []
    }
  },

  getPending: async () => {
    try {
      const businessId = await getBusinessId()
      const [{ data }, productMap] = await Promise.all([
        supabase
          .from('product_orders')
          .select('id, product_id, vendor_name, quantity, unit_cost, retail_price, wholesale_price, expected_at, received_at, status, notes, created_at')
          .eq('business_id', businessId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        fetchProductMap(businessId),
      ])
      return (data ?? []).map(o => mergeProduct(o, productMap))
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
      const { data: order } = await supabase.from('product_orders').select('*').eq('id', id).single()
      if (!order || order.status !== 'pending') return { ok: false }

      const { data: product } = await supabase
        .from('catalog_products')
        .select('id, base_cost, retail_price, wholesale_price')
        .eq('id', order.product_id)
        .eq('business_id', businessId)
        .maybeSingle()

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

      const unitCost = Number(order.unit_cost ?? product?.base_cost ?? 0)
      const retailPrice = Number(order.retail_price ?? product?.retail_price ?? 0)
      const wholesalePrice = Number(order.wholesale_price ?? product?.wholesale_price ?? retailPrice)

      await supabase.from('stock_batches').insert({
        id: uuid(),
        business_id: businessId,
        product_id: order.product_id,
        initial_quantity: order.quantity,
        remaining_quantity: order.quantity,
        unit_cost: unitCost,
        retail_price: retailPrice,
        wholesale_price: wholesalePrice,
        source_order_id: order.id,
        note: `Received order from ${order.vendor_name || 'vendor'}`,
      })

      if ((inv?.quantity ?? 0) <= 0) {
        await supabase.from('catalog_products').update({
          base_cost: unitCost,
          retail_price: retailPrice,
          base_price: retailPrice,
          wholesale_price: wholesalePrice,
          updated_at: new Date().toISOString(),
        })
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
