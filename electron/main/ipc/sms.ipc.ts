import { ipcMain } from 'electron'
import axios from 'axios'
import { getDb } from '../db'
import { getValidCloudToken } from './auth.ipc'
import { IPC } from '../../../shared/ipc-channels'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

export function registerSmsHandlers() {
  // Send an SMS via the edge function (checks credits, sends, deducts)
  ipcMain.handle(IPC.SMS.SEND, async (_, phone: string, message: string) => {
    const token = await getValidCloudToken()
    if (!token) return { success: false, error: 'Not signed in to cloud account.' }

    try {
      const res = await axios.post(
        `${SUPABASE_FUNCTIONS_URL}/send-sms`,
        { phone, message },
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, timeout: 15000 }
      )
      // Cache updated credit balance locally
      if (res.data?.credits_remaining !== undefined) {
        try {
          getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('sms_credits', ?)`)
            .run(String(res.data.credits_remaining))
        } catch { /* non-fatal */ }
      }
      return { success: true, credits_remaining: res.data.credits_remaining }
    } catch (err: any) {
      const error = err?.response?.data?.error || err?.message || 'Failed to send SMS.'
      return { success: false, error }
    }
  })

  // Get current SMS credit balance (from cloud, then cache locally)
  ipcMain.handle(IPC.SMS.GET_CREDITS, async () => {
    const token = await getValidCloudToken()
    if (!token) {
      // Return locally cached value if available
      const cached = (getDb().prepare(`SELECT value FROM settings WHERE key = 'sms_credits'`).get() as any)?.value
      return { credits: cached !== undefined ? parseInt(cached) : null, cached: true }
    }
    try {
      const res = await axios.get(
        `${SUPABASE_FUNCTIONS_URL}/send-sms`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, timeout: 10000 }
      )
      const credits = res.data?.credits ?? 0
      // Cache locally
      getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('sms_credits', ?)`)
        .run(String(credits))
      return { credits, cached: false }
    } catch {
      const cached = (getDb().prepare(`SELECT value FROM settings WHERE key = 'sms_credits'`).get() as any)?.value
      return { credits: cached !== undefined ? parseInt(cached) : 0, cached: true }
    }
  })

  // Get recent SMS log from cloud
  ipcMain.handle(IPC.SMS.GET_LOG, async () => {
    const token = await getValidCloudToken()
    if (!token) return []
    try {
      // Query via the Supabase REST API directly
      const res = await axios.get(
        `${SUPABASE_URL}/rest/v1/sms_log?select=*&order=sent_at.desc&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM',
          },
          timeout: 10000,
        }
      )
      return res.data ?? []
    } catch {
      return []
    }
  })
}
