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

    try {
      const result = await printHtmlReceipt(order, {
        storeName, storeAddress, storePhone, storeTin, receiptFooter,
      }, printerInterface)
      if (!result.success) {
        throw new Error(result.error || 'Print failed')
      }
      printerStatus.connected = true
      printerStatus.type = 'system'
      printerStatus.device = result.device
      printerStatus.error = ''
    } catch (err: any) {
      const systemDevice = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : 'system-dialog'
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

function getItemCount(order: any) {
  return (order.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
}

function buildReceiptHtml(
  order: any,
  store: { storeName: string; storeAddress: string; storePhone: string; storeTin: string; receiptFooter: string }
) {
  const { storeName, storeAddress, storePhone, storeTin, receiptFooter } = store
  const createdAt = formatDateTime(order?.created_at)
  const cashierName = getCashierName(order?.user_id)
  const itemCount = getItemCount(order)
  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
  const itemsHtml = (order?.items || []).map((item: any) => `
    <tr>
      <td class="qty">${escapeHtml(formatQty(item.quantity))}x</td>
      <td class="desc">
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="meta">${escapeHtml(formatPeso(item.price))} each</div>
      </td>
      <td class="amount">${escapeHtml(formatPeso(item.subtotal))}</td>
    </tr>
  `).join('')

  const paymentsHtml = order?.test ? '' : (
    order?.is_credit
      ? `<div class="summary-row"><span>Payment</span><span>Charge to Account</span></div>`
      : (
        payments.length > 0
          ? payments.map((entry: any) => {
              const label = entry.method === 'gcash' ? 'GCash' : entry.method === 'card' ? 'Card' : 'Cash'
              return `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatPeso(entry.amount))}</span></div>`
            }).join('')
          : (order?.payment_amount != null
              ? `<div class="summary-row"><span>Cash</span><span>${escapeHtml(formatPeso(order.payment_amount))}</span></div>`
              : '')
      )
  )

  const changeHtml = !order?.test && !order?.is_credit && order?.payment_amount != null
    ? `<div class="summary-row"><span>Change</span><span>${escapeHtml(formatPeso(order.change_amount))}</span></div>`
    : ''

  const discountHtml = !order?.test && Number(order?.discount || 0) > 0
    ? `<div class="summary-row"><span>Discount</span><span>- ${escapeHtml(formatPeso(order.discount))}</span></div>`
    : ''

  const noteHtml = order?.note
    ? `<div class="note"><strong>Note:</strong> ${escapeHtml(order.note)}</div>`
    : ''

  const orderMetaHtml = order?.test ? `
    <div class="meta-block">
      <div>Printer Test Page</div>
      <div>${escapeHtml(createdAt)}</div>
    </div>
  ` : `
    <div class="meta-block">
      <div>Receipt #: ${escapeHtml(order?.order_number || 'N/A')}</div>
      <div>Date: ${escapeHtml(createdAt)}</div>
      ${cashierName ? `<div>Cashier: ${escapeHtml(cashierName)}</div>` : ''}
      ${order?.customer_name ? `<div>Customer: ${escapeHtml(order.customer_name)}</div>` : ''}
    </div>
  `

  const itemsSection = order?.test ? `
    <div class="center section-gap">Test page printed successfully.</div>
  ` : `
    <table>
      <thead>
        <tr>
          <th class="qty">Qty</th>
          <th class="desc">Item</th>
          <th class="amount">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="divider"></div>

    <div class="summary-row"><span>Subtotal</span><span>${escapeHtml(formatPeso(order?.subtotal))}</span></div>
    ${discountHtml}
    <div class="summary-row total"><span>Total</span><span>${escapeHtml(formatPeso(order?.total))}</span></div>
    ${paymentsHtml}
    ${changeHtml}
    <div class="divider"></div>
    <div class="center sold">${escapeHtml(formatQty(itemCount))} item(s) sold</div>
    ${noteHtml}
  `

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Receipt</title>
      <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #fff;
          color: #000;
          font-family: "Courier New", Courier, monospace;
          font-size: 12px;
          line-height: 1.35;
        }
        .receipt {
          width: 72mm;
          max-width: 100%;
          margin: 0 auto;
          padding: 8px 10px 18px;
        }
        .center { text-align: center; }
        .store-name {
          font-size: 18px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 4px;
        }
        .meta-block {
          margin: 10px 0 8px;
          text-align: left;
        }
        .divider {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }
        .section-gap {
          margin: 18px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 2px 0;
          vertical-align: top;
        }
        th {
          font-weight: 700;
          text-align: left;
        }
        .qty {
          width: 32px;
          white-space: nowrap;
        }
        .amount {
          width: 74px;
          text-align: right;
          white-space: nowrap;
        }
        .meta {
          font-size: 11px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin: 2px 0;
        }
        .total {
          font-size: 14px;
          font-weight: 700;
          margin-top: 4px;
        }
        .sold {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .note {
          margin-top: 8px;
        }
        @page {
          margin: 6mm;
          size: auto;
        }
      </style>
    </head>
    <body>
      <main class="receipt">
        <div class="center">
          <div class="store-name">${escapeHtml(storeName)}</div>
          ${storeAddress ? `<div>${escapeHtml(storeAddress)}</div>` : ''}
          ${storePhone ? `<div>${escapeHtml(storePhone)}</div>` : ''}
          ${storeTin ? `<div>TIN: ${escapeHtml(storeTin)}</div>` : ''}
        </div>
        <div class="divider"></div>
        ${orderMetaHtml}
        <div class="divider"></div>
        ${itemsSection}
        <div class="divider"></div>
        <div class="center">${escapeHtml(receiptFooter)}</div>
      </main>
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
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: false,
    },
  })

  const deviceName = printerInterface.startsWith('system:') ? printerInterface.replace('system:', '') : undefined
  const deviceLabel = deviceName || 'system-dialog'

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print({
        silent: false,
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
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
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
    const divider = '-'.repeat(colWidth)

    printer = new Printer(device)

    // ── Header ────────────────────────────────────────────────────────────────
    printer.align('CT').style(true, false, false).text(storeName)
    printer.style(false, false, false)
    if (storeAddress) printer.text(storeAddress)
    if (storePhone) printer.text(storePhone)
    if (storeTin) printer.text(`TIN: ${storeTin}`)
    printer.text(`Date: ${formatDateTime(order?.created_at)}`)
    printer.text(divider)

    if (order.test) {
      printer.text('Test Page - Printer OK')
    } else {
      const cashierName = getCashierName(order?.user_id)
      printer.text(`Receipt #: ${order.order_number || 'N/A'}`)
      if (cashierName) printer.text(`Cashier: ${cashierName}`)
      if (order.customer_name) printer.text(`Customer: ${order.customer_name}`)
      printer.text(divider)

      // ── Items ──────────────────────────────────────────────────────────────
      printer.align('LT')
      for (const item of order.items || []) {
        printer.text(rowLine(`${formatQty(item.quantity)}x ${item.name}`, formatPeso(item.subtotal), colWidth))
        printer.text(rowLine(`  @ ${formatPeso(item.price)}`, '', colWidth))
      }
      printer.text(divider)

      printer.text(rowLine('Subtotal', formatPeso(order.subtotal), colWidth))
      if (Number(order.discount || 0) > 0) {
        printer.text(rowLine('Discount', `- ${formatPeso(order.discount)}`, colWidth))
      }
      const totalRight = formatPeso(order.total)
      printer.style(true, false, false).text(rowLine('TOTAL', totalRight, colWidth))
      printer.style(false, false, false)

      // ── Payments ──────────────────────────────────────────────────────────
      const payments = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
      if (order.is_credit) {
        printer.text(rowLine('Payment', 'Charge to Account', colWidth))
      } else if (payments.length > 0) {
        for (const entry of payments) {
          const label = entry.method === 'gcash' ? 'GCash' : entry.method === 'card' ? 'Card' : 'Cash'
          printer.text(rowLine(label, formatPeso(entry.amount || 0), colWidth))
        }
      } else if (order.payment_amount) {
        printer.text(rowLine('Cash', formatPeso(order.payment_amount), colWidth))
      }
      if (!order.is_credit && order.payment_amount != null) {
        printer.text(rowLine('Change', formatPeso(order.change_amount || 0), colWidth))
      }
      printer.text(divider)
      printer.align('CT').text(`${formatQty(getItemCount(order))} item(s) sold`)
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
