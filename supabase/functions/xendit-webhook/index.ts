// Supabase Edge Function: xendit-webhook
// Xendit calls this when a payment is completed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const XENDIT_WEBHOOK_KEY = Deno.env.get('XENDIT_WEBHOOK_KEY') ?? ''

Deno.serve(async (req) => {
  // Verify webhook token from Xendit
  const callbackToken = req.headers.get('x-callback-token')
  if (XENDIT_WEBHOOK_KEY && callbackToken !== XENDIT_WEBHOOK_KEY) {
    console.warn('Rejected webhook — invalid token')
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const event = await req.json()
    console.log('Xendit webhook:', event.status, event.external_id)

    if (event.status === 'PAID' && event.external_id?.startsWith('reyna-pos-')) {
      const key = event.external_id.replace('reyna-pos-', '')
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // now + 30 days

      // Try to update by xendit_external_id (works for both user_id and installation_id records)
      const { error } = await supabase
        .from('activations')
        .update({
          activated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('xendit_external_id', event.external_id)

      if (error) {
        console.error('DB update error:', error)
        return new Response('DB error', { status: 500 })
      }

      console.log(`Activated: ${key}, expires: ${expiresAt.toISOString()}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response('Internal error', { status: 500 })
  }
})
