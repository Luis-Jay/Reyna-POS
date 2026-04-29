// Edge Function: verify-cashier-pin
// POST { name, pin, business_id } → { user } or { error }
// Used by the web version to authenticate cashiers via PIN

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PIN_PEPPER = Deno.env.get('PIN_PEPPER')?.trim() ?? ''

async function derivePbkdf2Hash(pinMaterial: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pinMaterial),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  )

  return new Uint8Array(derivedBits)
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function verifyPin(inputPin: string, storedHash: string): Promise<boolean> {
  try {
    if (!storedHash.startsWith('pbkdf2:')) {
      return storedHash === inputPin
    }

    // Format: pbkdf2:100000:<base64-salt>:<base64-hash>
    const parts = storedHash.split(':')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false

    const iterations = parseInt(parts[1], 10)
    const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0))
    const expectedHash = Uint8Array.from(atob(parts[3]), c => c.charCodeAt(0))
    const candidates = PIN_PEPPER ? [inputPin + PIN_PEPPER, inputPin] : [inputPin]

    for (const candidate of candidates) {
      const derivedHash = await derivePbkdf2Hash(candidate, salt, iterations)
      if (constantTimeEquals(derivedHash, expectedHash)) {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { name, pin } = await req.json()
    if (!name || !pin) {
      return json({ error: 'name and pin are required' }, 400)
    }

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
      return json({ error: 'Business not found. Please complete setup first.' }, 404)
    }

    const { data: cashiers, error } = await supabase
      .from('cashiers')
      .select('id, name, pin, role, is_active, created_at, permissions')
      .eq('business_id', business.id)
      .ilike('name', name)
      .eq('is_active', true)

    if (error || !cashiers?.length) {
      return json({ error: 'Invalid name or PIN.' }, 401)
    }

    // Try each match (case-insensitive name lookup may return a few rows)
    for (const cashier of cashiers) {
      if (!cashier.pin) continue
      const valid = await verifyPin(pin, cashier.pin)
      if (valid) {
        return json({
          user: {
            id: cashier.id,
            name: cashier.name,
            role: cashier.role,
            is_active: cashier.is_active ? 1 : 0,
            permissions: cashier.permissions ? JSON.stringify(cashier.permissions) : '{}',
            created_at: cashier.created_at,
          }
        })
      }
    }

    return json({ error: 'Invalid name or PIN.' }, 401)
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
