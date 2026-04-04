import { ipcMain, dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDb, closeDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

export function registerBackupHandlers() {
  ipcMain.handle(IPC.BACKUP.EXPORT, async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `reyna-pos-backup-${new Date().toISOString().split('T')[0]}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    })
    if (!filePath) return { success: false, cancelled: true }

    try {
      const dbPath = path.join(app.getPath('userData'), 'reyna-pos.db')
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
      const dbPath = path.join(app.getPath('userData'), 'reyna-pos.db')
      closeDb()
      fs.copyFileSync(importPath, dbPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.BACKUP.RESET, async () => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'reyna-pos.db')
      closeDb()
      fs.unlinkSync(dbPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
