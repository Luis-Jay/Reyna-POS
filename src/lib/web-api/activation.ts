import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { getAccessToken } from './context'

const CACHE_KEY = 'reyna_activation'

function readCachedActivation() {
  const cached = localStorage.getItem(CACHE_KEY)
  if (!cached) return { activated: false }
  try {
    const act = JSON.parse(cached)
    if (act.expires_at && new Date(act.expires_at) > new Date()) {
      return { activated: true, expires_at: act.expires_at }
    }
  } catch {}
  return { activated: false }
}

export function clearCachedActivation() {
  localStorage.removeItem(CACHE_KEY)
}

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

function getOrCreateInstallId(): string {
  const key = 'reyna_installation_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export const activationApi = {
  getInstallId: async () => getOrCreateInstallId(),

  getStatus: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return readCachedActivation()

      // Query activations table directly — owner_read RLS allows this
      const { data, error } = await supabase
        .from('activations')
        .select('expires_at')
        .eq('user_id', user.id)
        .single()

      if (error) {
        const code = String((error as any)?.code || '')
        const details = String((error as any)?.details || '').toLowerCase()
        const message = String((error as any)?.message || '').toLowerCase()
        const noRow =
          code === 'PGRST116' ||
          details.includes('0 rows') ||
          message.includes('0 rows') ||
          message.includes('no rows')

        if (noRow) {
          clearCachedActivation()
          return { activated: false, expires_at: null }
        }

        return readCachedActivation()
      }

      if (data?.expires_at && new Date(data.expires_at) > new Date()) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ expires_at: data.expires_at }))
        return { activated: true, expires_at: data.expires_at }
      }

      clearCachedActivation()
      return { activated: false, expires_at: null }
    } catch {
      return readCachedActivation()
    }
  },

  createInvoice: async () => {
    try {
      const token = await getAccessToken()
      const installId = getOrCreateInstallId()
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({
          installationId: installId,
          installation_id: installId,
        }),
      })
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error || 'Failed to create invoice' }
      return {
        success: true,
        alreadyActivated: data.alreadyActivated === true,
        invoiceUrl: data.invoiceUrl || data.invoice_url,
        invoiceId: data.invoiceId || data.invoice_id,
      }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  checkStatus: async () => {
    try {
      const token = await getAccessToken()
      if (!token) return activationApi.getStatus()

      // Call Edge Function to verify Xendit payment and update the DB record
      const installId = getOrCreateInstallId()
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/check-activation?id=${encodeURIComponent(installId)}`, {
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      })
      if (!res.ok) return activationApi.getStatus()
      const data = await res.json()
      if (data.activated) {
        const expiresAt = data.expiresAt || data.expires_at
        if (expiresAt) localStorage.setItem(CACHE_KEY, JSON.stringify({ expires_at: expiresAt }))
      }
      // If Edge Function says not activated, double-check directly in DB (in case of installationId update error)
      if (!data.activated) return activationApi.getStatus()
      return data
    } catch {
      return activationApi.getStatus()
    }
  },

  markActivated: async (expiresAt: string) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ expires_at: expiresAt }))
    return { success: true }
  },
}
