import { createClient } from '@supabase/supabase-js'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const sb = createClient('https://rzhjfsgjkbvcspfncyku.supabase.co', SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Edit these ──────────────────────────────────────────────
const CASHIER_NAME = 'bethcueto@gmail.com'
const NEW_PIN = '1821'
// ────────────────────────────────────────────────────────────

async function main() {
  const { data, error } = await sb
    .from('cashiers')
    .update({ pin: NEW_PIN })
    .ilike('name', CASHIER_NAME)
    .select('id, name, role')

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.error('No cashier found with that name.')
    return
  }

  console.log('PIN reset successfully for:', data.map((c: any) => `${c.name} (${c.role})`).join(', '))
}

main()
