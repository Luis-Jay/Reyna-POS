// Supabase Edge Function: check-activation
// Called by Electron app to verify if payment was completed and subscription is active

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY') ?? ''

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

    const url = new URL(req.url)
    const installationId = url.searchParams.get('id')
    if (!installationId) {
      return json({ error: 'id required' }, 400)
    }

    const { data, error } = await supabase
      .from('activations')
      .select('installation_id, activated_at, expires_at, xendit_invoice_id')
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return json({ activated: false })
    }

    const now = new Date()
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null
    const activated = expiresAt !== null && expiresAt > now

    if (!activated && data.xendit_invoice_id && XENDIT_SECRET_KEY) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      let invoiceRes
      try {
        invoiceRes = await fetch(`https://api.xendit.co/v2/invoices/${data.xendit_invoice_id}`, {
          headers: {
            'Authorization': `Basic ${btoa(XENDIT_SECRET_KEY + ':')}`,
          },
          signal: controller.signal,
        })
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          console.error('Xendit API request timed out')
          return json({ activated: false, error: 'Payment verification timeout' }, 408)
        }
        throw err
      }
      clearTimeout(timeoutId)

      if (invoiceRes.ok) {
        const invoice = await invoiceRes.json()
        if (invoice.status === 'PAID') {
          const freshNow = new Date()
          const newExpiresAt = new Date(freshNow.getTime() + 30 * 24 * 60 * 60 * 1000)

          const { error: updateError } = await supabase
            .from('activations')
            .update({
              installation_id: installationId,
              activated_at: freshNow.toISOString(),
              expires_at: newExpiresAt.toISOString(),
            })
            .eq('user_id', user.id)

          if (!updateError) {
            return json({ activated: true, expiresAt: newExpiresAt.toISOString() })
          } else {
            console.error('Failed to update activation record:', updateError)
            return json({ error: 'activation update failed', details: updateError }, 500)
          }
        }
      }
    }

    if (activated && data.installation_id !== installationId) {
      const { error: updateError } = await supabase
        .from('activations')
        .update({ installation_id: installationId })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Failed to update installation_id:', updateError)
        return json({ activated: false, error: 'Failed to update activation record' }, 500)
      }
    }

    return json({ activated, expiresAt: data.expires_at ?? null })
  } catch (err) {
    console.error(err)
    return json({ activated: false, error: 'Internal error' }, 500)
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
