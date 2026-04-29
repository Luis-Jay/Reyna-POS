import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import axios from 'axios'
import { getActiveCloudUserId, getDb, migrateLocalDeviceDataToCloudUser, setActiveCloudUserId, withScopedDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { reconnectRealtime, disconnectRealtime } from '../realtime'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

function getFriendlyCloudError(err: any, phase: 'signup' | 'login' | 'sync') {
  const raw =
    err?.response?.data?.error_description ||
    err?.response?.data?.msg ||
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    'Unknown error'

  if (typeof raw === 'string' && raw.toLowerCase().includes('invalid jwt')) {
    if (phase === 'sync') {
      return 'Your account login succeeded, but the cloud restore service rejected the session token. This usually means the Supabase Edge Function secrets are pointed at a different project than the app.'
    }
    return 'Sign-in failed: the app\'s API key was rejected by the server. Please reinstall the app or contact support.'
  }

  if (phase === 'login' && typeof raw === 'string' && raw.toLowerCase().includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }

  return raw
}

function getCloudToken(): string | null {
  try {
    const row = getDb().prepare(`SELECT value FROM settings WHERE key = 'cloud_access_token'`).get() as any
    return row?.value ?? null
  } catch {
    return null
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.exp < Math.floor(Date.now() / 1000) + 30 // refresh 30s before actual expiry
  } catch {
    return true
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const db = getDb()
    const refreshToken = (db.prepare(`SELECT value FROM settings WHERE key = 'cloud_refresh_token'`).get() as any)?.value
    if (!refreshToken) return null

    const res = await axios.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      { refresh_token: refreshToken },
      { headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
    )

    const { access_token, refresh_token: newRefreshToken } = res.data
    if (!access_token) return null

    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_access_token', ?)`).run(access_token)
    if (newRefreshToken) {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_refresh_token', ?)`).run(newRefreshToken)
    }

    return access_token
  } catch {
    return null
  }
}

export async function getValidCloudToken(): Promise<string | null> {
  const token = getCloudToken()
  if (!token) return null
  if (!isTokenExpired(token)) return token
  return refreshAccessToken()
}

function applyCloudCashiers(
  cashiers: any[],
  options: { fallbackAdminPin?: string } = {}
) {
  const db = getDb()
  const incomingIds = new Set(cashiers.map(c => c.id))

  if (incomingIds.size > 0) {
    db.prepare(`
      UPDATE users
      SET is_active = 0
      WHERE deleted_at IS NULL
        AND id NOT IN (${Array.from(incomingIds).map(() => '?').join(', ')})
    `).run(...incomingIds)
  }

  for (const c of cashiers) {
    const existing: any = db.prepare(`SELECT id, pin FROM users WHERE id = ?`).get(c.id)
    const existingPin = typeof existing?.pin === 'string' && existing.pin.trim() ? existing.pin : null
    const cloudPin = typeof c.pin === 'string' && c.pin.trim() ? c.pin : null
    const resolvedPin =
      cloudPin ||
      existingPin ||
      (c.role === 'admin' ? options.fallbackAdminPin : `restored-needs-reset-${uuid()}`)

    if (!resolvedPin) {
      throw new Error('Cloud restore needs a new owner PIN for this device.')
    }

    // Cloud restores do not return cashier PINs. Keep non-admin restored users inactive
    // until the admin assigns them a fresh local PIN on this device.
    const restoredWithoutPin = !cloudPin && !existingPin
    const resolvedIsActive = restoredWithoutPin && c.role !== 'admin'
      ? 0
      : (c.is_active ? 1 : 0)

    if (existing) {
      db.prepare(`UPDATE users SET name = ?, pin = ?, role = ?, is_active = ?, deleted_at = NULL WHERE id = ?`)
        .run(c.name, resolvedPin, c.role, resolvedIsActive, c.id)
    } else {
      db.prepare(`INSERT OR IGNORE INTO users (id, name, pin, role, is_active, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`)
        .run(c.id, c.name, resolvedPin, c.role, resolvedIsActive)
    }
  }
}

function isBusinessMissingError(err: any) {
  const raw =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    ''

  return typeof raw === 'string' && raw.toLowerCase().includes('business not found')
}

function getLocalSetupFallback() {
  const db = getDb()
  const storeNameRow = db.prepare(`SELECT value FROM settings WHERE key = 'store_name'`).get() as any
  const storePhoneRow = db.prepare(`SELECT value FROM settings WHERE key = 'store_phone'`).get() as any
  const adminUser = db.prepare(`
    SELECT name, pin
    FROM users
    WHERE role = 'admin' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as any

  return {
    storeName: (storeNameRow?.value || 'Reyna Store').trim(),
    storePhone: storePhoneRow?.value || '',
    adminName: (adminUser?.name || 'Admin').trim(),
    adminPin: adminUser?.pin || '1234',
  }
}

function persistCloudSession(data: {
  userId: string
  accessToken: string
  refreshToken?: string
  storeName?: string
  storePhone?: string
  targetCloudUserId?: string | null
}) {
  withScopedDb(data.targetCloudUserId ?? getActiveCloudUserId(), (db) => {
    const fallback = getLocalSetupFallback()
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_user_id', ?)`).run(data.userId)
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_access_token', ?)`).run(data.accessToken)
    if (data.refreshToken) {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_refresh_token', ?)`).run(data.refreshToken)
    }
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', ?)`).run(data.storeName ?? fallback.storeName)
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('store_phone', ?)`).run(data.storePhone ?? fallback.storePhone)
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_completed', 'true')`).run()
  })
}

function clearCloudSession() {
  const db = getDb()
  db.prepare(`DELETE FROM settings WHERE key IN ('cloud_user_id', 'cloud_access_token', 'cloud_refresh_token')`).run()
}

async function fetchCloudBusinessSnapshot(accessToken: string) {
  return axios.get(
    `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
  )
}

async function repairMissingCloudBusiness(accessToken: string) {
  const fallback = getLocalSetupFallback()

  await axios.post(
    `${SUPABASE_FUNCTIONS_URL}/business-setup`,
    {
      storeName: fallback.storeName,
      storePhone: fallback.storePhone,
      adminPin: fallback.adminPin,
      adminName: fallback.adminName,
    },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
  )
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ensureAdminIdIsUUID(): string {
  const db = getDb()
  const admin: any = db.prepare(`
    SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1
  `).get()

  if (!admin) return uuid()
  if (UUID_REGEX.test(admin.id)) return admin.id

  // Seed ID like 'admin-001' — migrate to a proper UUID so cloud tables accept it
  const newId = uuid()
  const migrateAdminId = db.transaction((nextId: string, oldId: string) => {
    db.pragma('foreign_keys = OFF')
    try {
      db.prepare(`UPDATE users SET id = ? WHERE id = ?`).run(nextId, oldId)
      db.prepare(`UPDATE orders SET user_id = ? WHERE user_id = ?`).run(nextId, oldId)
      db.prepare(`UPDATE stock_movements SET user_id = ? WHERE user_id = ?`).run(nextId, oldId)
      db.prepare(`UPDATE debtor_transactions SET user_id = ? WHERE user_id = ?`).run(nextId, oldId)
      db.prepare(`UPDATE audit_log SET user_id = ? WHERE user_id = ?`).run(nextId, oldId)
    } finally {
      db.pragma('foreign_keys = ON')
    }
  })
  migrateAdminId(newId, admin.id)
  return newId
}

async function pushCashiersToCloud(accessToken: string, users: any[]) {
  await axios.post(
    `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
    { cashiers: users },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
  )
}

export function registerAuthHandlers() {
  // ─── Local PIN login ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AUTH.LOGIN, (_, name: string, pin: string) => {
    const db = getDb()
    const user: any = db.prepare(`
      SELECT id, name, role, is_active, permissions FROM users
      WHERE (LOWER(name) = LOWER(?) OR role = ?) AND pin = ? AND is_active = 1 AND deleted_at IS NULL
    `).get(name, name, pin)
    if (!user) return { success: false, error: 'Invalid name or PIN' }
    return { success: true, user }
  })

  ipcMain.handle(IPC.AUTH.LOGOUT, () => ({ success: true }))

  ipcMain.handle(IPC.AUTH.CLOUD_LOGOUT, () => {
    clearCloudSession()
    setActiveCloudUserId(null)
    disconnectRealtime()
    return { success: true }
  })

  ipcMain.handle(IPC.AUTH.GET_USERS, () => {
    return getDb().prepare(`SELECT id, name, role, is_active, permissions, created_at FROM users WHERE deleted_at IS NULL ORDER BY role DESC, name`).all()
  })

  ipcMain.handle(IPC.AUTH.CREATE_USER, async (_, data: any) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)`)
      .run(id, data.name, data.pin, data.role || 'cashier')

    // Push to cloud if logged in
    const token = await getValidCloudToken()
    if (token) {
      try {
        const users = db.prepare(`SELECT id, name, pin, role, is_active FROM users WHERE deleted_at IS NULL`).all()
        await axios.post(
          `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
          { cashiers: users },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
        )
      } catch { /* non-fatal */ }
    }

    return { success: true, id }
  })

  ipcMain.handle(IPC.AUTH.UPDATE_USER, async (_, id: string, data: any) => {
    const db = getDb()
    const permissionsJson = data.permissions !== undefined ? JSON.stringify(data.permissions) : undefined
    if (data.pin) {
      db.prepare(`UPDATE users SET name = COALESCE(?, name), pin = ?, role = COALESCE(?, role), is_active = COALESCE(?, is_active), permissions = COALESCE(?, permissions) WHERE id = ?`)
        .run(data.name, data.pin, data.role, data.is_active, permissionsJson ?? null, id)
    } else {
      db.prepare(`UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), is_active = COALESCE(?, is_active), permissions = COALESCE(?, permissions) WHERE id = ?`)
        .run(data.name, data.role, data.is_active, permissionsJson ?? null, id)
    }

    // Push to cloud if logged in
    const token = await getValidCloudToken()
    if (token) {
      try {
        const users = db.prepare(`SELECT id, name, pin, role, is_active FROM users WHERE deleted_at IS NULL`).all()
        await axios.post(
          `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
          { cashiers: users },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
        )
      } catch { /* non-fatal */ }
    }

    return { success: true }
  })

  // ─── Cloud signup (new account) ─────────────────────────────────────────────
  ipcMain.handle(IPC.AUTH.SIGNUP, async (_, data: {
    email: string
    password: string
    storeName: string
    storePhone: string
    adminPin: string
    adminName?: string
  }) => {
    try {
      const previousActiveCloudUserId = getActiveCloudUserId()
      const localDb = getDb()
      const localAdmin: any = localDb.prepare(`
        SELECT id
        FROM users
        WHERE role = 'admin' AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `).get()

      let adminId: string
      let usersForCloud: any[]
      if (localAdmin) {
        // Migrate seed IDs (e.g. 'admin-001') to a UUID so the cloud cashiers table accepts them
        adminId = ensureAdminIdIsUUID()
        localDb.prepare(`UPDATE users SET pin = ?, name = ?, is_active = ? WHERE id = ?`)
          .run(data.adminPin, data.adminName ?? 'Admin', 1, adminId)
      } else {
        // No existing admin, create new one with a new ID
        adminId = uuid()
        localDb.prepare(`INSERT INTO users (id, name, pin, role, is_active, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`)
          .run(adminId, data.adminName ?? 'Admin', data.adminPin, 'admin', 1)
      }
      usersForCloud = localDb.prepare(`SELECT id, name, pin, role, is_active FROM users WHERE deleted_at IS NULL`).all()

      // 1. Create Supabase Auth account
      const signupRes = await axios.post(
        `${SUPABASE_URL}/auth/v1/signup`,
        { email: data.email, password: data.password },
        {
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      )

      const { access_token, refresh_token: signup_refresh_token, user } = signupRes.data

      if (!access_token || !user) {
        return { success: false, error: 'Signup succeeded but no session returned. Check your email to confirm your account, then sign in.' }
      }

      // 2. Create business + admin cashier in Supabase
      await axios.post(
        `${SUPABASE_FUNCTIONS_URL}/business-setup`,
        {
          storeName: data.storeName,
          storePhone: data.storePhone,
          adminId,
          adminPin: data.adminPin,
          adminName: data.adminName ?? 'Admin',
        },
        { headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000 }
      )

      // 2b. Explicitly sync the current local cashier list so the account can be restored on other devices.
      // 3. Move the current device-local setup into this cloud account's storage
      try {
        await pushCashiersToCloud(access_token, usersForCloud)
        migrateLocalDeviceDataToCloudUser(user.id)
        setActiveCloudUserId(user.id)
      } catch (syncError) {
        setActiveCloudUserId(previousActiveCloudUserId)

        // Attempt cleanup - delete the created account if possible
        try {
          await axios.delete(`${SUPABASE_FUNCTIONS_URL}/business-setup`, {
            headers: { Authorization: `Bearer ${access_token}` },
            timeout: 5000
          })
        } catch (cleanupError) {
          console.warn('Business setup cleanup endpoint unavailable or rollback failed:', cleanupError)
        }
        throw new Error(`Account setup failed during data migration: ${syncError instanceof Error ? syncError.message : String(syncError)}. The cloud account was created but local data sync failed. Please try signing in again to restore your account, or contact support if the issue persists.`)
      }

      // 4. Persist session + settings locally
      persistCloudSession({
        userId: user.id,
        accessToken: access_token,
        refreshToken: signup_refresh_token,
        storeName: data.storeName,
        storePhone: data.storePhone,
      })

      return { success: true, userId: user.id }
    } catch (err: any) {
      return { success: false, error: getFriendlyCloudError(err, 'signup') }
    }
  })

  // ─── Cloud login (restore on new device) ────────────────────────────────────
  ipcMain.handle(IPC.AUTH.CLOUD_LOGIN, async (_, data: { email: string; password: string; localPin?: string }) => {
    try {
      // 1. Authenticate with Supabase
      const loginRes = await axios.post(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        { email: data.email, password: data.password },
        {
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      )

      const { access_token, refresh_token: login_refresh_token, user } = loginRes.data

      if (!access_token || !user) {
        return { success: false, error: 'Login succeeded but no session was returned.' }
      }

      // 2. Fetch business + cashiers from Supabase
      let syncRes
      try {
        syncRes = await fetchCloudBusinessSnapshot(access_token)
      } catch (syncErr: any) {
        if (!isBusinessMissingError(syncErr)) {
          const friendlyError = getFriendlyCloudError(syncErr, 'sync')
          if (typeof friendlyError === 'string' && friendlyError.toLowerCase().includes('cloud restore service rejected the session token')) {
            persistCloudSession({ userId: user.id, accessToken: access_token, refreshToken: login_refresh_token })
            return {
              success: true,
              userId: user.id,
              warning: 'Cloud restore is temporarily unavailable, but your account was connected on this device. You can continue with local data and sync later.',
            }
          }
          return { success: false, error: friendlyError }
        }

        try {
          await repairMissingCloudBusiness(access_token)
          syncRes = await fetchCloudBusinessSnapshot(access_token)
        } catch (repairErr: any) {
          return { success: false, error: getFriendlyCloudError(repairErr, 'sync') }
        }
      }

      const { cashiers, business } = syncRes.data

      if (!Array.isArray(cashiers) || cashiers.length === 0) {
        return {
          success: false,
          error: 'This account has no synced cashier profile yet. Sign in on the original device once more so it can sync the owner name and PIN, then try restoring on this device again.',
        }
      }

      // 3. Persist session + settings in the target account storage before switching scopes
      persistCloudSession({
        userId: user.id,
        accessToken: access_token,
        refreshToken: login_refresh_token,
        storeName: business.store_name,
        storePhone: business.store_phone ?? '',
        targetCloudUserId: user.id,
      })

      // 4. Switch this device into the signed-in account's isolated storage
      setActiveCloudUserId(user.id)

      const fallbackAdminPin = (typeof data.localPin === 'string' && data.localPin.trim())
        ? data.localPin.trim()
        : '1234'

      // 5. Upsert all cashiers into local users table
      applyCloudCashiers(cashiers, { fallbackAdminPin })

      // Connect Realtime to the signed-in account's broadcast channel
      reconnectRealtime()

      const restoredCashierCount = cashiers.filter((cashier: any) => cashier.role !== 'admin').length
      return {
        success: true,
        userId: user.id,
        warning: restoredCashierCount > 0
          ? 'Cashier accounts were restored as inactive on this device. Set new local PINs for them in Users before they sign in.'
          : undefined,
      }
    } catch (err: any) {
      return { success: false, error: getFriendlyCloudError(err, 'login') }
    }
  })

  // ─── Sync cashiers to cloud ──────────────────────────────────────────────────
  ipcMain.handle(IPC.AUTH.SYNC_CASHIERS, async () => {
    const token = getCloudToken()
    if (!token) return { success: false, error: 'Not signed in to cloud' }

    try {
      const users = getDb().prepare(`SELECT id, name, pin, role, is_active FROM users WHERE deleted_at IS NULL`).all()
      await axios.post(
        `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
        { cashiers: users },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      )
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
