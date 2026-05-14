import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import axios from 'axios'
import { closeDb, getCurrentDbPath, getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const PRESERVED_SETTING_KEYS = [
  'cloud_user_id',
  'cloud_access_token',
  'setup_completed',
  'store_name',
  'store_phone',
  'activated',
  'expires_at',
  'installation_id',
]

function loadPreservedSettings() {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT key, value
      FROM settings
      WHERE key IN (${PRESERVED_SETTING_KEYS.map(() => '?').join(', ')})
    `).all(...PRESERVED_SETTING_KEYS) as Array<{ key: string; value: string }>

    return Object.fromEntries(rows.map(row => [row.key, row.value]))
  } catch {
    return {}
  }
}

function restoreSettings(settings: Record<string, string>) {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, value)
    }
  })
  tx()
}

function getLocalAdminSnapshot() {
  try {
    const admin = getDb().prepare(`
      SELECT id, pin
      FROM users
      WHERE role = 'admin' AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as { id?: string; pin?: string } | undefined

    return {
      id: admin?.id ?? null,
      pin: typeof admin?.pin === 'string' && admin.pin.trim() ? admin.pin.trim() : null,
    }
  } catch {
    return { id: null, pin: null }
  }
}

function applyCloudCashiers(cashiers: any[], options: { fallbackAdminPin?: string | null } = {}) {
  const db = getDb()
  for (const cashier of cashiers) {
    const existing: any = db.prepare(`SELECT id, pin FROM users WHERE id = ?`).get(cashier.id)
    const existingPin = typeof existing?.pin === 'string' && existing.pin.trim() ? existing.pin.trim() : null
    const cloudPin = typeof cashier.pin === 'string' && cashier.pin.trim() ? cashier.pin.trim() : null
    const preferredAdminPin =
      cashier.role === 'admin' &&
      options.fallbackAdminPin?.trim() &&
      (!existingPin || existingPin === '1234')
        ? options.fallbackAdminPin.trim()
        : null
    const resolvedPin =
      cloudPin ||
      preferredAdminPin ||
      existingPin ||
      (cashier.role === 'admin' && options.fallbackAdminPin?.trim()
        ? options.fallbackAdminPin.trim()
        : `restored-needs-reset-${cashier.id}`)
    const restoredWithoutPin = !cloudPin && !existingPin
    const resolvedIsActive = restoredWithoutPin && cashier.role !== 'admin'
      ? 0
      : (cashier.is_active ? 1 : 0)

    if (cashier.role === 'admin' && !cloudPin && !existingPin && !options.fallbackAdminPin?.trim()) {
      throw new Error('Owner PIN required to restore this account on this device.')
    }

    if (existing) {
      db.prepare(`UPDATE users SET name = ?, pin = ?, role = ?, is_active = ?, deleted_at = NULL WHERE id = ?`)
        .run(cashier.name, resolvedPin, cashier.role, resolvedIsActive, cashier.id)
    } else {
      db.prepare(`INSERT OR IGNORE INTO users (id, name, pin, role, is_active, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`)
        .run(cashier.id, cashier.name, resolvedPin, cashier.role, resolvedIsActive)
    }
  }
}

async function restoreCloudAccount(accessToken: string, options: { fallbackAdminPin?: string | null } = {}) {
  try {
    const syncRes = await axios.get(
      `${SUPABASE_FUNCTIONS_URL}/sync-cashiers`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
    )

    // Validate response data shape
    if (!syncRes || !syncRes.data || typeof syncRes.data !== 'object') {
      throw new Error('Invalid response format from sync service')
    }

    const data = syncRes.data
    const business = data.business && typeof data.business === 'object' ? data.business : {}

    restoreSettings({
      store_name: business?.store_name ?? 'Reyna Store',
      store_phone: business?.store_phone ?? '',
      setup_completed: 'true',
    })

    // Keep this a no-op when cashiers are missing; an empty array should not deactivate local users.
    if (Array.isArray(data.cashiers) && data.cashiers.length > 0) {
      applyCloudCashiers(data.cashiers, options)
    }
  } catch (error: any) {
    console.error('Failed to restore cloud account:', error.message)
    throw new Error(`Cloud restore failed: ${error.message}`)
  }
}

export function registerBackupHandlers() {
  ipcMain.handle(IPC.BACKUP.EXPORT, async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `reyna-pos-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (!filePath) return { success: false, cancelled: true }

    try {
      const dbPath = getCurrentDbPath()
      fs.copyFileSync(dbPath, filePath)
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.BACKUP.IMPORT, async (_, filePath?: string) => {
    let importPath = filePath
    if (!importPath) {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Import Database Backup',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
      })
      if (!filePaths[0]) return { success: false, cancelled: true }
      importPath = filePaths[0]
    }

    try {
      const dbPath = getCurrentDbPath()
      closeDb()
      fs.copyFileSync(importPath, dbPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.BACKUP.RESET, async () => {
    try {
      const dbPath = getCurrentDbPath()
      const preservedSettings = loadPreservedSettings()
      const preservedAdmin = getLocalAdminSnapshot()
      closeDb()
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
      }

      getDb()
      if (Object.keys(preservedSettings).length > 0) {
        restoreSettings(preservedSettings)
      }

      const accessToken = preservedSettings.cloud_access_token
      if (accessToken) {
        try {
          await restoreCloudAccount(accessToken, { fallbackAdminPin: preservedAdmin.pin })
        } catch (err) {
          console.warn('[backup:reset] Cloud restore after reset failed:', err)
        }
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
