// Supabase Edge Function: create-invoice
// Called by Electron app to generate a Xendit payment link

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAYMENT_SUCCESS_URL = Deno.env.get('PAYMENT_SUCCESS_URL') ?? ''
const ACTIVATION_FEE = 399

// Validate required environment variables
if (!XENDIT_SECRET_KEY) {
  console.error('XENDIT_SECRET_KEY environment variable is required')
  throw new Error('Server configuration error: XENDIT_SECRET_KEY not set')
}
if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  throw new Error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY not set')
}

async function fetchInvoiceDetails(invoiceId: string) {
  const response = await fetch(`https://api.xendit.co/v2/invoices/${invoiceId}`, {
    headers: {
      'Authorization': `Basic ${btoa(XENDIT_SECRET_KEY + ':')}`,
    },
  })

  if (!response.ok) {
    const rawError = await response.text()
    throw new Error(rawError || 'Failed to fetch existing payment link')
  }

  return response.json()
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
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Invalid token' }, 401)
    }

    let installationId: string
    try {
      const body = await req.json()
      installationId = body?.installationId
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }
    if (!installationId) {
      return json({ error: 'installationId required' }, 400)
    }

    const externalId = `reyna-pos-${user.id}`

    // Check if subscription is still active for this user.
    const { data: existing } = await supabase
      .from('activations')
      .select('expires_at, xendit_invoice_id, xendit_external_id')
      .eq('user_id', user.id)
      .single()

    if (existing?.expires_at && new Date(existing.expires_at) > new Date()) {
      return json({ alreadyActivated: true, expiresAt: existing.expires_at })
    }

    if (existing?.xendit_invoice_id && existing.xendit_external_id === externalId) {
      const existingInvoice = await fetchInvoiceDetails(existing.xendit_invoice_id)
      if (existingInvoice?.status !== 'PAID' && existingInvoice?.invoice_url) {
        return json({ invoiceUrl: existingInvoice.invoice_url })
      }
    }

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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(XENDIT_SECRET_KEY + ':')}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

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

    // Save or refresh the activation record for this account.
    const activationPayload = {
      user_id: user.id,
      installation_id: installationId,
      xendit_invoice_id: invoice.id,
      xendit_external_id: externalId,
      expires_at: null,
      activated_at: null,
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('activations')
        .update(activationPayload)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Failed to update activation record:', updateError)
        return json({ error: 'Failed to save activation record' }, 500)
      }
    } else {
      const { error: insertError } = await supabase
        .from('activations')
        .insert(activationPayload)

      if (insertError) {
        const isConflict = insertError.code === '23505' || insertError.message.toLowerCase().includes('duplicate key')
        if (isConflict) {
          const { data: conflictedActivation, error: fetchError } = await supabase
            .from('activations')
            .select('xendit_invoice_id, xendit_external_id')
            .eq('user_id', user.id)
            .single()

          if (!fetchError && conflictedActivation?.xendit_invoice_id && conflictedActivation.xendit_external_id === externalId) {
            const existingInvoice = await fetchInvoiceDetails(conflictedActivation.xendit_invoice_id)
            if (existingInvoice?.invoice_url) {
              return json({ invoiceUrl: existingInvoice.invoice_url })
            }
          }
        }

        console.error('Failed to insert activation record:', insertError)
        return json({ error: 'Failed to save activation record' }, 500)
      }
    }

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
