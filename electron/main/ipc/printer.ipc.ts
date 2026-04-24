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
  if (printerInterface) return printerInterface

  const printers = await listSystemPrinters()
  const defaultPrinter = printers.find((printer: any) => printer.isDefault)
  if (defaultPrinter?.name) return `system:${defaultPrinter.name}`
  if (printers.length === 1 && printers[0]?.name) return `system:${printers[0].name}`

  return ''
}

export async function printOrder(order: any): Promise<{ success: boolean; error?: string }> {
  const { thermalEnabled, storeName, storeAddress, storePhone, storeTin, receiptFooter, printerInterface } = getPrinterSettings()
  const effectivePrinterInterface = await resolvePrinterInterface(printerInterface)
  const preferSystemPrinter = effectivePrinterInterface.startsWith('system:')

  if (thermalEnabled && !preferSystemPrinter) {
    try {
      await printThermal(order, { storeName, storeAddress, storePhone, storeTin, receiptFooter })
      return { success: true }
    } catch {
      const result = await printHtmlReceipt(order, { storeName, storeAddress, storePhone, storeTin, receiptFooter }, effectivePrinterInterface)
      return result.success ? { success: true } : { success: false, error: result.error }
    }
  }

  const result = await printHtmlReceipt(order, { storeName, storeAddress, storePhone, storeTin, receiptFooter }, effectivePrinterInterface)
  return result.success ? { success: true } : { success: false, error: result.error }
}

export function registerPrinterHandlers() {
  ipcMain.handle(IPC.PRINTER.GET_STATUS, () => printerStatus)

  ipcMain.handle(IPC.PRINTER.LIST_PRINTERS, async () => {
    return await listSystemPrinters()
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
    const preferSystemPrinter = effectivePrinterInterface.startsWith('system:')

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
        }, effectivePrinterInterface)

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
        return {
          success: false,
          error: 'Thermal USB printer unavailable and no system printer is configured. Please go to Settings → Printer and select a printer.',
        }
      }
    }

    const result = await printHtmlReceipt(order, {
      storeName, storeAddress, storePhone, storeTin, receiptFooter,
    }, effectivePrinterInterface)

    const systemDevice = effectivePrinterInterface.startsWith('system:') ? effectivePrinterInterface.replace('system:', '') : 'system-dialog'
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
      const effectivePrinterInterface = await resolvePrinterInterface(printerInterface)
      const preferSystemPrinter = effectivePrinterInterface.startsWith('system:')
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
        }, effectivePrinterInterface)
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


function getReceiptLayout(paperSize: string) {
  const is80mm = paperSize === '80mm'

  return {
    paperWidthMm: is80mm ? 80 : 58,
    contentWidthMm: is80mm ? 72 : 48,
    horizontalPaddingMm: is80mm ? 4 : 2.2,
    bodyFontPx: is80mm ? 13 : 10.5,
    infoFontPx: is80mm ? 12 : 10,
    storeNamePx: is80mm ? 21 : 15,
    totalPx: is80mm ? 20 : 17,
    qtyColPx: is80mm ? 44 : 28,
    priceColPx: is80mm ? 80 : 50,
    barcodeHeight: is80mm ? 52 : 34,
    barcodeWidth: is80mm ? 1.7 : 1.02,
    barcodeFontPx: is80mm ? 11 : 8,
    shortDividerWidth: is80mm ? '46mm' : '28mm',
    footerGapMm: is80mm ? 6 : 5,
  }
}

function buildBarcodeHtml(order: any, layout: ReturnType<typeof getReceiptLayout>, compact = false) {
  const orderNumber = escapeHtml(order?.order_number || '')
  if (!orderNumber || order?.test) return ''

  if (_jsBarcodeScript) {
    return `
      <div class="barcode-wrap${compact ? ' compact' : ''}">
        <svg id="rcpt-barcode"></svg>
      </div>
      <script>${_jsBarcodeScript}</script>
      <script>
        try {
          JsBarcode("#rcpt-barcode", ${JSON.stringify(order?.order_number || '')}, {
            format: "CODE128",
            width: ${layout.barcodeWidth},
            height: ${layout.barcodeHeight},
            displayValue: true,
            fontSize: ${layout.barcodeFontPx},
            margin: 0,
            lineColor: "#000",
            background: "#fff"
          });
        } catch(e) {}
      </script>
    `
  }

  return `<div class="center barcode-text">${orderNumber}</div>`
}

function buildReceiptHtml58(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string },
  layout: ReturnType<typeof getReceiptLayout>
) {
  const { storeName, storeAddress, storePhone, storeTin, receiptFooter } = store
  const createdAt = formatDateTime(order?.created_at)
  const cashierName = getCashierName(order?.user_id)
  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
  const orderDiscount = Number(order?.discount || 0)
  const orderSubtotal = Number(order?.subtotal || order?.total || 0)
  const orderTotal = Number(order?.total || 0)
  const impliedVat = Math.max(0, orderTotal - (orderSubtotal - orderDiscount))
  const hasBreakdown = orderDiscount > 0 || impliedVat > 0.005

  const itemsHtml = (order?.items || []).map((item: any) => `
    <tr>
      <td class="name-col">${escapeHtml(item.name)}</td>
      <td class="qty-col">${escapeHtml(formatQty(item.quantity))}</td>
      <td class="price-col">${escapeHtml(formatPeso(item.subtotal))}</td>
    </tr>
  `).join('')

  let paymentRows = ''
  if (!order?.test) {
    if (order?.is_credit) {
      paymentRows = `<div class="summary-row"><span>Payment</span><span>Charge to Account</span></div>`
    } else if (payments.length > 0) {
      paymentRows = payments.map((entry: any) => {
        const label = entry.method === 'gcash' ? 'GCASH' : entry.method === 'card' ? 'CARD' : 'CASH'
        return `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatPeso(entry.amount))}</span></div>`
      }).join('')
      if (order?.change_amount != null) {
        paymentRows += `<div class="summary-row"><span>CHANGE</span><span>${escapeHtml(formatPeso(order.change_amount))}</span></div>`
      }
    } else if (order?.payment_amount != null) {
      paymentRows = `<div class="summary-row"><span>CASH</span><span>${escapeHtml(formatPeso(order.payment_amount))}</span></div>`
      if (order?.change_amount != null) {
        paymentRows += `<div class="summary-row"><span>CHANGE</span><span>${escapeHtml(formatPeso(order.change_amount))}</span></div>`
      }
    }
  }

  const barcodeHtml = buildBarcodeHtml(order, layout, true)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      :root {
        color-scheme: light;
        --paper-width: ${layout.paperWidthMm}mm;
        --content-width: ${layout.contentWidthMm}mm;
        --body-font: ${layout.bodyFontPx}px;
        --info-font: ${layout.infoFontPx}px;
        --store-name-font: ${layout.storeNamePx}px;
        --total-font: ${layout.totalPx}px;
        --qty-col-width: ${layout.qtyColPx}px;
        --price-col-width: ${layout.priceColPx}px;
      }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        width: var(--paper-width);
        background: #fff;
      }
      body {
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: var(--body-font);
        line-height: 1.25;
        display: flex;
        justify-content: center;
      }
      .receipt {
        width: var(--content-width);
        margin: 0 auto;
        padding: 2.4mm 0 4.5mm;
      }
      .center { text-align: center; }
      .store-name {
        font-size: var(--store-name-font);
        font-weight: 900;
        text-transform: uppercase;
        line-height: 1.05;
        letter-spacing: -0.01em;
      }
      .store-info {
        margin-top: 2px;
        font-size: var(--info-font);
        line-height: 1.2;
      }
      .divider {
        border: none;
        border-top: 1px dotted #8a8a8a;
        margin: 7px 0;
      }
      .info-row, .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        margin: 2px 0;
        font-size: var(--body-font);
      }
      .info-row span:first-child, .summary-row span:first-child {
        flex: 0 0 auto;
      }
      .info-row span:last-child, .summary-row span:last-child {
        flex: 1 1 auto;
        text-align: right;
        white-space: nowrap;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin: 6px 0;
      }
      th, td {
        padding: 2px 0;
        vertical-align: top;
        font-size: var(--body-font);
      }
      th {
        font-weight: 700;
      }
      .name-col {
        text-align: left;
        padding-right: 5px;
        word-break: break-word;
      }
      .qty-col {
        width: var(--qty-col-width);
        text-align: center;
      }
      .price-col {
        width: var(--price-col-width);
        text-align: right;
        white-space: nowrap;
      }
      .summary-row.total {
        margin-top: 4px;
        font-size: var(--total-font);
        font-weight: 900;
      }
      .short-divider {
        border: none;
        border-top: 1px dotted #8a8a8a;
        width: 28mm;
        margin: 8px auto 6px;
      }
      .barcode-wrap.compact {
        display: flex;
        justify-content: center;
        width: 100%;
        overflow: hidden;
        margin: 2px 0 0;
      }
      .barcode-wrap.compact svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      .barcode-text {
        font-family: monospace;
        font-size: 9px;
        letter-spacing: 0.05em;
        margin-top: 4px;
      }
      .thank-you {
        margin-top: 6px;
        font-size: 16px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.01em;
      }
      .footer-msg {
        margin-top: 2px;
        font-size: 10px;
      }
      .note {
        margin-top: 4px;
        font-size: 9.5px;
      }
      @page {
        size: var(--paper-width) auto;
        margin: 0;
      }
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
      ${order?.test ? `
        <div class="divider"></div>
        <p class="center">Test page printed successfully.</p>
        <p class="center store-info">${escapeHtml(createdAt)}</p>
      ` : `
        <div class="divider"></div>
        <div class="info-row"><span>Cashier:</span><span>${escapeHtml(cashierName)}</span></div>
        <div class="info-row"><span>Receipt #:</span><span>${escapeHtml(order?.order_number || 'N/A')}</span></div>
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
        ${hasBreakdown ? `<div class="summary-row"><span>Subtotal</span><span>${escapeHtml(formatPeso(orderSubtotal))}</span></div>` : ''}
        ${orderDiscount > 0 ? `<div class="summary-row"><span>Discount</span><span>- ${escapeHtml(formatPeso(orderDiscount))}</span></div>` : ''}
        ${impliedVat > 0.005 ? `<div class="summary-row"><span>VAT</span><span>${escapeHtml(formatPeso(impliedVat))}</span></div>` : ''}
        <div class="summary-row total"><span>${hasBreakdown ? 'Total' : 'Sub Total'}</span><span>${escapeHtml(formatPeso(orderTotal))}</span></div>
        ${paymentRows}
        ${order?.note ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ''}
        <div class="short-divider"></div>
        ${barcodeHtml}
      `}
      <div class="center">
        <div class="thank-you">THANK YOU!</div>
        <div class="footer-msg">${escapeHtml(receiptFooter)}</div>
      </div>
    </div>
  </body>
</html>`
}

function buildReceiptHtml(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string },
  paperSize: string
) {
  const layout = getReceiptLayout(paperSize)
  if (paperSize === '58mm') {
    return buildReceiptHtml58(order, store, layout)
  }

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
  const barcodeHtml = buildBarcodeHtml(order, layout)

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
      :root {
        color-scheme: light;
        --paper-width: ${layout.paperWidthMm}mm;
        --content-width: ${layout.contentWidthMm}mm;
        --side-pad: ${layout.horizontalPaddingMm}mm;
        --body-font: ${layout.bodyFontPx}px;
        --info-font: ${layout.infoFontPx}px;
        --store-name-font: ${layout.storeNamePx}px;
        --total-font: ${layout.totalPx}px;
        --qty-col-width: ${layout.qtyColPx}px;
        --price-col-width: ${layout.priceColPx}px;
        --short-divider-width: ${layout.shortDividerWidth};
        --footer-gap: ${layout.footerGapMm}mm;
      }
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        width: var(--paper-width);
        background: #fff;
      }
      body {
        background: #fff;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: var(--body-font);
        line-height: 1.32;
        display: flex;
        justify-content: center;
      }
      .receipt {
        width: var(--content-width);
        margin: 0 auto;
        padding: 4mm var(--side-pad) var(--footer-gap);
      }
      .center { text-align: center; }
      .store-name {
        font-size: var(--store-name-font);
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0;
        line-height: 1.1;
        margin-bottom: 2px;
        word-break: break-word;
      }
      .store-info {
        font-size: var(--info-font);
        line-height: 1.35;
        margin-top: 2px;
        word-break: break-word;
      }
      .divider {
        border: none;
        border-top: 1px dotted #777;
        margin: 10px 0 9px;
      }
      .short-divider {
        border: none;
        border-top: 1px dotted #777;
        width: var(--short-divider-width);
        max-width: 70%;
        margin: 12px auto 10px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-size: var(--body-font);
        margin: 3px 0;
        gap: 10px;
      }
      .info-row span:first-child { flex: 0 0 auto; }
      .info-row span:last-child {
        flex: 1 1 auto;
        text-align: right;
        word-break: break-word;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        margin: 8px 0 10px;
      }
      th, td {
        padding: 4px 0;
        vertical-align: top;
        font-size: var(--body-font);
      }
      th { font-weight: 700; }
      .name-col {
        text-align: left;
        padding-right: 8px;
        word-break: break-word;
      }
      .qty-col  { text-align: center; width: var(--qty-col-width); }
      .price-col { text-align: right; width: var(--price-col-width); white-space: nowrap; }
      .summary-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        margin: 3px 0;
        font-size: var(--body-font);
      }
      .summary-row span:first-child { flex: 1 1 auto; }
      .summary-row span:last-child { flex: 0 0 auto; text-align: right; white-space: nowrap; }
      .summary-row.subtotal {
        font-size: var(--total-font);
        font-weight: 900;
        margin: 6px 0 5px;
      }
      .barcode-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        margin: 4px 0 2px;
        overflow: hidden;
      }
      .barcode-wrap svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      .barcode-text {
        font-family: monospace;
        font-size: var(--body-font);
        letter-spacing: 0.08em;
        margin: 6px 0;
      }
      .thank-you {
        font-size: var(--total-font);
        font-weight: 900;
        letter-spacing: 0.02em;
        margin-top: 6px;
        text-transform: uppercase;
      }
      .footer-msg { font-size: var(--body-font); margin-top: 3px; }
      .section-gap { margin: 16px 0; }
      .note {
        font-size: var(--info-font);
        margin-top: 5px;
        word-break: break-word;
      }
      @page {
        size: var(--paper-width) auto;
        margin: 0;
      }
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
  const { paperSize } = getPrinterSettings()
  const html = buildReceiptHtml(order, store, paperSize)
  return printHtmlContent(html, printerInterface)
}

async function printHtmlContent(html: string, printerInterface: string) {
  const { paperSize } = getPrinterSettings()
  const paperWidthMm  = paperSize === '80mm' ? 80 : 58
  const windowWidthPx = Math.round(paperWidthMm * 3.7795) + 4

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
        pageSize: {
          width:  paperWidthMm * 1000,
          height: 2000 * 1000,
        },
        margins: { marginType: 'none' },
        scaleFactor: 100,
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
