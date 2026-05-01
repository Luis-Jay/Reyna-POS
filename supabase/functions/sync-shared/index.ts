import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type SharedPayload = {
  expenses?: any[]
  cashierShifts?: any[]
  pettyCash?: any[]
  loyaltyAccounts?: any[]
  loyaltyTransactions?: any[]
  productOrders?: any[]
  savedOrders?: any[]
  stockMovements?: any[]
  stockBatches?: any[]
  returnEvents?: any[]
  settings?: Array<{ key: string; value: string }>
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
      const payload = await req.json() as SharedPayload

      const expenses = Array.isArray(payload.expenses) ? payload.expenses : []
      const cashierShifts = Array.isArray(payload.cashierShifts) ? payload.cashierShifts : []
      const pettyCash = Array.isArray(payload.pettyCash) ? payload.pettyCash : []
      const loyaltyAccounts = Array.isArray(payload.loyaltyAccounts) ? payload.loyaltyAccounts : []
      const loyaltyTransactions = Array.isArray(payload.loyaltyTransactions) ? payload.loyaltyTransactions : []
      const productOrders = Array.isArray(payload.productOrders) ? payload.productOrders : []
      const savedOrders = Array.isArray(payload.savedOrders) ? payload.savedOrders : []
      const stockMovements = Array.isArray(payload.stockMovements) ? payload.stockMovements : []
      const stockBatches = Array.isArray(payload.stockBatches) ? payload.stockBatches : []
      const returnEvents = Array.isArray(payload.returnEvents) ? payload.returnEvents : []
      const settings = Array.isArray(payload.settings) ? payload.settings : []

      const replaceRows = async (table: string, rows: any[]) => {
        const { error: deleteError } = await supabase.from(table).delete().eq('business_id', businessId)
        if (deleteError) {
          return `Failed to clear ${table}: ${deleteError.message}`
        }
        if (rows.length === 0) return null
        const { error: insertError } = await supabase.from(table).insert(rows)
        if (insertError) {
          return `Failed to sync ${table}: ${insertError.message}`
        }
        return null
      }

      let errorMessage =
        await replaceRows('expenses', expenses.map(row => ({
          id: row.id,
          business_id: businessId,
          category: row.category ?? 'Other',
          description: row.description ?? '',
          amount: row.amount ?? 0,
          date: row.date ?? new Date().toISOString().slice(0, 10),
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('cashier_shifts', cashierShifts.map(row => ({
          id: row.id,
          business_id: businessId,
          user_id: row.user_id,
          time_in: row.time_in ?? new Date().toISOString(),
          time_out: row.time_out ?? null,
          start_money: row.start_money ?? 0,
          end_money: row.end_money ?? null,
          petty_cash_total: row.petty_cash_total ?? 0,
          note: row.note ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('petty_cash', pettyCash.map(row => ({
          id: row.id,
          business_id: businessId,
          shift_id: row.shift_id,
          description: row.description ?? '',
          amount: row.amount ?? 0,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('loyalty_accounts', loyaltyAccounts.map(row => ({
          id: row.id,
          business_id: businessId,
          name: row.name,
          phone: row.phone ?? null,
          points: row.points ?? 0,
          total_earned: row.total_earned ?? 0,
          total_redeemed: row.total_redeemed ?? 0,
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: row.deleted_at ?? null,
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('loyalty_transactions', loyaltyTransactions.map(row => ({
          id: row.id,
          business_id: businessId,
          account_id: row.account_id,
          type: row.type,
          points: row.points ?? 0,
          order_id: row.order_id ?? null,
          note: row.note ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('product_orders', productOrders.map(row => ({
          id: row.id,
          business_id: businessId,
          product_id: row.product_id,
          vendor_name: row.vendor_name ?? null,
          quantity: row.quantity ?? 0,
          unit_cost: row.unit_cost ?? 0,
          retail_price: row.retail_price ?? null,
          wholesale_price: row.wholesale_price ?? null,
          expected_at: row.expected_at ?? null,
          received_at: row.received_at ?? null,
          status: row.status ?? 'pending',
          notes: row.notes ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('stock_batches', stockBatches.map(row => ({
          id: row.id,
          business_id: businessId,
          product_id: row.product_id,
          initial_quantity: row.initial_quantity ?? 0,
          remaining_quantity: row.remaining_quantity ?? 0,
          unit_cost: row.unit_cost ?? 0,
          retail_price: row.retail_price ?? 0,
          wholesale_price: row.wholesale_price ?? null,
          source_order_id: row.source_order_id ?? null,
          note: row.note ?? null,
          received_at: row.received_at ?? new Date().toISOString(),
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('saved_orders', savedOrders.map(row => ({
          id: row.id,
          business_id: businessId,
          name: row.name,
          items_json: row.items_json ?? '[]',
          total: row.total ?? 0,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('stock_movements', stockMovements.map(row => ({
          id: row.id,
          business_id: businessId,
          product_id: row.product_id,
          type: row.type,
          quantity: row.quantity ?? 0,
          reference_id: row.reference_id ?? null,
          note: row.note ?? null,
          user_id: row.user_id ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('return_events', returnEvents.map(row => ({
          id: row.id,
          business_id: businessId,
          order_id: row.order_id,
          order_item_id: row.order_item_id ?? null,
          product_id: row.product_id ?? null,
          item_name: row.item_name,
          event_type: row.event_type,
          quantity: row.quantity ?? 0,
          amount: row.amount ?? 0,
          cost_amount: row.cost_amount ?? 0,
          note: row.note ?? null,
          user_id: row.user_id ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      errorMessage =
        await replaceRows('business_settings', settings
          .filter(row => typeof row?.key === 'string' && row.key.trim())
          .map(row => ({
            business_id: businessId,
            key: row.key,
            value: row.value ?? '',
            updated_at: new Date().toISOString(),
          })))
      if (errorMessage) return json({ error: errorMessage }, 500)

      return json({ success: true })
    }

    if (req.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const [
      expenses,
      cashierShifts,
      pettyCash,
      loyaltyAccounts,
      loyaltyTransactions,
      productOrders,
      savedOrders,
      stockMovements,
      stockBatches,
      returnEvents,
      settings,
    ] = await Promise.all([
      supabase.from('expenses').select('*').eq('business_id', businessId).order('date', { ascending: false }),
      supabase.from('cashier_shifts').select('*').eq('business_id', businessId).order('time_in', { ascending: false }),
      supabase.from('petty_cash').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('loyalty_accounts').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('loyalty_transactions').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('product_orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('saved_orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('stock_movements').select('*').eq('business_id', businessId).order('created_at'),
      supabase.from('stock_batches').select('*').eq('business_id', businessId).order('received_at'),
      supabase.from('return_events').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('business_settings').select('key, value').eq('business_id', businessId).order('key'),
    ])

    const firstError =
      expenses.error ||
      cashierShifts.error ||
      pettyCash.error ||
      loyaltyAccounts.error ||
      loyaltyTransactions.error ||
      productOrders.error ||
      savedOrders.error ||
      stockMovements.error ||
      stockBatches.error ||
      returnEvents.error ||
      settings.error

    if (firstError) {
      return json({ error: firstError.message }, 500)
    }

    return json({
      expenses: expenses.data ?? [],
      cashierShifts: cashierShifts.data ?? [],
      pettyCash: pettyCash.data ?? [],
      loyaltyAccounts: loyaltyAccounts.data ?? [],
      loyaltyTransactions: loyaltyTransactions.data ?? [],
      productOrders: productOrders.data ?? [],
      savedOrders: savedOrders.data ?? [],
      stockMovements: stockMovements.data ?? [],
      stockBatches: stockBatches.data ?? [],
      returnEvents: returnEvents.data ?? [],
      settings: settings.data ?? [],
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
