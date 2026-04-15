import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SEMAPHORE_API_KEY    = Deno.env.get('SEMAPHORE_API_KEY') ?? ''
const SEMAPHORE_SENDER     = Deno.env.get('SEMAPHORE_SENDER_NAME') ?? 'REYNA'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select('id, sms_credits')
      .eq('user_id', user.id)
      .single()

    if (bizError || !business) return json({ error: 'Business not found' }, 404)

    // GET — return current credit balance
    if (req.method === 'GET') {
      return json({ credits: business.sms_credits })
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const { phone, message } = await req.json()
    if (!phone || !message) return json({ error: 'phone and message are required' }, 400)

    // Check credits
    if (business.sms_credits < 1) {
      return json({ error: 'Insufficient SMS credits. Please top up.' }, 402)
    }

    // Atomically deduct 1 credit (only if still > 0)
    const { data: updated, error: deductError } = await supabase
      .from('businesses')
      .update({ sms_credits: business.sms_credits - 1 })
      .eq('id', business.id)
      .eq('sms_credits', business.sms_credits) // optimistic lock
      .select('sms_credits')
      .single()

    if (deductError || !updated) {
      return json({ error: 'Credit deduction failed. Please try again.' }, 409)
    }

    // Send via Semaphore
    const semaphoreRes = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: SEMAPHORE_API_KEY,
        number: phone,
        message,
        sendername: SEMAPHORE_SENDER,
      }),
    })

    const semaphoreData = await semaphoreRes.json().catch(() => null)
    const success = semaphoreRes.ok

    // Log the send attempt
    await supabase.from('sms_log').insert({
      business_id:  business.id,
      recipient:    phone,
      message,
      status:       success ? 'sent' : 'failed',
      error:        success ? null : JSON.stringify(semaphoreData),
      credits_used: 1,
    })

    // If Semaphore failed, refund the credit
    if (!success) {
      await supabase
        .from('businesses')
        .update({ sms_credits: updated.sms_credits + 1 })
        .eq('id', business.id)
      return json({ error: 'SMS delivery failed. Credit refunded.' }, 502)
    }

    return json({ success: true, credits_remaining: updated.sms_credits })
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
