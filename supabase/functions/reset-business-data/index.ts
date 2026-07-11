// Edge Function: reset-business-data
// POST {} → { success: true }
// Wipes all catalog/sales/business data for the calling user's business.
// Deliberately never touches the `cashiers` table — cashier/admin accounts
// and PINs must survive a reset. Uses the service-role key so this always
// runs with full privileges, regardless of RLS/session edge cases on the
// client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Every table is deleted explicitly by business_id (its own indexed column)
// instead of leaning on ON DELETE CASCADE — letting e.g. catalog_products
// cascade into catalog_inventory/price_tiers/product_orders/stock_movements
// in one statement was slow enough to hit the statement timeout. Order still
// matters: children before parents.
const TABLES_IN_ORDER = [
  'sales_order_items',
  'sales_orders',
  'sales_debtor_transactions',
  'sales_debtors',
  'stock_movements',
  'product_orders',
  'price_tiers',
  'catalog_inventory',
  'catalog_variation_options',
  'catalog_variation_groups',
  'catalog_products',
  'catalog_categories',
  'loyalty_transactions',
  'loyalty_accounts',
  'petty_cash',
  'cashier_shifts',
  'saved_orders',
  'expenses',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: business } = await supabase
      .from('businesses').select('id').eq('user_id', user.id).single()
    if (!business) return json({ error: 'Business not found' }, 404)

    for (const table of TABLES_IN_ORDER) {
      const { error } = await supabase.from(table).delete().eq('business_id', business.id)
      if (error) return json({ error: `Failed to clear ${table}: ${error.message}` }, 500)
    }

    return json({ success: true })
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
