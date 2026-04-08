import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

let printerStatus = { connected: false, type: '', device: '', error: '' }

function getPrinterSettings() {
  const db = getDb()
  const thermalEnabled = db.prepare(`SELECT value FROM settings WHERE key = 'thermal_enabled'`).get() as any
  const storeName = db.prepare(`SELECT value FROM settings WHERE key = 'store_name'`).get() as any
  const paperSizeRow = db.prepare(`SELECT value FROM settings WHERE key = 'paper_size'`).get() as any
  const printerInterfaceRow = db.prepare(`SELECT value FROM settings WHERE key = 'printer_interface'`).get() as any

  return {
    thermalEnabled: thermalEnabled?.value === 'true',
    storeName: storeName?.value || 'Reyna Store',
    paperSize: paperSizeRow?.value || '58mm',
    printerInterface: printerInterfaceRow?.value || '',
  }
}

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
    const { thermalEnabled, storeName, printerInterface } = getPrinterSettings()

    if (thermalEnabled) {
      try {
        await printThermal(order, storeName?.value || 'Reyna Store')
        printerStatus.connected = true
        printerStatus.type = 'escpos-usb'
        printerStatus.device = 'USB'
        printerStatus.error = ''
        return { success: true }
      } catch (err: any) {
        printerStatus.connected = false
        printerStatus.type = 'escpos-usb'
        printerStatus.error = err.message
        return { success: false, error: err.message }
      }
    }

    // Fallback: use system print dialog via HTML
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      await win.webContents.print({
        silent: false,
        printBackground: true,
        deviceName: printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined,
      })
      printerStatus.connected = true
      printerStatus.type = 'system'
      printerStatus.device = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : 'system-dialog'
      printerStatus.error = ''
    }
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.TEST_PAGE, async () => {
    try {
      const { thermalEnabled, printerInterface } = getPrinterSettings()
      if (thermalEnabled) {
        await printThermal({ test: true }, 'Reyna POS Test')
        printerStatus.connected = true
        printerStatus.type = 'escpos-usb'
        printerStatus.device = 'USB'
      } else {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) throw new Error('No active window available for printer test')
        await win.webContents.print({
          silent: false,
          printBackground: true,
          deviceName: printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined,
        })
        printerStatus.connected = true
        printerStatus.type = 'system'
        printerStatus.device = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : 'system-dialog'
      }
      printerStatus.error = ''
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

// Width in characters for 58mm paper (32 cols) vs 80mm (48 cols)
function rowLine(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1
  const truncated = left.length > maxLeft ? left.slice(0, maxLeft) : left
  return truncated.padEnd(width - right.length) + right
}

async function printThermal(order: any, storeName: string) {
  try {
    const USB = require('@node-escpos/usb-adapter').default
    const { Printer } = require('@node-escpos/core')

    const device = new USB()
    await new Promise<void>((resolve, reject) => {
      device.open((err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })

    const { paperSize } = getPrinterSettings()
    const colWidth = paperSize === '80mm' ? 48 : 32
    const divider = '-'.repeat(colWidth)

    const printer = new Printer(device)

    printer.align('CT').style(true, false, false).text(storeName)
    printer.style(false, false, false)
    printer.text(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
    printer.text(divider)

    if (order.test) {
      printer.text('Test Page - Printer OK')
    } else {
      printer.align('LT')
      for (const item of order.items || []) {
        printer.text(rowLine(`${item.quantity}x ${item.name}`, `P${Number(item.subtotal).toFixed(2)}`, colWidth))
      }
      printer.text(divider)

      const totalRight = `P${Number(order.total).toFixed(2)}`
      printer.style(true, false, false).text(rowLine('TOTAL', totalRight, colWidth))
      printer.style(false, false, false)

      const payments = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
      if (payments.length > 0) {
        for (const entry of payments) {
          const label = entry.method === 'gcash' ? 'GCash' : entry.method === 'card' ? 'Card' : 'Cash'
          printer.text(rowLine(label, `P${Number(entry.amount || 0).toFixed(2)}`, colWidth))
        }
      } else if (order.payment_amount) {
        printer.text(rowLine('Cash', `P${Number(order.payment_amount).toFixed(2)}`, colWidth))
      }
      if (order.payment_amount != null) {
        printer.text(rowLine('Change', `P${Number(order.change_amount || 0).toFixed(2)}`, colWidth))
      }
    }

    printer.align('CT').text('Thank you!').cut()
    await printer.flush()
    await printer.close()
  } catch (err: any) {
    throw new Error(err?.message || 'Thermal printer not available')
  }
}
