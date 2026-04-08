// Supabase Edge Function: business-setup
// Called after Supabase Auth signup to create the business profile and admin cashier

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const PIN_PEPPER = Deno.env.get('PIN_PEPPER')?.trim()

if (!PIN_PEPPER) {
  throw new Error('PIN_PEPPER environment variable is required')
}

async function hashPin(pin: string): Promise<string> {
  // Generate a random 32-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(32))

  // Use PBKDF2 with 100,000 iterations for security
  const pepperedPin = pin + PIN_PEPPER
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepperedPin),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  )

  const hash = new Uint8Array(derivedBits)

  // Format: pbkdf2:100000:<base64-salt>:<base64-hash>
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...hash))

  return `pbkdf2:100000:${saltB64}:${hashB64}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const token = authHeader.slice(7)

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

    // Create or update the admin cashier.
    const { data: existingAdmin, error: existingAdminError } = await supabase
      .from('cashiers')
      .select('id')
      .eq('business_id', business.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (existingAdminError) {
      console.error('Admin lookup error:', existingAdminError)
      return json({ error: 'Failed to look up admin cashier' }, 500)
    }

    const resolvedAdminId = existingAdmin?.id ?? adminId ?? crypto.randomUUID()

    // Hash the admin PIN for secure storage
    const hashedPin = await hashPin(adminPin)

    const { error: cashierError } = await supabase
      .from('cashiers')
      .upsert({
        id: resolvedAdminId,
        business_id: business.id,
        name: adminName ?? 'Admin',
        pin: hashedPin,
        role: 'admin',
        is_active: true,
        updated_at: new Date().toISOString(),
      })

    if (cashierError) {
      console.error('Cashier upsert error:', cashierError)
      return json({ error: 'Failed to create admin cashier' }, 500)
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
