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

      const { error } = await supabase.rpc('sync_sales_upserts', {
        business_id: businessId,
        debtors,
        orders,
        order_items: orderItems,
        debtor_transactions: debtorTransactions,
      })

      if (error) {
        return json({ error: `Failed to sync sales data: ${error.message}` }, 500)
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
