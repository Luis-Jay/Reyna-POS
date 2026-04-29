import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { getAccessToken } from './context'
import { settingsApi } from './settings'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'
const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'

export const smsApi = {
  send: async (phone: string, message: string) => {
    try {
      const token = await getAccessToken()
      if (!token) return { success: false, error: 'Not signed in to cloud account.' }

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ phone, message }),
      })
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error || 'Failed to send SMS' }

      if (data.credits_remaining !== undefined) {
        await settingsApi.set('sms_credits', String(data.credits_remaining))
      }
      return { success: true, credits_remaining: data.credits_remaining }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getCredits: async () => {
    try {
      const token = await getAccessToken()
      if (!token) {
        const cached = await settingsApi.get('sms_credits')
        return { credits: cached !== null ? parseInt(cached) : null, cached: true }
      }

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-sms`, {
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      })
      const data = await res.json()
      const credits = data?.credits ?? 0
      await settingsApi.set('sms_credits', String(credits))
      return { credits, cached: false }
    } catch {
      const cached = await settingsApi.get('sms_credits')
      return { credits: cached !== null ? parseInt(cached) : 0, cached: true }
    }
  },

  getLog: async () => {
    try {
      const token = await getAccessToken()
      if (!token) return []
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/sms_log?select=*&order=sent_at.desc&limit=50`,
        { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } }
      )
      return res.ok ? await res.json() : []
    } catch {
      return []
    }
  },
}
