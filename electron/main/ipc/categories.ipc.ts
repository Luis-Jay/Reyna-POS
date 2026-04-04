import { ipcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerCategoryHandlers() {
  ipcMain.handle(IPC.CATEGORIES.GET_ALL, () => {
    return getDb().prepare(`SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name`).all()
  })

  ipcMain.handle(IPC.CATEGORIES.CREATE, (_, name: string) => {
    const db = getDb()
    const id = uuid()
    const maxOrder: any = db.prepare(`SELECT MAX(sort_order) as m FROM categories`).get()
    db.prepare(`INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`)
      .run(id, name, (maxOrder?.m || 0) + 1)
    return { success: true, id }
  })

  ipcMain.handle(IPC.CATEGORIES.UPDATE, (_, id: string, name: string) => {
    getDb().prepare(`UPDATE categories SET name = ? WHERE id = ?`).run(name, id)
    return { success: true }
  })

  ipcMain.handle(IPC.CATEGORIES.DELETE, (_, id: string) => {
    getDb().prepare(`UPDATE categories SET deleted_at = datetime('now') WHERE id = ?`).run(id)
    return { success: true }
  })

  ipcMain.handle(IPC.CATEGORIES.REORDER, (_, ids: string[]) => {
    const db = getDb()
    const tx = db.transaction(() => {
      ids.forEach((id, index) => {
        db.prepare(`UPDATE categories SET sort_order = ? WHERE id = ?`).run(index, id)
      })
    })
    tx()
    return { success: true }
  })
}
