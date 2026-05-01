import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'

export function registerSettingsHandlers() {
  ipcMain.handle(IPC.SETTINGS.GET_ALL, () => {
    const rows: any[] = getDb().prepare(`SELECT key, value FROM settings`).all()
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })

  ipcMain.handle(IPC.SETTINGS.GET, (_, key: string) => {
    const row: any = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key)
    return row?.value ?? null
  })

  ipcMain.handle(IPC.SETTINGS.SET, (_, key: string, value: string) => {
    getDb().prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(key, value)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.SETTINGS.SET_MANY, (_, kv: Record<string, string>) => {
    const db = getDb()
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(kv)) {
        db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
          .run(key, value)
      }
    })
    tx()
    scheduleAutoSync()
    return { success: true }
  })
}
