import { ipcMain, shell } from 'electron'
import { v4 as uuid } from 'uuid'
import axios from 'axios'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { getValidCloudToken, refreshAccessToken } from './auth.ipc'
import { scheduleAutoSync } from './sync.ipc'

// Supabase project URL — replace with your actual Supabase project ref
// Format: https://<your-project-ref>.supabase.co/functions/v1
const SUPABASE_FUNCTIONS_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co/functions/v1'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

function getFriendlyActivationError(err: any) {
  const code = err?.code
  const responseError =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Could not connect.'

  if (code === 'ENOTFOUND') {
    return 'Cannot resolve the Supabase server address. Check your internet, DNS, VPN, or firewall settings and try again.'
  }

  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    return 'Cannot reach the payment server right now. Check your internet connection and try again.'
  }

  if (typeof responseError === 'string' && responseError.toLowerCase().includes('requested path is invalid')) {
    return 'The payment function route was not found. Make sure the Supabase Edge Functions are deployed for this project.'
  }

  if (typeof responseError === 'string' && responseError.toLowerCase().includes('invalid jwt')) {
    return 'Your cloud session expired or no longer matches this Supabase project. Please sign in again.'
  }

  return responseError
}

function isInvalidJwtError(err: any) {
  const responseError =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    ''

  return typeof responseError === 'string' && responseError.toLowerCase().includes('invalid jwt')
}

function getOrCreateInstallId(): string {
  const db = getDb()
  let row = db.prepare(`SELECT value FROM settings WHERE key = 'installation_id'`).get() as any
  if (!row || !row.value) {
    const id = uuid()
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('installation_id', ?)`).run(id)
    return id
  }
  return row.value
}

export function registerActivationHandlers() {
  // Get or generate the unique installation ID for this device
  ipcMain.handle(IPC.ACTIVATION.GET_INSTALL_ID, () => {
    return getOrCreateInstallId()
  })

  ipcMain.handle(IPC.ACTIVATION.GET_STATUS, () => {
    const db = getDb()
    const activated = db.prepare(`SELECT value FROM settings WHERE key = 'activated'`).get() as any
    const expiresAt = db.prepare(`SELECT value FROM settings WHERE key = 'expires_at'`).get() as any
    const active =
      activated?.value === 'true' &&
      !!expiresAt?.value &&
      new Date(expiresAt.value) > new Date()

    return {
      activated: active,
      expiresAt: expiresAt?.value || null,
    }
  })

  // Ask Supabase Edge Function to create a Xendit invoice, then open it in the browser
  ipcMain.handle(IPC.ACTIVATION.CREATE_INVOICE, async () => {
    const installId = getOrCreateInstallId()
    let token = await getValidCloudToken()
    if (!token) {
      return { success: false, error: 'No cloud session found. Please sign in again.' }
    }

    const requestInvoice = async (accessToken: string) => axios.post(
      `${SUPABASE_FUNCTIONS_URL}/create-invoice`,
      { installationId: installId },
      { timeout: 15000, headers: { Authorization: `Bearer ${accessToken}` } }
    )

    try {
      let res
      try {
        res = await requestInvoice(token)
      } catch (err: any) {
        if (!isInvalidJwtError(err)) throw err

        const refreshedToken = await refreshAccessToken()
        if (!refreshedToken) throw err

        token = refreshedToken
        res = await requestInvoice(token)
      }

      if (res.data.alreadyActivated) {
        // Subscription is still active — no need to pay
        return {
          success: true,
          alreadyActivated: true,
          expiresAt: res.data.expiresAt ?? null,
        }
      }
      const { invoiceUrl } = res.data
      if (invoiceUrl) {
        await shell.openExternal(invoiceUrl)
        return { success: true }
      }
      return { success: false, error: 'No invoice URL returned' }
    } catch (err: any) {
      return { success: false, error: getFriendlyActivationError(err) }
    }
  })

  // Check with Supabase if this installation has an active subscription
  ipcMain.handle(IPC.ACTIVATION.CHECK_STATUS, async () => {
    const installId = getOrCreateInstallId()
    let token = await getValidCloudToken()
    if (!token) {
      return { activated: false, expiresAt: null, error: 'No cloud session found. Please sign in again.' }
    }

    const requestStatus = async (accessToken: string) => axios.get(
      `${SUPABASE_FUNCTIONS_URL}/check-activation`,
      {
        params: { id: installId },
        timeout: 15000,
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    try {
      let res
      try {
        res = await requestStatus(token)
      } catch (err: any) {
        if (!isInvalidJwtError(err)) throw err

        const refreshedToken = await refreshAccessToken()
        if (!refreshedToken) throw err

        token = refreshedToken
        res = await requestStatus(token)
      }

      return {
        activated: res.data.activated === true,
        expiresAt: res.data.expiresAt ?? null,
        error: null,
      }
    } catch (err: any) {
      return { activated: false, expiresAt: null, error: getFriendlyActivationError(err) }
    }
  })

  // Write activated=true and expires_at to local DB (called after successful check)
  ipcMain.handle(IPC.ACTIVATION.MARK_ACTIVATED, (_event, expiresAt: string) => {
    const db = getDb()
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('activated', 'true')`).run()
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('expires_at', ?)`).run(expiresAt)
    scheduleAutoSync()
    return { success: true }
  })
}

export function isActivated(): boolean {
  try {
    const db = getDb()
    const activated = db.prepare(`SELECT value FROM settings WHERE key = 'activated'`).get() as any
    if (activated?.value !== 'true') return false
    const expiresAt = db.prepare(`SELECT value FROM settings WHERE key = 'expires_at'`).get() as any
    if (!expiresAt?.value) return false
    return new Date(expiresAt.value) > new Date()
  } catch {
    return false
  }
}
