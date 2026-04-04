import { ipcMain } from 'electron'
import { IPC } from '../../../shared/ipc-channels'

export function registerSyncHandlers() {
  ipcMain.handle(IPC.SYNC.GET_STATUS, () => {
    return { status: 'offline', pending: 0 }
  })

  ipcMain.handle(IPC.SYNC.FORCE, () => {
    return { success: true, message: 'Sync not configured' }
  })
}
