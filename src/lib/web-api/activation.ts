import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { getAccessToken } from './context'

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
      const token = await getAccessToken()
      if (!token) {
        // Check local activation cache
        const cached = localStorage.getItem('reyna_activation')
        if (cached) {
          const act = JSON.parse(cached)
          if (act.expires_at && new Date(act.expires_at) > new Date()) {
            return { activated: true, expires_at: act.expires_at }
          }
        }
        return { activated: false }
      }

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/check-activation`, {
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      })
      const data = await res.json()
      if (data.activated) {
        localStorage.setItem('reyna_activation', JSON.stringify({ expires_at: data.expires_at }))
      }
      return data
    } catch {
      const cached = localStorage.getItem('reyna_activation')
      if (cached) {
        try {
          const act = JSON.parse(cached)
          if (act.expires_at && new Date(act.expires_at) > new Date()) {
            return { activated: true, expires_at: act.expires_at }
          }
        } catch {}
      }
      return { activated: false }
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
        body: JSON.stringify({ installation_id: installId }),
      })
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error || 'Failed to create invoice' }
      return { success: true, invoiceUrl: data.invoice_url, invoiceId: data.invoice_id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  checkStatus: async () => {
    return activationApi.getStatus()
  },

  markActivated: async (expiresAt: string) => {
    localStorage.setItem('reyna_activation', JSON.stringify({ expires_at: expiresAt }))
    return { success: true }
  },
}
