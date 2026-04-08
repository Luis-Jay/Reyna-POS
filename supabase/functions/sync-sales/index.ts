import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type SalesPayload = {
  debtors?: any[]
  debtorTransactions?: any[]
  orders?: any[]
  orderItems?: any[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return json({ error: 'Business not found. Complete setup first.' }, 404)
    }

    const businessId = business.id

    if (req.method === 'POST') {
      const payload = await req.json() as SalesPayload
      const debtors = Array.isArray(payload.debtors) ? payload.debtors : []
      const debtorTransactions = Array.isArray(payload.debtorTransactions) ? payload.debtorTransactions : []
      const orders = Array.isArray(payload.orders) ? payload.orders : []
      const orderItems = Array.isArray(payload.orderItems) ? payload.orderItems : []

      if (debtors.length > 0) {
        const { error } = await supabase.from('sales_debtors').upsert(
          debtors.map(debtor => ({
            id: debtor.id,
            business_id: businessId,
            name: debtor.name,
            phone: debtor.phone ?? null,
            balance: debtor.balance ?? 0,
            total_credit: debtor.total_credit ?? 0,
            total_paid: debtor.total_paid ?? 0,
            due_date: debtor.due_date ?? null,
            follow_up_date: debtor.follow_up_date ?? null,
            last_reminder_at: debtor.last_reminder_at ?? null,
            created_at: debtor.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: debtor.deleted_at ?? null,
          }))
        )
        if (error) return json({ error: `Failed to sync debtors: ${error.message}` }, 500)
      }

      if (orders.length > 0) {
        const { error } = await supabase.from('sales_orders').upsert(
          orders.map(order => ({
            id: order.id,
            business_id: businessId,
            order_number: order.order_number,
            customer_name: order.customer_name ?? null,
            status: order.status ?? 'completed',
            subtotal: order.subtotal ?? 0,
            discount: order.discount ?? 0,
            total: order.total ?? 0,
            payment_amount: order.payment_amount ?? null,
            change_amount: order.change_amount ?? null,
            payment_breakdown: order.payment_breakdown ?? [],
            is_credit: Boolean(order.is_credit),
            debtor_id: order.debtor_id ?? null,
            user_id: order.user_id ?? null,
            note: order.note ?? null,
            exclude_sales: Boolean(order.exclude_sales),
            created_at: order.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: order.deleted_at ?? null,
          }))
        )
        if (error) return json({ error: `Failed to sync orders: ${error.message}` }, 500)
      }

      if (orderItems.length > 0) {
        const { error } = await supabase.from('sales_order_items').upsert(
          orderItems.map(item => ({
            id: item.id,
            business_id: businessId,
            order_id: item.order_id,
            product_id: item.product_id ?? null,
            name: item.name,
            price: item.price ?? 0,
            cost: item.cost ?? 0,
            quantity: item.quantity ?? 0,
            subtotal: item.subtotal ?? 0,
            is_custom: Boolean(item.is_custom),
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) return json({ error: `Failed to sync order items: ${error.message}` }, 500)
      }

      if (debtorTransactions.length > 0) {
        const { error } = await supabase.from('sales_debtor_transactions').upsert(
          debtorTransactions.map(tx => ({
            id: tx.id,
            business_id: businessId,
            debtor_id: tx.debtor_id,
            type: tx.type,
            amount: tx.amount ?? 0,
            profit: tx.profit ?? 0,
            note: tx.note ?? null,
            order_id: tx.order_id ?? null,
            user_id: tx.user_id ?? null,
            created_at: tx.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) return json({ error: `Failed to sync debtor transactions: ${error.message}` }, 500)
      }

      return json({ success: true })
    }

    if (req.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const [
      { data: debtors, error: debtorsError },
      { data: debtorTransactions, error: debtorTransactionsError },
      { data: orders, error: ordersError },
      { data: orderItems, error: orderItemsError },
    ] = await Promise.all([
      supabase.from('sales_debtors').select('*').eq('business_id', businessId),
      supabase.from('sales_debtor_transactions').select('*').eq('business_id', businessId),
      supabase.from('sales_orders').select('*').eq('business_id', businessId),
      supabase.from('sales_order_items').select('*').eq('business_id', businessId),
    ])

    const firstError = debtorsError || debtorTransactionsError || ordersError || orderItemsError
    if (firstError) {
      return json({ error: firstError.message }, 500)
    }

    return json({
      debtors: debtors ?? [],
      debtorTransactions: debtorTransactions ?? [],
      orders: orders ?? [],
      orderItems: orderItems ?? [],
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
