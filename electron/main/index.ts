import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { getDb, closeDb } from './db'
import { registerProductHandlers } from './ipc/products.ipc'
import { registerCategoryHandlers } from './ipc/categories.ipc'
import { registerVariationHandlers } from './ipc/variations.ipc'
import { registerOrderHandlers } from './ipc/orders.ipc'
import { registerInventoryHandlers } from './ipc/inventory.ipc'
import { registerDebtorHandlers } from './ipc/debtors.ipc'
import { registerAnalyticsHandlers } from './ipc/analytics.ipc'
import { registerSettingsHandlers } from './ipc/settings.ipc'
import { registerAuthHandlers } from './ipc/auth.ipc'
import { registerPrinterHandlers } from './ipc/printer.ipc'
import { registerSyncHandlers } from './ipc/sync.ipc'
import { registerBackupHandlers } from './ipc/backup.ipc'
import { BarcodeService } from './services/barcode.service'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // __dirname = electron/dist/electron/main  → preload is at electron/dist/electron/preload/index.js
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
    icon: path.join(__dirname, '..', '..', '..', '..', 'assets', 'icons', 'icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // electron/dist/electron/main → ../../../.. → project root → dist/renderer
    mainWindow.loadFile(path.join(__dirname, '..', '..', '..', '..', 'dist', 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Init barcode scanner listener
  const barcodeService = new BarcodeService(mainWindow)
  barcodeService.init()
}

app.whenReady().then(() => {
  // Init DB on startup
  getDb()

  // Register all IPC handlers
  registerProductHandlers()
  registerCategoryHandlers()
  registerVariationHandlers()
  registerOrderHandlers()
  registerInventoryHandlers()
  registerDebtorHandlers()
  registerAnalyticsHandlers()
  registerSettingsHandlers()
  registerAuthHandlers()
  registerPrinterHandlers()
  registerSyncHandlers()
  registerBackupHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})
