import { ipcMain, BrowserWindow } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

let printerStatus = { connected: false, type: '', device: '', error: '' }

// Load JsBarcode once at startup for inlining into receipt HTML
let _jsBarcodeScript = ''
try {
  const scriptPath = require.resolve('jsbarcode/dist/JsBarcode.all.min.js')
  _jsBarcodeScript = require('fs').readFileSync(scriptPath, 'utf-8')
} catch {
  console.warn('[printer] JsBarcode not found — barcode will be skipped on receipts')
}

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
    db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .run('printer_interface', config.interface || '')
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.PRINT_RECEIPT, async (_, order: any) => {
    const { thermalEnabled, storeName, storeAddress, storePhone, storeTin, receiptFooter, printerInterface } = getPrinterSettings()
    const preferSystemPrinter = printerInterface.startsWith('system:')

    if (thermalEnabled && !preferSystemPrinter) {
      try {
        await printThermal(order, { storeName, storeAddress, storePhone, storeTin, receiptFooter })
        printerStatus.connected = true
        printerStatus.type = 'escpos-usb'
        printerStatus.device = 'USB'
        printerStatus.error = ''
        return { success: true }
      } catch (err: any) {
        const fallbackResult = await printHtmlReceipt(order, {
          storeName, storeAddress, storePhone, storeTin, receiptFooter,
        }, printerInterface)

        if (fallbackResult.success) {
          printerStatus.connected = true
          printerStatus.type = 'system'
          printerStatus.device = fallbackResult.device
          printerStatus.error = ''
          return {
            success: true,
            warning: `Thermal printer unavailable. Used ${fallbackResult.device} instead.`,
          }
        }

        printerStatus.connected = false
        printerStatus.type = 'escpos-usb'
        printerStatus.error = err.message
        return { success: false, error: err.message }
      }
    }

    const result = await printHtmlReceipt(order, {
      storeName, storeAddress, storePhone, storeTin, receiptFooter,
    }, printerInterface)

    const systemDevice = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : 'system-dialog'
    if (!result.success) {
      printerStatus.connected = false
      printerStatus.error = result.error || 'Print failed'
      printerStatus.type = 'system'
      printerStatus.device = systemDevice
      return { success: false, error: result.error }
    }

    printerStatus.connected = true
    printerStatus.type = 'system'
    printerStatus.device = result.device || systemDevice
    printerStatus.error = ''
    return { success: true }
  })

  ipcMain.handle(IPC.PRINTER.TEST_PAGE, async () => {
    try {
      const { thermalEnabled, printerInterface } = getPrinterSettings()
      const preferSystemPrinter = printerInterface.startsWith('system:')
      if (thermalEnabled && !preferSystemPrinter) {
        const testSettings = getPrinterSettings()
        await printThermal({ test: true }, { storeName: testSettings.storeName, storeAddress: testSettings.storeAddress, storePhone: testSettings.storePhone, storeTin: testSettings.storeTin, receiptFooter: testSettings.receiptFooter })
        printerStatus.connected = true
        printerStatus.type = 'escpos-usb'
        printerStatus.device = 'USB'
      } else {
        const testSettings = getPrinterSettings()
        const result = await printHtmlReceipt({ test: true }, {
          storeName: testSettings.storeName,
          storeAddress: testSettings.storeAddress,
          storePhone: testSettings.storePhone,
          storeTin: testSettings.storeTin,
          receiptFooter: testSettings.receiptFooter,
        }, printerInterface)
        if (!result.success) throw new Error(result.error || 'Print failed')
        printerStatus.connected = true
        printerStatus.type = 'system'
        printerStatus.device = result.device
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

function formatPeso(value: any) {
  return `P${Number(value || 0).toFixed(2)}`
}

function formatDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatQty(value: any) {
  const qty = Number(value || 0)
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getCashierName(userId?: string) {
  if (!userId) return ''
  const row: any = getDb().prepare(`SELECT name FROM users WHERE id = ?`).get(userId)
  return row?.name || ''
}


function buildReceiptHtml(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string }
) {
  const { storeName, storeAddress, storePhone, storeTin, receiptFooter } = store
  const createdAt = formatDateTime(order?.created_at)
  const cashierName = getCashierName(order?.user_id)
  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []

  // ── Items rows ──────────────────────────────────────────────────────────────
  const itemsHtml = (order?.items || []).map((item: any) => `
    <tr>
      <td class="name-col">${escapeHtml(item.name)}</td>
      <td class="qty-col">${escapeHtml(formatQty(item.quantity))}</td>
      <td class="price-col">${escapeHtml(formatPeso(item.subtotal))}</td>
    </tr>
  `).join('')

  // ── Payment / change rows ───────────────────────────────────────────────────
  let paymentRows = ''
  if (!order?.test) {
    if (order?.is_credit) {
      paymentRows = `<div class="summary-row"><span>Payment</span><span>Charge to Account</span></div>`
    } else if (payments.length > 0) {
      paymentRows = payments.map((entry: any) => {
        const label = entry.method === 'gcash' ? 'GCASH' : entry.method === 'card' ? 'CARD' : 'CASH'
        return `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatPeso(entry.amount))}</span></div>`
      }).join('')
      if (!order?.is_credit && order?.change_amount != null) {
        paymentRows += `<div class="summary-row"><span>CHANGE</span><span>${escapeHtml(formatPeso(order.change_amount))}</span></div>`
      }
    } else if (order?.payment_amount != null) {
      paymentRows = `<div class="summary-row"><span>CASH</span><span>${escapeHtml(formatPeso(order.payment_amount))}</span></div>`
      if (!order?.is_credit && order?.change_amount != null) {
        paymentRows += `<div class="summary-row"><span>CHANGE</span><span>${escapeHtml(formatPeso(order.change_amount))}</span></div>`
      }
    }
  }

  const discountRow = !order?.test && Number(order?.discount || 0) > 0
    ? `<div class="summary-row"><span>Discount</span><span>- ${escapeHtml(formatPeso(order.discount))}</span></div>`
    : ''

  const noteRow = order?.note
    ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>`
    : ''

  // ── Barcode script ──────────────────────────────────────────────────────────
  const orderNumber = escapeHtml(order?.order_number || '')
  const barcodeHtml = (_jsBarcodeScript && orderNumber && !order?.test) ? `
    <div class="barcode-wrap">
      <svg id="rcpt-barcode"></svg>
    </div>
    <script>${_jsBarcodeScript}</script>
    <script>
      try {
        JsBarcode("#rcpt-barcode", ${JSON.stringify(order?.order_number || '')}, {
          format: "CODE128", width: 1.5, height: 48,
          displayValue: true, fontSize: 11, margin: 4,
          lineColor: "#000", background: "#fff"
        });
      } catch(e) {}
    </script>
  ` : (orderNumber && !order?.test ? `<div class="center barcode-text">${orderNumber}</div>` : '')

  // ── Main body ───────────────────────────────────────────────────────────────
  const bodyHtml = order?.test ? `
    <div class="divider"></div>
    <p class="center section-gap">Test page printed successfully.</p>
    <p class="center" style="font-size:11px">${escapeHtml(createdAt)}</p>
  ` : `
    <div class="divider"></div>
    <div class="info-row"><span>Cashier:</span><span>${escapeHtml(cashierName)}</span></div>
    <div class="info-row"><span>Receipt #:</span><span>${orderNumber}</span></div>
    <div class="info-row"><span>Date:</span><span>${escapeHtml(createdAt)}</span></div>
    ${order?.customer_name ? `<div class="info-row"><span>Customer:</span><span>${escapeHtml(order.customer_name)}</span></div>` : ''}
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th class="name-col">Name</th>
          <th class="qty-col">Qty</th>
          <th class="price-col">Price</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="divider"></div>
    ${discountRow}
    <div class="summary-row subtotal"><span>Sub Total</span><span>${escapeHtml(formatPeso(order?.total))}</span></div>
    ${paymentRows}
    ${noteRow}
    <div class="short-divider"></div>
    ${barcodeHtml}
  `

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      :root { color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #fff;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        line-height: 1.4;
      }
      .receipt {
        width: 76mm;
        max-width: 100%;
        margin: 0 auto;
        padding: 10px 8px 20px;
      }
      .center { text-align: center; }
      .store-name {
        font-size: 20px;
        font-weight: 900;
        text-decoration: underline;
        letter-spacing: 0.02em;
        margin-bottom: 2px;
      }
      .store-info { font-size: 11px; line-height: 1.6; }
      .divider {
        border: none;
        border-top: 1px dotted #777;
        margin: 7px 0;
      }
      .short-divider {
        border: none;
        border-top: 1px dotted #777;
        width: 55%;
        margin: 8px auto;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin: 1px 0;
      }
      table { width: 100%; border-collapse: collapse; margin: 3px 0; }
      th, td { padding: 2px 0; vertical-align: top; font-size: 12px; }
      th { font-weight: 700; }
      .name-col { text-align: left; }
      .qty-col  { text-align: center; width: 32px; }
      .price-col { text-align: right; width: 70px; white-space: nowrap; }
      .summary-row {
        display: flex;
        justify-content: space-between;
        margin: 2px 0;
        font-size: 12px;
      }
      .summary-row.subtotal {
        font-size: 15px;
        font-weight: 700;
        margin: 4px 0 3px;
      }
      .barcode-wrap { text-align: center; margin: 4px 0 2px; }
      .barcode-wrap svg { max-width: 100%; }
      .barcode-text { font-family: monospace; font-size: 13px; letter-spacing: 0.1em; margin: 6px 0; }
      .thank-you { font-size: 15px; font-weight: 700; letter-spacing: 0.05em; margin-top: 4px; }
      .footer-msg { font-size: 11px; margin-top: 2px; }
      .section-gap { margin: 16px 0; }
      .note { font-size: 11px; margin-top: 4px; }
      @page { margin: 4mm; size: auto; }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center">
        <div class="store-name">${escapeHtml(storeName)}</div>
        ${storeAddress ? `<div class="store-info">${escapeHtml(storeAddress)}</div>` : ''}
        ${storePhone ? `<div class="store-info">Tel.: ${escapeHtml(storePhone)}</div>` : ''}
        ${storeTin ? `<div class="store-info">TIN: ${escapeHtml(storeTin)}</div>` : ''}
      </div>
      ${bodyHtml}
      <div class="center">
        <div class="thank-you">THANK YOU!</div>
        <div class="footer-msg">${escapeHtml(receiptFooter)}</div>
      </div>
    </div>
  </body>
</html>`
}

async function printHtmlReceipt(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string },
  printerInterface: string
) {
  const html = buildReceiptHtml(order, store)
  return printHtmlContent(html, printerInterface)
}

async function printHtmlContent(html: string, printerInterface: string) {
  // Write to a temp file so the renderer can load scripts (data: URLs have size limits)
  const tmpFile = path.join(os.tmpdir(), `reyna_receipt_${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, nodeIntegration: false },
  })

  const deviceName = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined
  const deviceLabel = deviceName || 'system-dialog'

  try {
    await printWindow.loadURL(`file://${tmpFile}`)
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({
        silent: !!deviceName,   // silent only when a specific printer is selected
        printBackground: true,
        deviceName,
      }, (success, error) => {
        if (success) resolve()
        else reject(new Error(error || 'Print failed'))
      })
    })
    return { success: true, device: deviceLabel }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Print failed', device: deviceLabel }
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close()
    try { fs.unlinkSync(tmpFile) } catch {}
  }
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
    const divider = '.'.repeat(colWidth)

    printer = new Printer(device)

    // ── Header ────────────────────────────────────────────────────────────────
    printer.align('CT').style(true, false, false).size(1, 1).text(storeName)
    printer.style(false, false, false).size(0, 0)
    if (storeAddress) printer.text(storeAddress)
    if (storePhone) printer.text(`Tel.: ${storePhone}`)
    if (storeTin) printer.text(`TIN: ${storeTin}`)
    printer.text(divider)

    if (order.test) {
      printer.text('Test Page - Printer OK')
      printer.text(formatDateTime(order?.created_at))
    } else {
      const cashierName = getCashierName(order?.user_id)
      printer.align('LT')
      printer.text(rowLine('Cashier:', cashierName, colWidth))
      printer.text(rowLine('Receipt #:', order.order_number || 'N/A', colWidth))
      printer.text(rowLine('Date:', formatDateTime(order?.created_at), colWidth))
      if (order.customer_name) printer.text(rowLine('Customer:', order.customer_name, colWidth))
      printer.text(divider)

      // ── Items header ───────────────────────────────────────────────────────
      const qtyW = 5, priceW = 10
      const nameW = colWidth - qtyW - priceW - 2
      const hdrName = 'Name'.padEnd(nameW)
      const hdrQty = 'Qty'.padStart(qtyW)
      const hdrPrice = 'Price'.padStart(priceW)
      printer.style(true, false, false).text(`${hdrName}${hdrQty}  ${hdrPrice}`)
      printer.style(false, false, false)
      printer.text(divider)

      // ── Items ──────────────────────────────────────────────────────────────
      for (const item of order.items || []) {
        const name = item.name.length > nameW ? item.name.slice(0, nameW - 1) + '…' : item.name.padEnd(nameW)
        const qty = formatQty(item.quantity).padStart(qtyW)
        const price = formatPeso(item.subtotal).padStart(priceW)
        printer.text(`${name}${qty}  ${price}`)
      }
      printer.text(divider)

      // ── Totals ─────────────────────────────────────────────────────────────
      if (Number(order.discount || 0) > 0) {
        printer.text(rowLine('Discount', `- ${formatPeso(order.discount)}`, colWidth))
      }
      printer.style(true, false, false)
      printer.text(rowLine('Sub Total', formatPeso(order.total), colWidth))
      printer.style(false, false, false)

      // ── Payments ──────────────────────────────────────────────────────────
      const payments = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
      if (order.is_credit) {
        printer.text(rowLine('Payment', 'Charge to Account', colWidth))
      } else if (payments.length > 0) {
        for (const entry of payments) {
          const label = entry.method === 'gcash' ? 'GCASH' : entry.method === 'card' ? 'CARD' : 'CASH'
          printer.text(rowLine(label, formatPeso(entry.amount || 0), colWidth))
        }
        if (order.change_amount != null) {
          printer.text(rowLine('CHANGE', formatPeso(order.change_amount || 0), colWidth))
        }
      } else if (order.payment_amount != null) {
        printer.text(rowLine('CASH', formatPeso(order.payment_amount), colWidth))
        if (order.change_amount != null) {
          printer.text(rowLine('CHANGE', formatPeso(order.change_amount || 0), colWidth))
        }
      }

      if (order.note) printer.text(`Note: ${order.note}`)

      // ── Barcode ───────────────────────────────────────────────────────────
      try {
        printer.align('CT').barcode(order.order_number, 'CODE128', { width: 2, height: 64, position: 'BLW' })
      } catch {
        printer.align('CT').text(order.order_number)
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    printer.align('CT').style(true, false, false).text('THANK YOU!')
    printer.style(false, false, false).text(receiptFooter).cut()
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
