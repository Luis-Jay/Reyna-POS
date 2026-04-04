import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerAuthHandlers() {
  ipcMain.handle(IPC.AUTH.LOGIN, (_, name: string, pin: string) => {
    const db = getDb()
    // Simple PIN check (in production use bcrypt)
    const user: any = db.prepare(`
      SELECT id, name, role, is_active FROM users
      WHERE (LOWER(name) = LOWER(?) OR role = ?) AND pin = ? AND is_active = 1 AND deleted_at IS NULL
    `).get(name, name, pin)
    if (!user) return { success: false, error: 'Invalid name or PIN' }
    return { success: true, user }
  })

  ipcMain.handle(IPC.AUTH.LOGOUT, () => {
    return { success: true }
  })

  ipcMain.handle(IPC.AUTH.GET_USERS, () => {
    return getDb().prepare(`SELECT id, name, role, is_active, created_at FROM users WHERE deleted_at IS NULL`).all()
  })

  ipcMain.handle(IPC.AUTH.CREATE_USER, (_, data: any) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO users (id, name, pin, role) VALUES (?, ?, ?, ?)`)
      .run(id, data.name, data.pin, data.role || 'cashier')
    return { success: true, id }
  })

  ipcMain.handle(IPC.AUTH.UPDATE_USER, (_, id: string, data: any) => {
    const db = getDb()
    if (data.pin) {
      db.prepare(`UPDATE users SET name = COALESCE(?, name), pin = ?, role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?`)
        .run(data.name, data.pin, data.role, data.is_active, id)
    } else {
      db.prepare(`UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?`)
        .run(data.name, data.role, data.is_active, id)
    }
    return { success: true }
  })
}
