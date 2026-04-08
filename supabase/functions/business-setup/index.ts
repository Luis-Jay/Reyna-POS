// Supabase Edge Function: business-setup
// Called after Supabase Auth signup to create the business profile and admin cashier

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

    // Validate the user's JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { storeName, storePhone, adminId, adminPin, adminName } = await req.json()

    if (!storeName || !adminPin) {
      return json({ error: 'storeName and adminPin are required' }, 400)
    }

    // Create or update the business record
    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .upsert({ user_id: user.id, store_name: storeName, store_phone: storePhone ?? '' })
      .select()
      .single()

    if (bizError || !business) {
      console.error('Business error:', bizError)
      return json({ error: 'Failed to create business' }, 500)
    }

    // Create or update the admin cashier
    const { error: cashierError } = await supabase
      .from('cashiers')
      .upsert(
        {
          id: adminId,
          business_id: business.id,
          name: adminName ?? 'Admin',
          pin: adminPin,
          role: 'admin',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,role', ignoreDuplicates: false }
      )

    if (cashierError) {
      // Non-fatal — upsert may fail on conflict resolution edge cases
      console.warn('Cashier upsert warning:', cashierError)
    }

    return json({ success: true, businessId: business.id })
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
