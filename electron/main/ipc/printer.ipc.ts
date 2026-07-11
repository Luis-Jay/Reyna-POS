import { ipcMain, BrowserWindow } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db'
import { IPC } from '../../../shared/ipc-channels'

let printerStatus = { connected: false, type: '', device: '', error: '' }

type PrinterRoute =
  | { kind: 'system'; value: string }
  | { kind: 'system-dialog'; value: '' }
  | { kind: 'escpos-usb'; value: string }

type PrinterAttemptResult = {
  success: boolean
  route: PrinterRoute
  device: string
  error?: string
  warning?: string
}

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

async function listSystemPrinters() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!win) return []
  try {
    return await win.webContents.getPrintersAsync()
  } catch {
    return []
  }
}

async function resolvePrinterInterface(printerInterface: string) {
  if (printerInterface.startsWith('system:')) return printerInterface
  if (printerInterface === 'escpos-usb') return printerInterface
  if (printerInterface) return printerInterface

  const printers = await listSystemPrinters()
  const defaultPrinter = printers.find((printer: any) => printer.isDefault)
  if (defaultPrinter?.name) return `system:${defaultPrinter.name}`
  if (printers.length === 1 && printers[0]?.name) return `system:${printers[0].name}`

  return ''
}

function normalizePrinterRoute(printerInterface: string): PrinterRoute {
  if (printerInterface.startsWith('system:')) {
    return { kind: 'system', value: printerInterface.replace('system:', '') }
  }
  if (printerInterface === 'escpos-usb' || printerInterface === 'usb') {
    return { kind: 'escpos-usb', value: 'USB ESC/POS' }
  }
  return { kind: 'system-dialog', value: '' }
}

function applyPrinterStatus(status: { connected: boolean; type: string; device: string; error?: string }) {
  printerStatus.connected = status.connected
  printerStatus.type = status.type
  printerStatus.device = status.device
  printerStatus.error = status.error || ''
}

async function printReceiptUsingConfiguredHardware(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string },
  printerInterface: string,
  thermalEnabled: boolean
): Promise<PrinterAttemptResult> {
  const normalizedRoute = normalizePrinterRoute(printerInterface)
  const systemResult = async (targetInterface: string) => {
    const result = await printHtmlReceipt(order, store, targetInterface)
    const route = normalizePrinterRoute(targetInterface)
    const device = result.device || (route.kind === 'system' ? route.value : 'system-dialog')
    return { ...result, route, device }
  }

  if (normalizedRoute.kind === 'escpos-usb') {
    try {
      await printThermal(order, store)
      return { success: true, route: normalizedRoute, device: normalizedRoute.value }
    } catch (thermalError: any) {
      const fallbackInterface = await resolvePrinterInterface('')
      const fallbackResult = await systemResult(fallbackInterface)
      if (fallbackResult.success) {
        return {
          success: true,
          route: fallbackResult.route,
          device: fallbackResult.device,
          warning: `Direct USB thermal printer unavailable. Used ${fallbackResult.device} instead.`,
        }
      }
      return {
        success: false,
        route: normalizedRoute,
        device: normalizedRoute.value,
        error: thermalError?.message || fallbackResult.error || 'Print failed',
      }
    }
  }

  const systemAttempt = await systemResult(printerInterface)
  if (systemAttempt.success) return systemAttempt

  if (normalizedRoute.kind === 'system') {
    const fallbackInterface = await resolvePrinterInterface('')
    const canTryFallbackSystem = fallbackInterface !== printerInterface || !fallbackInterface
    if (canTryFallbackSystem) {
      const fallbackSystemAttempt = await systemResult(fallbackInterface)
      if (fallbackSystemAttempt.success) {
        return {
          success: true,
          route: fallbackSystemAttempt.route,
          device: fallbackSystemAttempt.device,
          warning: `Configured printer unavailable. Used ${fallbackSystemAttempt.device} instead.`,
        }
      }
    }
  }

  if (thermalEnabled) {
    try {
      await printThermal(order, store)
      return {
        success: true,
        route: { kind: 'escpos-usb', value: 'USB ESC/POS' } as PrinterRoute,
        device: 'USB ESC/POS',
        warning: systemAttempt.error ? `System printer unavailable. Used USB ESC/POS instead.` : undefined,
      }
    } catch (thermalError: any) {
      return {
        success: false,
        route: systemAttempt.route,
        device: systemAttempt.device,
        error: systemAttempt.error || thermalError?.message || 'Print failed',
      }
    }
  }

  return systemAttempt
}

export function registerPrinterHandlers() {
  ipcMain.handle(IPC.PRINTER.GET_STATUS, () => printerStatus)

  ipcMain.handle(IPC.PRINTER.LIST_PRINTERS, async () => {
    const systemPrinters = await listSystemPrinters()
    return [
      ...systemPrinters,
      {
        name: 'USB ESC/POS (Legacy Direct Mode)',
        description: 'Direct USB thermal printing for legacy ESC/POS devices',
        isDefault: false,
        value: 'escpos-usb',
        kind: 'escpos-usb',
      },
    ]
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
    const effectivePrinterInterface = await resolvePrinterInterface(printerInterface)
    const result = await printReceiptUsingConfiguredHardware(order, {
      storeName, storeAddress, storePhone, storeTin, receiptFooter,
    }, effectivePrinterInterface, thermalEnabled)

    if (!result.success) {
      applyPrinterStatus({
        connected: false,
        type: result.route.kind,
        device: result.device || 'Unknown printer',
        error: result.error || 'Print failed',
      })
      return { success: false, error: result.error || 'Print failed' }
    }

    applyPrinterStatus({
      connected: true,
      type: result.route.kind,
      device: result.device || 'Unknown printer',
    })
    return result.warning ? { success: true, warning: result.warning } : { success: true }
  })

  ipcMain.handle(IPC.PRINTER.TEST_PAGE, async () => {
    try {
      const { thermalEnabled, printerInterface, storeName, storeAddress, storePhone, storeTin, receiptFooter } = getPrinterSettings()
      const effectivePrinterInterface = await resolvePrinterInterface(printerInterface)
      const result = await printReceiptUsingConfiguredHardware({ test: true }, {
        storeName,
        storeAddress,
        storePhone,
        storeTin,
        receiptFooter,
      }, effectivePrinterInterface, thermalEnabled)
      if (!result.success) throw new Error(result.error || 'Print failed')
      applyPrinterStatus({
        connected: true,
        type: result.route.kind,
        device: result.device || 'Unknown printer',
      })
      return { success: true }
    } catch (err: any) {
      applyPrinterStatus({
        connected: false,
        type: printerStatus.type || 'system-dialog',
        device: printerStatus.device || 'Unknown printer',
        error: err.message,
      })
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

  const orderDiscount = Number(order?.discount || 0)
  const orderSubtotal = Number(order?.subtotal || order?.total || 0)
  const orderTotal = Number(order?.total || 0)
  // Derive VAT from the difference: total = (subtotal - discount) + vat
  const impliedVat = Math.max(0, orderTotal - (orderSubtotal - orderDiscount))
  const hasBreakdown = orderDiscount > 0 || impliedVat > 0.005

  const discountRow = !order?.test && orderDiscount > 0
    ? `<div class="summary-row"><span>Discount</span><span>- ${escapeHtml(formatPeso(orderDiscount))}</span></div>`
    : ''
  const subtotalRow = !order?.test && hasBreakdown
    ? `<div class="summary-row"><span>Subtotal</span><span>${escapeHtml(formatPeso(orderSubtotal))}</span></div>`
    : ''
  const vatRow = !order?.test && impliedVat > 0.005
    ? `<div class="summary-row"><span>VAT</span><span>${escapeHtml(formatPeso(impliedVat))}</span></div>`
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
    ${subtotalRow}
    ${discountRow}
    ${vatRow}
    <div class="summary-row subtotal"><span>${hasBreakdown ? 'Total' : 'Sub Total'}</span><span>${escapeHtml(formatPeso(order?.total))}</span></div>
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
        line-height: 1.35;
      }
      .receipt {
        width: 72mm;
        max-width: 100%;
        margin: 0 auto;
        padding: 8px 6px 18px;
      }
      .center { text-align: center; }
      .store-name {
        font-size: 18px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.01em;
        margin-bottom: 3px;
      }
      .store-info { font-size: 11px; line-height: 1.45; }
      .divider {
        border: none;
        border-top: 1px dotted #777;
        margin: 10px 0;
      }
      .short-divider {
        border: none;
        border-top: 1px dotted #777;
        width: 60%;
        margin: 12px auto 10px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin: 2px 0;
        gap: 10px;
      }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 10px; }
      th, td { padding: 4px 0; vertical-align: top; font-size: 12px; }
      th { font-weight: 700; }
      .name-col { text-align: left; }
      .qty-col  { text-align: center; width: 40px; }
      .price-col { text-align: right; width: 70px; white-space: nowrap; }
      .summary-row {
        display: flex;
        justify-content: space-between;
        margin: 3px 0;
        font-size: 12px;
      }
      .summary-row.subtotal {
        font-size: 18px;
        font-weight: 900;
        margin: 6px 0 5px;
      }
      .barcode-wrap { text-align: center; margin: 4px 0 2px; }
      .barcode-wrap svg { max-width: 100%; }
      .barcode-text { font-family: monospace; font-size: 13px; letter-spacing: 0.1em; margin: 6px 0; }
      .thank-you { font-size: 18px; font-weight: 900; letter-spacing: 0.03em; margin-top: 6px; text-transform: uppercase; }
      .footer-msg { font-size: 12px; margin-top: 3px; }
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
  const { paperSize } = getPrinterSettings()
  const paperWidthMm  = paperSize === '80mm' ? 80 : 58
  // Convert mm → px at 96 dpi (1 mm = 3.7795 px) with a small extra margin
  const windowWidthPx = Math.round(paperWidthMm * 3.7795) + 16

  const tmpFile = path.join(os.tmpdir(), `reyna_receipt_${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')

  const printWindow = new BrowserWindow({
    show: false,
    width: windowWidthPx,
    height: 2400,             // tall enough for any receipt length
    webPreferences: { sandbox: false, nodeIntegration: false },
  })

  const deviceName = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined
  const deviceLabel = deviceName || 'system-dialog'

  try {
    await printWindow.loadURL(`file://${tmpFile}`)
    // Wait for JsBarcode and layout to finish before capturing the print job
    await new Promise(resolve => setTimeout(resolve, 500))
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({
        silent: !!deviceName,
        printBackground: true,
        deviceName,
        // Match paper dimensions exactly so content isn't clipped or scaled
        pageSize: {
          width:  paperWidthMm * 1000,   // microns
          height: 2000 * 1000,           // 2000 mm — continuous feed
        },
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 4, right: 4 },
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
    const usbMod = require('@node-escpos/usb-adapter')
    const USB = usbMod?.default ?? usbMod
    if (typeof USB !== 'function') throw new Error('USB thermal printer driver not available')
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
    await printer.init()

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
      const tDiscount = Number(order.discount || 0)
      const tSubtotal = Number(order.subtotal || order.total || 0)
      const tTotal = Number(order.total || 0)
      const tVat = Math.max(0, tTotal - (tSubtotal - tDiscount))
      const tHasBreakdown = tDiscount > 0 || tVat > 0.005
      if (tHasBreakdown) {
        printer.text(rowLine('Subtotal', formatPeso(tSubtotal), colWidth))
      }
      if (tDiscount > 0) {
        printer.text(rowLine('Discount', `- ${formatPeso(tDiscount)}`, colWidth))
      }
      if (tVat > 0.005) {
        printer.text(rowLine('VAT', formatPeso(tVat), colWidth))
      }
      printer.style(true, false, false)
      printer.text(rowLine(tHasBreakdown ? 'Total' : 'Sub Total', formatPeso(tTotal), colWidth))
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
