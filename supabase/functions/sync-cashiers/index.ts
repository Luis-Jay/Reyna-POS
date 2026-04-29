// Supabase Edge Function: sync-cashiers
// GET  — fetch all cashiers + business info for the authenticated user
// POST — push local cashier list up to Supabase (used when adding/editing cashiers)

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
        .select('id, name, pin, role, is_active, created_at, updated_at, permissions')
        .eq('business_id', business.id)
        .order('role', { ascending: false }) // admin first
        .order('name')

      if (cashierError) {
        return json({ error: 'Failed to fetch cashiers' }, 500)
      }

      const cashiersWithPinStatus = (cashiers ?? []).map(cashier => ({
        ...cashier,
        permissions: cashier.permissions ?? {},
        has_pin: Boolean(cashier.pin),
        pin: undefined, // Remove the pin field
      }))

      return json({ cashiers: cashiersWithPinStatus, business })
    }

    if (req.method === 'POST') {
      let cashiers: any[]
      try {
        const body = await req.json() as { cashiers: any[] }
        cashiers = body.cashiers
      } catch (error) {
        return json({ error: 'Invalid request body' }, 400)
      }

      if (!Array.isArray(cashiers)) {
        return json({ error: 'cashiers must be an array' }, 400)
      }

      for (const cashier of cashiers) {
        if (typeof cashier.pin !== 'string' || cashier.pin.trim() === '') {
          console.error('Rejected cashier sync with missing PIN:', cashier?.id)
          return json({ error: `Cashier ${cashier?.id ?? 'unknown'} is missing a valid pin` }, 400)
        }

        const hashedPin = await hashPin(cashier.pin)
        const { error: upsertError } = await supabase.from('cashiers').upsert({
          id: cashier.id,
          business_id: business.id,
          name: cashier.name,
          pin: hashedPin,
          role: cashier.role ?? 'cashier',
          is_active: cashier.is_active ?? true,
          permissions: cashier.permissions ?? {},
          updated_at: new Date().toISOString(),
        })
        if (upsertError) {
          console.error('Failed to upsert cashier:', cashier.id, upsertError)
          return json({ error: `Failed to sync cashier ${cashier.id}: ${upsertError.message}` }, 500)
        }
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
