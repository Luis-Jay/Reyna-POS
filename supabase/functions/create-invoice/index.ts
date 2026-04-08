// Supabase Edge Function: create-invoice
// Called by Electron app to generate a Xendit payment link

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAYMENT_SUCCESS_URL = Deno.env.get('PAYMENT_SUCCESS_URL') ?? ''
const ACTIVATION_FEE = 399

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Invalid token' }, 401)
    }

    const { installationId } = await req.json()
    if (!installationId) {
      return json({ error: 'installationId required' }, 400)
    }

    // Check if subscription is still active for this user
    const { data: existing } = await supabase
      .from('activations')
      .select('expires_at')
      .eq('user_id', user.id)
      .single()

    if (existing?.expires_at && new Date(existing.expires_at) > new Date()) {
      return json({ alreadyActivated: true })
    }

    // Use user ID for the external_id
    const externalId = `reyna-pos-${user.id}`

    // Create Xendit invoice
    const payload: Record<string, unknown> = {
      external_id: externalId,
      amount: ACTIVATION_FEE,
      description: `Reyna POS Monthly Subscription — ${installationId.slice(0, 8).toUpperCase()}`,
      currency: 'PHP',
      invoice_duration: 86400,
      items: [{ name: 'Reyna POS Monthly Subscription', quantity: 1, price: ACTIVATION_FEE }],
    }

    if (PAYMENT_SUCCESS_URL) {
      payload.success_redirect_url = PAYMENT_SUCCESS_URL
    }

    const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(XENDIT_SECRET_KEY + ':')}`,
      },
      body: JSON.stringify(payload),
    })

    if (!xenditRes.ok) {
      const rawError = await xenditRes.text()
      let parsedError: unknown = rawError

      try {
        parsedError = JSON.parse(rawError)
      } catch {
        // Keep the raw response text when Xendit does not return JSON.
      }

      console.error('Xendit error:', parsedError)

      const errorMessage =
        typeof parsedError === 'object' && parsedError !== null && 'message' in parsedError
          ? String(parsedError.message)
          : rawError || 'Failed to create payment link'

      return json({ error: `Failed to create payment link: ${errorMessage}` }, 500)
    }

    const invoice = await xenditRes.json()

    // Save pending activation record
    await supabase.from('activations').upsert({
      user_id: user.id,
      installation_id: installationId,
      xendit_invoice_id: invoice.id,
      xendit_external_id: externalId,
      expires_at: null,
      activated_at: null,
    })

    return json({ invoiceUrl: invoice.invoice_url })
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
