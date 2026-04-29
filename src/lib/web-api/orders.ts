import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function manilaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

function shouldFallbackToClientFlow(error: any, fnName: string) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes(fnName.toLowerCase()) && (
    message.includes('could not find the function')
    || message.includes('does not exist')
    || message.includes('schema cache')
  )
}

async function generateOrderNumber(businessId: string): Promise<string> {
  const today = new Date()
  const y = today.getFullYear().toString().slice(2)
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const prefix = `${y}${m}${d}-`

  const { data } = await supabase
    .from('sales_orders')
    .select('order_number')
    .eq('business_id', businessId)
    .like('order_number', `${prefix}%`)
    .order('order_number', { ascending: false })
    .limit(1)

  const last = data?.[0]?.order_number
  const seq = last ? parseInt(last.split('-')[1] ?? '0', 10) : 0
  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(4, '0')}`
}

function mapOrder(o: any) {
  return {
    ...o,
    is_credit: o.is_credit ? 1 : 0,
    exclude_sales: o.exclude_sales ? 1 : 0,
    payment_breakdown: Array.isArray(o.payment_breakdown) ? o.payment_breakdown : [],
    items: (o.sales_order_items ?? []).map((i: any) => ({
      ...i,
      is_custom: i.is_custom ? 1 : 0,
    })),
  }
}

export const ordersApi = {
  create: async (orderData: any) => {
    try {
      const businessId = await getBusinessId()
      const orderId = uuid()
      const items = (orderData.items ?? []).map((item: any) => ({
        id: uuid(),
        product_id: item.product_id || null,
        name: item.name,
        price: item.price,
        cost: item.cost ?? 0,
        quantity: item.quantity,
        subtotal: item.subtotal,
        is_custom: !!item.is_custom,
      }))

      const { data, error } = await supabase.rpc('create_sale_order', {
        p_business_id: businessId,
        p_order_id: orderId,
        p_customer_name: orderData.customer_name || null,
        p_subtotal: orderData.subtotal ?? 0,
        p_discount: orderData.discount ?? 0,
        p_total: orderData.total ?? 0,
        p_payment_amount: orderData.payment_amount ?? null,
        p_change_amount: orderData.change_amount ?? null,
        p_payment_breakdown: orderData.payment_breakdown ?? [],
        p_is_credit: !!orderData.is_credit,
        p_debtor_id: orderData.debtor_id || null,
        p_user_id: orderData.user_id || null,
        p_note: orderData.note || null,
        p_items: items,
      })

      if (error && !shouldFallbackToClientFlow(error, 'create_sale_order')) {
        return { success: false, error: error.message }
      }

      let orderNumber = data?.order_number ?? null

      if (error) {
        orderNumber = await generateOrderNumber(businessId)

        const { error: orderError } = await supabase.from('sales_orders').insert({
          id: orderId,
          business_id: businessId,
          order_number: orderNumber,
          customer_name: orderData.customer_name || null,
          status: 'completed',
          subtotal: orderData.subtotal ?? 0,
          discount: orderData.discount ?? 0,
          total: orderData.total,
          payment_amount: orderData.payment_amount ?? null,
          change_amount: orderData.change_amount ?? null,
          payment_breakdown: orderData.payment_breakdown ?? [],
          is_credit: !!orderData.is_credit,
          debtor_id: orderData.debtor_id || null,
          user_id: orderData.user_id || null,
          note: orderData.note || null,
        })
        if (orderError) return { success: false, error: orderError.message }

        if (items.length > 0) {
          const { error: itemsError } = await supabase.from('sales_order_items').insert(
            items.map((item: any) => ({
              ...item,
              business_id: businessId,
              order_id: orderId,
            }))
          )
          if (itemsError) return { success: false, error: itemsError.message }
        }

        const inventoryUpdates = items.filter((item: any) => item.product_id && !item.is_custom)
        await Promise.all(inventoryUpdates.map(async (item: any) => {
          const { data: inv } = await supabase
            .from('catalog_inventory')
            .select('quantity')
            .eq('product_id', item.product_id)
            .eq('business_id', businessId)
            .single()

          if (inv) {
            const newQty = Math.max(0, Number(inv.quantity ?? 0) - Number(item.quantity ?? 0))
            await supabase.from('catalog_inventory')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('product_id', item.product_id)
              .eq('business_id', businessId)
          }

          const { data: product } = await supabase
            .from('catalog_products')
            .select('monthly_sold')
            .eq('id', item.product_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('catalog_products')
            .update({
              monthly_sold: Number(product?.monthly_sold ?? 0) + Number(item.quantity ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.product_id)
            .eq('business_id', businessId)

          await supabase.from('stock_movements').insert({
            id: uuid(),
            business_id: businessId,
            product_id: item.product_id,
            type: 'sale',
            quantity: -Math.abs(Number(item.quantity ?? 0)),
            reference_id: orderId,
            note: orderData.note || null,
            user_id: orderData.user_id || null,
          })
        }))

        if (orderData.is_credit && orderData.debtor_id) {
          const profit = items.reduce((s: number, i: any) =>
            s + ((Number(i.price ?? 0) - Number(i.cost ?? 0)) * Number(i.quantity ?? 0)), 0)

          const { data: debtor } = await supabase.from('sales_debtors')
            .select('balance, total_credit')
            .eq('id', orderData.debtor_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('sales_debtors')
            .update({
              balance: Number(debtor?.balance ?? 0) + Number(orderData.total ?? 0),
              total_credit: Number(debtor?.total_credit ?? 0) + Number(orderData.total ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderData.debtor_id)
            .eq('business_id', businessId)

          await supabase.from('sales_debtor_transactions').insert({
            id: uuid(),
            business_id: businessId,
            debtor_id: orderData.debtor_id,
            type: 'debt',
            amount: orderData.total,
            profit,
            order_id: orderId,
            user_id: orderData.user_id || null,
            note: orderData.note || null,
          })
        }
      }

      return {
        success: true,
        id: orderId,
        order_number: orderNumber,
        order: {
          id: orderId,
          order_number: orderNumber,
          ...orderData,
          items: orderData.items ?? [],
        },
      }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getAll: async (filters?: { from?: string; to?: string; status?: string; search?: string }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('sales_orders')
        .select('*, sales_order_items(*)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.from) query = query.gte('created_at', `${filters.from}T00:00:00+08:00`)
      if (filters?.to) query = query.lte('created_at', `${filters.to}T23:59:59+08:00`)
      if (filters?.search) query = query.or(`order_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map(mapOrder)
    } catch {
      return []
    }
  },

  getById: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('sales_orders')
        .select('*, sales_order_items(*)')
        .eq('id', id)
        .eq('business_id', businessId)
        .single()
      if (error) return null
      return mapOrder(data)
    } catch {
      return null
    }
  },

  updateStatus: async (id: string, status: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('sales_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  refund: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('sales_orders')
        .update({ status: 'void', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  partialRefund: async (id: string, refundItems: any[]) => {
    try {
      const businessId = await getBusinessId()
      const { error } = await supabase.rpc('apply_partial_refund', {
        p_business_id: businessId,
        p_order_id: id,
        p_refund_items: refundItems,
      })
      if (error && !shouldFallbackToClientFlow(error, 'apply_partial_refund')) {
        return { success: false, error: error.message }
      }

      if (error) {
        const refundTotal = refundItems.reduce((s, i) => s + Number(i.subtotal ?? 0), 0)
        const { data: order } = await supabase.from('sales_orders')
          .select('total')
          .eq('id', id)
          .eq('business_id', businessId)
          .single()

        if (order) {
          const newTotal = Math.max(0, Number(order.total ?? 0) - refundTotal)
          await supabase.from('sales_orders')
            .update({ total: newTotal, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('business_id', businessId)
        }

        await Promise.all(refundItems.filter(i => i.product_id).map(async (item: any) => {
          const { data: inv } = await supabase.from('catalog_inventory')
            .select('quantity')
            .eq('product_id', item.product_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('catalog_inventory')
            .update({
              quantity: Number(inv?.quantity ?? 0) + Number(item.quantity ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq('product_id', item.product_id)
            .eq('business_id', businessId)

          await supabase.from('stock_movements').insert({
            id: uuid(),
            business_id: businessId,
            product_id: item.product_id,
            type: 'return',
            quantity: Number(item.quantity ?? 0),
            reference_id: id,
            note: 'Partial refund',
          })
        }))
      }

      return { success: true }
    } catch {
      return { success: false }
    }
  },

  excludeSales: async (id: string, exclude: boolean) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('sales_orders')
        .update({ exclude_sales: exclude, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  saveCart: async (data: { name: string; items: any[]; total: number }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      await supabase.from('saved_orders').insert({
        id, business_id: businessId,
        name: data.name,
        items_json: JSON.stringify(data.items),
        total: data.total,
      })
      return { success: true, id }
    } catch {
      return { success: false }
    }
  },

  getSaved: async () => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('saved_orders')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      return data ?? []
    } catch {
      return []
    }
  },

  deleteSaved: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('saved_orders').delete().eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  getPending: async () => {
    try {
      const businessId = await getBusinessId()
      const today = manilaDate()
      const { data } = await supabase
        .from('sales_orders')
        .select('*, sales_order_items(*)')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      return (data ?? []).map(mapOrder)
    } catch {
      return []
    }
  },

  getCashierSalesToday: async () => {
    try {
      const businessId = await getBusinessId()
      const today = manilaDate()
      const [{ data: orders }, { data: cashiers }] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('id, total, user_id, is_credit, created_at')
          .eq('business_id', businessId)
          .eq('status', 'completed')
          .eq('exclude_sales', false)
          .gte('created_at', `${today}T00:00:00+08:00`)
          .lte('created_at', `${today}T23:59:59+08:00`),
        supabase
          .from('cashiers')
          .select('id, name')
          .eq('business_id', businessId),
      ])

      const cashierNames = new Map((cashiers ?? []).map((cashier: any) => [cashier.id, cashier.name ?? 'Unknown Cashier']))
      const grouped = new Map<string, { user_id: string; cashier_name: string; total_sales: number; order_count: number; credit_sales: number }>()

      for (const order of orders ?? []) {
        const userId = order.user_id || 'unknown'
        const current = grouped.get(userId) ?? {
          user_id: userId,
          cashier_name: cashierNames.get(userId) ?? 'Unknown Cashier',
          total_sales: 0,
          order_count: 0,
          credit_sales: 0,
        }

        current.total_sales += Number(order.total ?? 0)
        current.order_count += 1
        if (order.is_credit) current.credit_sales += Number(order.total ?? 0)
        grouped.set(userId, current)
      }

      return Array.from(grouped.values()).sort((a, b) => b.total_sales - a.total_sales)
    } catch {
      return []
    }
  },
}
