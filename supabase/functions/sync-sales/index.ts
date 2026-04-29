import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type SalesPayload = {
  debtors?: any[]
  debtorTransactions?: any[]
  orders?: any[]
  orderItems?: any[]
  stockMovements?: any[]
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
      const stockMovements = Array.isArray(payload.stockMovements) ? payload.stockMovements : []

      if (debtors.length > 0) {
        const valid = debtors.filter(d => typeof d.id === 'string' && d.id.trim())
        const { error } = await supabase.from('sales_debtors').upsert(
          valid.map(d => ({
            id: d.id,
            business_id: businessId,
            name: d.name,
            phone: d.phone ?? null,
            balance: d.balance ?? 0,
            total_credit: d.total_credit ?? 0,
            total_paid: d.total_paid ?? 0,
            credit_limit: d.credit_limit ?? 0,
            due_date: d.due_date ?? null,
            follow_up_date: d.follow_up_date ?? null,
            last_reminder_at: d.last_reminder_at ?? null,
            created_at: d.created_at ?? new Date().toISOString(),
            deleted_at: d.deleted_at ?? null,
          })),
          { onConflict: 'id' }
        )
        if (error) return json({ error: `Failed to sync debtors: ${error.message}` }, 500)
      }

      if (orders.length > 0) {
        const valid = orders.filter(o => typeof o.id === 'string' && o.id.trim())
        const { error } = await supabase.from('sales_orders').upsert(
          valid.map(o => ({
            id: o.id,
            business_id: businessId,
            order_number: o.order_number ?? null,
            customer_name: o.customer_name ?? null,
            status: o.status ?? 'completed',
            subtotal: o.subtotal ?? 0,
            discount: o.discount ?? 0,
            total: o.total ?? 0,
            payment_amount: o.payment_amount ?? 0,
            change_amount: o.change_amount ?? 0,
            payment_breakdown: o.payment_breakdown ?? [],
            is_credit: Boolean(o.is_credit),
            debtor_id: o.debtor_id ?? null,
            user_id: o.user_id ?? null,
            note: o.note ?? null,
            exclude_sales: Boolean(o.exclude_sales),
            created_at: o.created_at ?? new Date().toISOString(),
            deleted_at: o.deleted_at ?? null,
          })),
          { onConflict: 'id' }
        )
        if (error) return json({ error: `Failed to sync orders: ${error.message}` }, 500)
      }

      if (orderItems.length > 0) {
        const valid = orderItems.filter(i => typeof i.id === 'string' && i.id.trim())
        const { error } = await supabase.from('sales_order_items').upsert(
          valid.map(i => ({
            id: i.id,
            business_id: businessId,
            order_id: i.order_id,
            product_id: i.product_id ?? null,
            name: i.name,
            price: i.price ?? 0,
            cost: i.cost ?? 0,
            quantity: i.quantity ?? 1,
            subtotal: i.subtotal ?? 0,
            is_custom: Boolean(i.is_custom),
          })),
          { onConflict: 'id' }
        )
        if (error) return json({ error: `Failed to sync order items: ${error.message}` }, 500)
      }

      if (debtorTransactions.length > 0) {
        const valid = debtorTransactions.filter(t => typeof t.id === 'string' && t.id.trim())
        const { error } = await supabase.from('sales_debtor_transactions').upsert(
          valid.map(t => ({
            id: t.id,
            business_id: businessId,
            debtor_id: t.debtor_id,
            type: t.type,
            amount: t.amount ?? 0,
            profit: t.profit ?? null,
            note: t.note ?? null,
            order_id: t.order_id ?? null,
            user_id: t.user_id ?? null,
            created_at: t.created_at ?? new Date().toISOString(),
          })),
          { onConflict: 'id' }
        )
        if (error) return json({ error: `Failed to sync debtor transactions: ${error.message}` }, 500)
      }

      if (stockMovements.length > 0) {
        const valid = stockMovements.filter(m => typeof m.id === 'string' && m.id.trim())
        const { error } = await supabase.from('sales_stock_movements').upsert(
          valid.map(m => ({
            id: m.id,
            business_id: businessId,
            product_id: m.product_id,
            type: m.type,
            quantity: m.quantity ?? 0,
            note: m.note ?? null,
            reference_id: m.reference_id ?? null,
            user_id: m.user_id ?? null,
            created_at: m.created_at ?? new Date().toISOString(),
          })),
          { onConflict: 'id' }
        )
        if (error) return json({ error: `Failed to sync stock movements: ${error.message}` }, 500)
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
      { data: stockMovements, error: stockMovementsError },
    ] = await Promise.all([
      supabase.from('sales_debtors').select('*').eq('business_id', businessId),
      supabase.from('sales_debtor_transactions').select('*').eq('business_id', businessId),
      supabase.from('sales_orders').select('*').eq('business_id', businessId),
      supabase.from('sales_order_items').select('*').eq('business_id', businessId),
      supabase.from('sales_stock_movements').select('*').eq('business_id', businessId),
    ])

    const firstError = debtorsError || debtorTransactionsError || ordersError || orderItemsError || stockMovementsError
    if (firstError) {
      return json({ error: firstError.message }, 500)
    }

    return json({
      debtors: debtors ?? [],
      debtorTransactions: debtorTransactions ?? [],
      orders: orders ?? [],
      orderItems: orderItems ?? [],
      stockMovements: stockMovements ?? [],
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
