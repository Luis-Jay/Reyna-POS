// Supabase Edge Function: sync-cashiers
// GET  — fetch all cashiers + business info for the authenticated user
// POST — push local cashier list up to Supabase (used when adding/editing cashiers)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

    // Get the user's business
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, store_name, store_phone')
      .eq('user_id', user.id)
      .single()

    if (bizError || !business) {
      return json({ error: 'Business not found. Complete setup first.' }, 404)
    }

    if (req.method === 'GET') {
      const { data: cashiers, error: cashierError } = await supabase
        .from('cashiers')
        .select('id, name, pin, role, is_active, created_at, updated_at')
        .eq('business_id', business.id)
        .order('role', { ascending: false }) // admin first
        .order('name')

      if (cashierError) {
        return json({ error: 'Failed to fetch cashiers' }, 500)
      }

      return json({ cashiers: cashiers ?? [], business })
    }

    if (req.method === 'POST') {
      const { cashiers } = await req.json() as { cashiers: any[] }

      if (!Array.isArray(cashiers)) {
        return json({ error: 'cashiers must be an array' }, 400)
      }

      for (const cashier of cashiers) {
        await supabase.from('cashiers').upsert({
          id: cashier.id,
          business_id: business.id,
          name: cashier.name,
          pin: cashier.pin,
          role: cashier.role ?? 'cashier',
          is_active: cashier.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
      }

      return json({ success: true })
    }

    return json({ error: 'Method not allowed' }, 405)
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
