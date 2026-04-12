import { app, BrowserWindow, dialog, protocol, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDb, closeDb, getCurrentProductImagesDir } from './db'
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
import { registerSyncHandlers, startAutoSync } from './ipc/sync.ipc'
import { registerBackupHandlers } from './ipc/backup.ipc'
import { registerActivationHandlers } from './ipc/activation.ipc'
import { registerExpenseHandlers } from './ipc/expenses.ipc'
import { registerShiftHandlers } from './ipc/shifts.ipc'
import { registerPriceTierHandlers } from './ipc/pricetiers.ipc'
import { registerLoyaltyHandlers } from './ipc/loyalty.ipc'
import { BarcodeService } from './services/barcode.service'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const appIconPath = path.join(__dirname, '..', '..', '..', '..', 'assets', 'icons', 'icon.png')

let mainWindow: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'product-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function registerLocalImageProtocol() {
  protocol.handle('product-image', (request) => {
    const imagePath = decodeURIComponent(new URL(request.url).searchParams.get('path') || '')
    if (!imagePath) {
      return new Response('Missing image path', { status: 400 })
    }

    try {
      const allowedDir = getCurrentProductImagesDir()
      const allowedDirReal = fs.realpathSync(allowedDir)
      // image_path in DB is stored as an absolute path; resolve relative paths against allowedDir
      const candidate = path.isAbsolute(imagePath) ? imagePath : path.resolve(allowedDir, imagePath)
      const candidateReal = fs.realpathSync(candidate)
      if (!candidateReal.startsWith(allowedDirReal + path.sep) && candidateReal !== allowedDirReal) {
        return new Response('Forbidden', { status: 403 })
      }

      const ext = path.extname(candidateReal).toLowerCase()
      const contentType =
        ext === '.png' ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.webp' ? 'image/webp' :
        ext === '.gif' ? 'image/gif' :
        'application/octet-stream'

      if (fs.constants.O_NOFOLLOW === undefined && fs.lstatSync(candidateReal).isSymbolicLink()) {
        return new Response('Forbidden', { status: 403 })
      }

      // Use file descriptor with O_NOFOLLOW to prevent symlink swap (with Windows fallback)
      const openFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
      const fd = fs.openSync(candidateReal, openFlags)

      try {
        const file = fs.readFileSync(fd)
        return new Response(file, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          },
        })
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      return new Response('Image not found', { status: 404 })
    }
  })
}

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
      devTools: isDev,
    },
    show: false,
    icon: appIconPath,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
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
  if (process.platform === 'darwin') {
    app.dock.setIcon(appIconPath)
  }

  // Init DB on startup
  getDb()
  registerLocalImageProtocol()

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
  registerActivationHandlers()
  registerExpenseHandlers()
  registerShiftHandlers()
  registerPriceTierHandlers()
  registerLoyaltyHandlers()
  startAutoSync()

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
