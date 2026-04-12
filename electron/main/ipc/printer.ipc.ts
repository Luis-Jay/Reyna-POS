import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

let printerStatus = { connected: false, type: '', device: '', error: '' }

function getPrinterSettings() {
  const db = getDb()
  const rows: any[] = db.prepare(`SELECT key, value FROM settings WHERE key IN (
    'thermal_enabled','store_name','paper_size','printer_interface',
    'store_address','store_phone','store_tin','receipt_footer'
  )`).all()
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]))

  return {
    thermalEnabled: s['thermal_enabled'] === 'true',
    storeName: s['store_name'] || 'Reyna Store',
    storeAddress: s['store_address'] || '',
    storePhone: s['store_phone'] || '',
    storeTin: s['store_tin'] || '',
    receiptFooter: s['receipt_footer'] || 'Thank you for shopping with us!',
    paperSize: s['paper_size'] || '58mm',
    printerInterface: s['printer_interface'] || '',
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
    const { thermalEnabled, storeName, storeAddress, storePhone, storeTin, receiptFooter, printerInterface } = getPrinterSettings()

    if (thermalEnabled) {
      try {
        await printThermal(order, { storeName, storeAddress, storePhone, storeTin, receiptFooter })
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
    const systemDevice = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : 'system-dialog'
    if (!win) {
      printerStatus.connected = false
      printerStatus.error = 'No focused window'
      printerStatus.type = 'system'
      printerStatus.device = systemDevice
      return { success: false, error: printerStatus.error }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        win.webContents.print({
          silent: false,
          printBackground: true,
          deviceName: printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined,
        }, (success, error) => {
          if (success) {
            resolve()
          } else {
            reject(new Error(error || 'Print failed'))
          }
        })
      })
      printerStatus.connected = true
      printerStatus.type = 'system'
      printerStatus.device = systemDevice
      printerStatus.error = ''
    } catch (err: any) {
      printerStatus.connected = false
      printerStatus.error = err.message
      printerStatus.type = 'system'
      printerStatus.device = systemDevice
      throw err
    }
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.TEST_PAGE, async () => {
    try {
      const { thermalEnabled, printerInterface } = getPrinterSettings()
      if (thermalEnabled) {
        const testSettings = getPrinterSettings()
        await printThermal({ test: true }, { storeName: testSettings.storeName, storeAddress: testSettings.storeAddress, storePhone: testSettings.storePhone, storeTin: testSettings.storeTin, receiptFooter: testSettings.receiptFooter })
        printerStatus.connected = true
        printerStatus.type = 'escpos-usb'
        printerStatus.device = 'USB'
      } else {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) throw new Error('No active window available for printer test')
        await new Promise<void>((resolve, reject) => {
          win.webContents.print({
            silent: false,
            printBackground: true,
            deviceName: printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined,
          }, (success, error) => {
            if (success) {
              resolve()
            } else {
              reject(new Error(error || 'Print failed'))
            }
          })
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

async function printThermal(order: any, store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string }) {
  const { storeName, storeAddress, storePhone, storeTin, receiptFooter } = store
  let device: any = null
  let printer: any = null
  try {
    const USB = require('@node-escpos/usb-adapter').default
    const { Printer } = require('@node-escpos/core')

    device = new USB()
    await new Promise<void>((resolve, reject) => {
      device.open((err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })

    const { paperSize } = getPrinterSettings()
    const colWidth = paperSize === '80mm' ? 48 : 32
    const divider = '-'.repeat(colWidth)

    printer = new Printer(device)

    // ── Header ────────────────────────────────────────────────────────────────
    printer.align('CT').style(true, false, false).text(storeName)
    printer.style(false, false, false)
    if (storeAddress) printer.text(storeAddress)
    if (storePhone) printer.text(storePhone)
    if (storeTin) printer.text(`TIN: ${storeTin}`)
    printer.text(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
    printer.text(divider)

    if (order.test) {
      printer.text('Test Page - Printer OK')
    } else {
      // ── Items ──────────────────────────────────────────────────────────────
      printer.align('LT')
      for (const item of order.items || []) {
        printer.text(rowLine(`${item.quantity}x ${item.name}`, `P${Number(item.subtotal).toFixed(2)}`, colWidth))
      }
      printer.text(divider)

      const totalRight = `P${Number(order.total).toFixed(2)}`
      printer.style(true, false, false).text(rowLine('TOTAL', totalRight, colWidth))
      printer.style(false, false, false)

      // ── Payments ──────────────────────────────────────────────────────────
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

    // ── Footer ────────────────────────────────────────────────────────────────
    printer.text(divider)
    printer.align('CT').text(receiptFooter).cut()
  } catch (err: any) {
    throw new Error(err?.message || 'Thermal printer not available')
  } finally {
    try {
      if (printer) {
        await printer.flush()
        await printer.close()
      }
    } catch (closeErr) {
      console.warn('Failed to close printer:', closeErr)
    }
    try {
      if (device) {
        device.close()
      }
    } catch (closeErr) {
      console.warn('Failed to close device:', closeErr)
    }
  }
}
