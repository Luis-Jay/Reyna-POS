// Supabase Edge Function: xendit-webhook
// Xendit calls this when a payment is completed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const XENDIT_WEBHOOK_KEY = Deno.env.get('XENDIT_WEBHOOK_KEY') ?? ''

Deno.serve(async (req) => {
  // Verify webhook token from Xendit — fail closed if key is not configured
  const callbackToken = req.headers.get('x-callback-token')
  if (!XENDIT_WEBHOOK_KEY || callbackToken !== XENDIT_WEBHOOK_KEY) {
    console.warn('Rejected webhook — missing or invalid token')
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const event = await req.json()
    console.log('Xendit webhook:', event.status, event.external_id)

    if (event.status === 'PAID' && event.external_id?.startsWith('reyna-pos-')) {
      const key = event.external_id.replace('reyna-pos-', '')
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      const { data: activation, error: lookupError } = await supabase
        .from('activations')
        .select('id, user_id, expires_at, xendit_invoice_id, xendit_external_id')
        .eq('user_id', key)
        .maybeSingle()

      if (lookupError) {
        console.error('Activation lookup error:', lookupError)
        return new Response('DB error', { status: 500 })
      }

      if (!activation || activation.xendit_external_id !== event.external_id) {
        console.error(`No activation record found for key: ${key}`)
        return new Response(JSON.stringify({
          received: true,
          ignored: true,
          reason: 'activation_record_not_found',
        }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (activation.expires_at && new Date(activation.expires_at) > new Date()) {
        return new Response(JSON.stringify({
          received: true,
          ignored: true,
          reason: 'already_processed',
        }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // now + 30 days

      const { error } = await supabase
        .from('activations')
        .update({
          activated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', activation.id)
        .select()

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
