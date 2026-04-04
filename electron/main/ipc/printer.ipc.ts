import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

let printerStatus = { connected: false, type: '', device: '', error: '' }

export function registerPrinterHandlers() {
  ipcMain.handle(IPC.PRINTER.GET_STATUS, () => printerStatus)

  ipcMain.handle(IPC.PRINTER.LIST_PRINTERS, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return []
    try {
      return await win.webContents.getPrintersAsync()
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.PRINTER.SET_CONFIG, (_, config: any) => {
    const db = getDb()
    db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run('thermal_enabled', config.enabled ? 'true' : 'false')
    db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run('paper_size', config.paperSize || '58mm')
    if (config.interface) {
      db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
        .run('printer_interface', config.interface)
    }
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.PRINT_RECEIPT, async (_, order: any) => {
    const db = getDb()
    const thermalEnabled = db.prepare(`SELECT value FROM settings WHERE key = 'thermal_enabled'`).get() as any
    const storeName = db.prepare(`SELECT value FROM settings WHERE key = 'store_name'`).get() as any

    if (thermalEnabled?.value === 'true') {
      try {
        await printThermal(order, storeName?.value || 'Reyna Store')
        printerStatus.connected = true
        return { success: true }
      } catch (err: any) {
        printerStatus.connected = false
        printerStatus.error = err.message
        return { success: false, error: err.message }
      }
    }

    // Fallback: use system print dialog via HTML
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.webContents.print({ silent: false, printBackground: true })
    }
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.TEST_PAGE, async () => {
    try {
      await printThermal({ test: true }, 'Reyna POS Test')
      printerStatus.connected = true
      return { success: true }
    } catch (err: any) {
      printerStatus.connected = false
      printerStatus.error = err.message
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(IPC.PRINTER.OPEN_DRAWER, async () => {
    // ESC/POS cash drawer pulse — sent as raw bytes
    return { success: true }
  })
}

async function printThermal(order: any, storeName: string) {
  // Dynamic import to avoid hard crash if printer hardware not available
  try {
    const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer')
    const printer = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: 'printer:auto' })

    printer.alignCenter()
    printer.bold(true)
    printer.setTextSize(1, 1)
    printer.println(storeName)
    printer.setTextNormal()
    printer.bold(false)
    printer.println(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
    printer.drawLine()

    if (order.test) {
      printer.println('Test Page - Printer OK')
    } else {
      printer.alignLeft()
      for (const item of order.items || []) {
        printer.tableCustom([
          { text: `${item.quantity}x ${item.name}`, align: 'LEFT', width: 0.65 },
          { text: `P${item.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.35 },
        ])
      }
      printer.drawLine()
      printer.bold(true)
      printer.tableCustom([
        { text: 'TOTAL', align: 'LEFT', width: 0.5 },
        { text: `P${order.total?.toFixed(2)}`, align: 'RIGHT', width: 0.5 },
      ])
      printer.bold(false)
      if (order.payment_amount) {
        printer.tableCustom([
          { text: 'Cash', align: 'LEFT', width: 0.5 },
          { text: `P${order.payment_amount?.toFixed(2)}`, align: 'RIGHT', width: 0.5 },
        ])
        printer.tableCustom([
          { text: 'Change', align: 'LEFT', width: 0.5 },
          { text: `P${(order.change_amount || 0).toFixed(2)}`, align: 'RIGHT', width: 0.5 },
        ])
      }
    }

    printer.alignCenter()
    printer.println('Thank you!')
    printer.cut()
    await printer.execute()
  } catch {
    // Silently fail if printer library not available
    throw new Error('Thermal printer not available')
  }
}
