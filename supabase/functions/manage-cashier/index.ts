// Edge Function: manage-cashier
// POST { action: 'create'|'update', ...data } → { id } or { success }
// Used by the web version to create and update cashiers

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PIN_PEPPER = Deno.env.get('PIN_PEPPER')?.trim() ?? ''

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const pepperedPin = pin + PIN_PEPPER
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(pepperedPin), 'PBKDF2', false, ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hash = new Uint8Array(derivedBits)
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...hash))
  return `pbkdf2:100000:${saltB64}:${hashB64}`
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
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verify the requesting user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: business } = await supabase
      .from('businesses').select('id').eq('user_id', user.id).single()
    if (!business) return json({ error: 'Business not found' }, 404)

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { name, pin, role, is_active, permissions } = body
      if (!name || !pin) return json({ error: 'name and pin are required' }, 400)

      const hashedPin = await hashPin(pin)
      const id = crypto.randomUUID()
      const { error } = await supabase.from('cashiers').insert({
        id,
        business_id: business.id,
        name,
        pin: hashedPin,
        role: role ?? 'cashier',
        is_active: is_active !== false,
        permissions: permissions ?? {},
      })
      if (error) return json({ error: error.message }, 500)
      return json({ success: true, id })
    }

    if (action === 'update') {
      const { id, name, pin, role, is_active, permissions } = body
      if (!id) return json({ error: 'id is required' }, 400)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name !== undefined) updates.name = name
      if (role !== undefined) updates.role = role
      if (is_active !== undefined) updates.is_active = is_active
      if (permissions !== undefined) updates.permissions = permissions
      if (pin) updates.pin = await hashPin(pin)

      const { error } = await supabase.from('cashiers')
        .update(updates).eq('id', id).eq('business_id', business.id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return json({ error: 'id is required' }, 400)

      // Prevent deleting the last admin
      const { data: admins } = await supabase
        .from('cashiers')
        .select('id')
        .eq('business_id', business.id)
        .eq('role', 'admin')
        .eq('is_active', true)

      const targetIsAdmin = admins?.some((a: any) => a.id === id)
      if (targetIsAdmin && (admins?.length ?? 0) <= 1) {
        return json({ error: 'Cannot delete the last admin account.' }, 400)
      }

      const { error } = await supabase
        .from('cashiers')
        .delete()
        .eq('id', id)
        .eq('business_id', business.id)
      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
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
