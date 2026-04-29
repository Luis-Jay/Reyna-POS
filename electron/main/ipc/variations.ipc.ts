import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'
import { scheduleAutoSync } from './sync.ipc'

export function registerVariationHandlers() {
  ipcMain.handle(IPC.VARIATIONS.GET_GROUPS, () => {
    const db = getDb()
    const groups: any[] = db.prepare(`SELECT * FROM variation_groups WHERE deleted_at IS NULL ORDER BY name`).all()
    for (const g of groups) {
      g.options = db.prepare(`SELECT * FROM variation_options WHERE group_id = ? AND deleted_at IS NULL ORDER BY sort_order`).all(g.id)
    }
    return groups
  })

  ipcMain.handle(IPC.VARIATIONS.CREATE_GROUP, (_, name: string) => {
    const db = getDb()
    const id = uuid()
    db.prepare(`INSERT INTO variation_groups (id, name) VALUES (?, ?)`).run(id, name)
    scheduleAutoSync()
    return { success: true, id }
  })

  ipcMain.handle(IPC.VARIATIONS.UPDATE_GROUP, (_, id: string, name: string) => {
    getDb().prepare(`UPDATE variation_groups SET name = ? WHERE id = ?`).run(name, id)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.VARIATIONS.DELETE_GROUP, (_, id: string) => {
    const db = getDb()
    db.prepare(`UPDATE variation_groups SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    db.prepare(`UPDATE variation_options SET deleted_at = datetime('now') WHERE group_id = ?`).run(id)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.VARIATIONS.ADD_OPTION, (_, groupId: string, data: any) => {
    const db = getDb()
    const id = uuid()
    const max: any = db.prepare(`SELECT MAX(sort_order) as m FROM variation_options WHERE group_id = ?`).get(groupId)
    db.prepare(`INSERT INTO variation_options (id, group_id, name, price, cost, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, groupId, data.name, data.price || 0, data.cost || 0, (max?.m || 0) + 1)
    scheduleAutoSync()
    return { success: true, id }
  })

  ipcMain.handle(IPC.VARIATIONS.UPDATE_OPTION, (_, id: string, data: any) => {
    getDb().prepare(`UPDATE variation_options SET name = ?, price = ?, cost = ? WHERE id = ?`)
      .run(data.name, data.price || 0, data.cost || 0, id)
    scheduleAutoSync()
    return { success: true }
  })

  ipcMain.handle(IPC.VARIATIONS.DELETE_OPTION, (_, id: string) => {
    getDb().prepare(`UPDATE variation_options SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    scheduleAutoSync()
    return { success: true }
  })
}
