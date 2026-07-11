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

function loadPreservedUsers() {
  try {
    const db = getDb()
    return db.prepare(`SELECT id, name, pin, role, is_active, created_at, deleted_at FROM users`).all() as Array<{
      id: string; name: string; pin: string; role: string; is_active: number; created_at: string; deleted_at: string | null
    }>
  } catch {
    return []
  }
}

function restoreUsers(users: ReturnType<typeof loadPreservedUsers>) {
  if (users.length === 0) return
  const db = getDb()
  const tx = db.transaction(() => {
    for (const u of users) {
      db.prepare(`
        INSERT INTO users (id, name, pin, role, is_active, created_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, pin = excluded.pin, role = excluded.role,
          is_active = excluded.is_active, created_at = excluded.created_at, deleted_at = excluded.deleted_at
      `).run(u.id, u.name, u.pin, u.role, u.is_active, u.created_at, u.deleted_at)
    }
  })
  tx()
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

function applyCloudCashiers(cashiers: any[]) {
  const db = getDb()
  for (const cashier of cashiers) {
    const existing: any = db.prepare(`SELECT id FROM users WHERE id = ?`).get(cashier.id)
    const permissionsJson = JSON.stringify(cashier.permissions ?? {})
    if (existing) {
      db.prepare(`UPDATE users SET name = ?, pin = ?, role = ?, is_active = ?, permissions = ? WHERE id = ?`)
        .run(cashier.name, cashier.pin, cashier.role, cashier.is_active ? 1 : 0, permissionsJson, cashier.id)
    } else {
      db.prepare(`INSERT OR IGNORE INTO users (id, name, pin, role, is_active, permissions) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(cashier.id, cashier.name, cashier.pin, cashier.role, cashier.is_active ? 1 : 0, permissionsJson)
    }
  }
}

async function restoreCloudAccount(accessToken: string) {
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
      applyCloudCashiers(data.cashiers)
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
      // Snapshot cashier/admin accounts (with PINs) so a reset never locks
      // anyone out — this is restored below regardless of cloud connectivity.
      const preservedUsers = loadPreservedUsers()
      closeDb()
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
      }

      getDb()
      if (Object.keys(preservedSettings).length > 0) {
        restoreSettings(preservedSettings)
      }
      restoreUsers(preservedUsers)

      const accessToken = preservedSettings.cloud_access_token
      if (accessToken) {
        try {
          await restoreCloudAccount(accessToken)
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
