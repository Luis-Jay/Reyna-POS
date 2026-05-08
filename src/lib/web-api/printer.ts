import { settingsApi } from './settings'

// ──────────────────────────────────────────────────────────────
// Web USB ESC/POS direct thermal printer support
// Works on Chrome / Edge only (navigator.usb)
// ──────────────────────────────────────────────────────────────
const WEB_USB_SUPPORTED = typeof navigator !== 'undefined' && 'usb' in navigator

let _usbDevice: USBDevice | null = null
let _usbInterfaceNum = 0
let _usbEndpointNum = 1

if (WEB_USB_SUPPORTED) {
  navigator.usb.addEventListener('disconnect', (event: any) => {
    if (_usbDevice && event.device === _usbDevice) {
      _usbDevice = null
    }
  })
}

async function findBulkOutEndpoint(device: USBDevice): Promise<{ iface: number; ep: number } | null> {
  for (const iface of (device.configuration?.interfaces ?? [])) {
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.direction === 'out' && ep.type === 'bulk') {
          return { iface: iface.interfaceNumber, ep: ep.endpointNumber }
        }
      }
    }
  }
  return null
}

async function openUsbDevice(device: USBDevice): Promise<boolean> {
  try {
    await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)
    const found = await findBulkOutEndpoint(device)
    if (!found) { await device.close().catch(() => {}); return false }
    _usbInterfaceNum = found.iface
    _usbEndpointNum = found.ep
    await device.claimInterface(_usbInterfaceNum)
    _usbDevice = device
    return true
  } catch {
    return false
  }
}

async function sendEscPos(data: Uint8Array): Promise<boolean> {
  if (!_usbDevice) return false
  try {
    // Send in 4096-byte chunks to be safe across different printer firmware
    const CHUNK = 4096
    for (let i = 0; i < data.length; i += CHUNK) {
      await _usbDevice.transferOut(_usbEndpointNum, data.slice(i, i + CHUNK))
    }
    return true
  } catch (err) {
    console.error('[printer] USB send error:', err)
    _usbDevice = null
    return false
  }
}

function escposConcat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

function buildEscPosData(order: any, store: {
  storeName: string; storeAddress: string; storePhone: string
  storeTin: string; receiptFooter: string; paperSize: string
}): Uint8Array {
  const enc = new TextEncoder()
  const ESC = 0x1B
  const GS = 0x1D
  const LF = new Uint8Array([0x0A])
  const t = (s: string) => enc.encode(s)
  const cols = store.paperSize === '80mm' ? 42 : 32
  const div = t('-'.repeat(cols) + '\n')
  const nameW = cols - 14

  const parts: Uint8Array[] = [
    new Uint8Array([ESC, 0x40]),          // ESC @ init
    new Uint8Array([ESC, 0x61, 0x01]),    // center
    new Uint8Array([ESC, 0x45, 0x01]),    // bold on
    new Uint8Array([GS, 0x21, 0x11]),     // 2x size
    t(store.storeName.toUpperCase() + '\n'),
    new Uint8Array([GS, 0x21, 0x00]),     // normal size
    new Uint8Array([ESC, 0x45, 0x00]),    // bold off
  ]

  if (store.storeAddress) parts.push(t(store.storeAddress + '\n'))
  if (store.storePhone) parts.push(t('Tel: ' + store.storePhone + '\n'))
  if (store.storeTin) parts.push(t('TIN: ' + store.storeTin + '\n'))
  parts.push(new Uint8Array([ESC, 0x61, 0x00]), div)  // left, divider

  if (order?.test) {
    parts.push(
      new Uint8Array([ESC, 0x61, 0x01]),
      t('\nTest page printed successfully.\n\n'),
      t(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) + '\n'),
      new Uint8Array([ESC, 0x61, 0x00]),
    )
  } else {
    const createdAt = order?.created_at
      ? new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

    parts.push(
      t('Receipt #: ' + (order?.order_number || '') + '\n'),
      t('Date: ' + createdAt + '\n'),
    )
    if (order?.customer_name) parts.push(t('Customer: ' + order.customer_name + '\n'))
    parts.push(div)

    // Column header
    parts.push(t('Name'.padEnd(nameW) + ' ' + 'Qty'.padStart(4) + ' ' + 'Price'.padStart(8) + '\n'), div)

    for (const item of (order?.items || [])) {
      const qty = Number(item.quantity || 0)
      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
      const price = 'P' + Number(item.subtotal || 0).toFixed(2)
      const name = String(item.name || '').substring(0, nameW).padEnd(nameW)
      parts.push(t(name + ' ' + qtyStr.padStart(4) + ' ' + price.padStart(8) + '\n'))
    }

    parts.push(div)

    const total = Number(order?.total || 0)
    const discount = Number(order?.discount || 0)
    if (discount > 0) parts.push(t('Discount: -P' + discount.toFixed(2) + '\n'))

    // Total — bold + 2x
    parts.push(
      new Uint8Array([ESC, 0x45, 0x01]),
      new Uint8Array([GS, 0x21, 0x11]),
      t('TOTAL: P' + total.toFixed(2) + '\n'),
      new Uint8Array([GS, 0x21, 0x00]),
      new Uint8Array([ESC, 0x45, 0x00]),
    )

    // Payments
    const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
    if (order?.is_credit) {
      parts.push(t('Payment: Charge to Account\n'))
    } else if (payments.length > 0) {
      for (const p of payments) {
        const method = p.method === 'gcash' ? 'GCASH' : p.method === 'card' ? 'CARD' : 'CASH'
        parts.push(t(method + ': P' + Number(p.amount || 0).toFixed(2) + '\n'))
      }
    } else if (order?.payment_amount != null) {
      parts.push(t('CASH: P' + Number(order.payment_amount).toFixed(2) + '\n'))
    }
    if (Number(order?.change_amount || 0) > 0) {
      parts.push(t('CHANGE: P' + Number(order.change_amount).toFixed(2) + '\n'))
    }
    if (order?.note) parts.push(t('Note: ' + order.note + '\n'))
    parts.push(div)
  }

  // Footer — centered
  parts.push(
    new Uint8Array([ESC, 0x61, 0x01]),
    new Uint8Array([ESC, 0x45, 0x01]),
    t('THANK YOU!\n'),
    new Uint8Array([ESC, 0x45, 0x00]),
    t((store.receiptFooter || '') + '\n'),
    LF, LF, LF,                           // paper feed
    new Uint8Array([ESC, 0x61, 0x00]),
    new Uint8Array([GS, 0x56, 0x42, 0x00]),  // partial cut
  )

  return escposConcat(...parts)
}

// Receipt HTML builder — ported from electron/main/ipc/printer.ipc.ts
function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatPeso(value: any) {
  return `P${Number(value || 0).toFixed(2)}`
}

function formatDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatQty(value: any) {
  const qty = Number(value || 0)
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
}

function buildReceiptHtml(order: any, store: {
  storeName: string; storeAddress: string; storePhone: string
  storeTin: string; receiptFooter: string; paperSize: string
}) {
  const { storeName, storeAddress, storePhone, storeTin, receiptFooter, paperSize } = store
  const is58mm = paperSize !== '80mm'
  // Dimensions: 58mm paper → 48mm printable; 80mm paper → 72mm printable
  const receiptWidth = is58mm ? '48mm' : '72mm'
  const pageSize    = is58mm ? '58mm' : '80mm'
  const pageMargin  = is58mm ? '3mm 4mm' : '4mm'
  const bodyFont    = is58mm ? '11px' : '12px'
  const headerFont  = is58mm ? '14px' : '18px'
  const totalFont   = is58mm ? '15px' : '18px'
  const priceWidth  = is58mm ? '58px' : '70px'
  const qtyWidth    = is58mm ? '28px' : '40px'
  const createdAt = formatDateTime(order?.created_at)
  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []

  const itemsHtml = (order?.items || []).map((item: any) => `
    <tr>
      <td class="name-col">${escapeHtml(item.name)}</td>
      <td class="qty-col">${escapeHtml(formatQty(item.quantity))}</td>
      <td class="price-col">${escapeHtml(formatPeso(item.subtotal))}</td>
    </tr>`).join('')

  let paymentRows = ''
  if (!order?.test) {
    if (order?.is_credit || order?.is_credit === 1) {
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

  const orderDiscount = Number(order?.discount || 0)
  const orderSubtotal = Number(order?.subtotal || order?.total || 0)
  const orderTotal = Number(order?.total || 0)
  const impliedVat = Math.max(0, orderTotal - (orderSubtotal - orderDiscount))
  const hasBreakdown = orderDiscount > 0 || impliedVat > 0.005

  const discountRow = !order?.test && orderDiscount > 0
    ? `<div class="summary-row"><span>Discount</span><span>- ${escapeHtml(formatPeso(orderDiscount))}</span></div>` : ''
  const subtotalRow = !order?.test && hasBreakdown
    ? `<div class="summary-row"><span>Subtotal</span><span>${escapeHtml(formatPeso(orderSubtotal))}</span></div>` : ''
  const vatRow = !order?.test && impliedVat > 0.005
    ? `<div class="summary-row"><span>VAT</span><span>${escapeHtml(formatPeso(impliedVat))}</span></div>` : ''
  const noteRow = order?.note ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ''

  const orderNumber = escapeHtml(order?.order_number || '')
  const barcodeSection = orderNumber && !order?.test
    ? `<div class="center barcode-text">${orderNumber}</div>` : ''

  const bodyHtml = order?.test ? `
    <div class="divider"></div>
    <p class="center section-gap">Test page printed successfully.</p>
    <p class="center" style="font-size:11px">${escapeHtml(createdAt)}</p>
  ` : `
    <div class="divider"></div>
    <div class="info-row"><span>Receipt #:</span><span>${orderNumber}</span></div>
    <div class="info-row"><span>Date:</span><span>${escapeHtml(createdAt)}</span></div>
    ${order?.customer_name ? `<div class="info-row"><span>Customer:</span><span>${escapeHtml(order.customer_name)}</span></div>` : ''}
    <div class="divider"></div>
    <table>
      <thead><tr><th class="name-col">Name</th><th class="qty-col">Qty</th><th class="price-col">Price</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="divider"></div>
    ${subtotalRow}${discountRow}${vatRow}
    <div class="summary-row subtotal"><span>${hasBreakdown ? 'Total' : 'Sub Total'}</span><span>${escapeHtml(formatPeso(order?.total))}</span></div>
    ${paymentRows}${noteRow}
    <div class="short-divider"></div>
    ${barcodeSection}
  `

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt</title>
  <style>
    :root{color-scheme:light}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:${bodyFont};line-height:1.35}
    .receipt{width:${receiptWidth};max-width:100%;margin:0 auto;padding:6px 2px 14px}
    .center{text-align:center}
    .store-name{font-size:${headerFont};font-weight:900;text-transform:uppercase;letter-spacing:.01em;margin-bottom:2px}
    .store-info{font-size:10px;line-height:1.4}
    .divider{border:none;border-top:1px dotted #777;margin:8px 0}
    .short-divider{border:none;border-top:1px dotted #777;width:60%;margin:10px auto 8px}
    .info-row{display:flex;justify-content:space-between;font-size:${bodyFont};margin:2px 0;gap:6px}
    table{width:100%;border-collapse:collapse;margin:6px 0 8px}
    th,td{padding:3px 0;vertical-align:top;font-size:${bodyFont}}
    th{font-weight:700}
    .name-col{text-align:left}
    .qty-col{text-align:center;width:${qtyWidth}}
    .price-col{text-align:right;width:${priceWidth};white-space:nowrap}
    .summary-row{display:flex;justify-content:space-between;margin:2px 0;font-size:${bodyFont}}
    .summary-row.subtotal{font-size:${totalFont};font-weight:900;margin:5px 0 4px}
    .barcode-text{font-family:monospace;font-size:12px;letter-spacing:.08em;margin:5px 0}
    .thank-you{font-size:${totalFont};font-weight:900;letter-spacing:.03em;margin-top:5px;text-transform:uppercase}
    .footer-msg{font-size:10px;margin-top:2px}
    .section-gap{margin:12px 0}
    .note{font-size:10px;margin-top:3px}
    @page{margin:${pageMargin};size:${pageSize} auto}
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

function isApplePrintBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua)
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isWebKit = /AppleWebKit/.test(ua)
  const isAltIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return (isIOS || isIPadDesktopMode) && isWebKit && !isAltIOSBrowser
}

function buildPopupPrintHtml(html: string) {
  return html.replace(
    '</body>',
    `<script>
      window.addEventListener('load', () => {
        setTimeout(() => {
          try {
            window.focus();
            window.print();
          } catch {}
        }, 250);
      });

      window.addEventListener('afterprint', () => {
        setTimeout(() => {
          try { window.close(); } catch {}
        }, 150);
      });
    </script>
  </body>`
  )
}

function buildInlinePrintRoot(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map(node => node.textContent || '')
    .join('\n')
  const bodyContent = parsed.body.innerHTML

  return `
    <style>
      ${styles}
      #reyna-inline-print-root{
        position:fixed;
        inset:0;
        z-index:2147483647;
        overflow:auto;
        background:#ffffff;
        padding:24px 12px 40px;
      }
      @media screen {
        body.reyna-printing-inline #root {
          display:none !important;
        }
      }
      @media print {
        html, body {
          background:#ffffff !important;
        }
        body.reyna-printing-inline #root {
          display:none !important;
        }
        body.reyna-printing-inline #reyna-inline-print-root {
          position:static !important;
          inset:auto !important;
          overflow:visible !important;
          padding:0 !important;
        }
      }
    </style>
    <div class="reyna-inline-print-body">${bodyContent}</div>
  `
}

function printWithInlineRoot(html: string): { success: boolean; error?: string } {
  const existingRoot = document.getElementById('reyna-inline-print-root')
  if (existingRoot) existingRoot.remove()

  const host = document.createElement('div')
  host.id = 'reyna-inline-print-root'
  host.innerHTML = buildInlinePrintRoot(html)
  document.body.appendChild(host)
  document.body.classList.add('reyna-printing-inline')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    window.removeEventListener('afterprint', cleanup)
    document.body.classList.remove('reyna-printing-inline')
    host.remove()
  }

  window.addEventListener('afterprint', cleanup, { once: true })

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.print()
      } finally {
        setTimeout(cleanup, 1500)
      }
    })
  })

  return { success: true }
}

async function getStoreSettings() {
  const keys = ['thermal_enabled','store_name','store_address','store_phone','store_tin','receipt_footer','paper_size']
  const entries = await Promise.all(keys.map(async k => [k, await settingsApi.get(k)]))
  const s = Object.fromEntries(entries)
  return {
    storeName: s['store_name'] || 'Reyna Store',
    storeAddress: s['store_address'] || '',
    storePhone: s['store_phone'] || '',
    storeTin: s['store_tin'] || '',
    receiptFooter: s['receipt_footer'] || 'Thank you for shopping with us!',
    paperSize: s['paper_size'] || '58mm', // default to 58mm
  }
}

function printHtml(html: string): { success: boolean; error?: string } {
  try {
    if (isApplePrintBrowser()) {
      return printWithInlineRoot(html)
    }

    // Use a hidden iframe so mobile browsers don't block it as a popup
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:80mm;height:200mm;border:none;visibility:hidden;'
    document.body.appendChild(iframe)
    iframe.onload = () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        document.body.removeChild(iframe)
        URL.revokeObjectURL(url)
      }, 2000)
    }
    iframe.src = url
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message }
  }
}

function buildReceiptText(order: any, store: {
  storeName: string; storeAddress: string; storePhone: string; receiptFooter: string
}): string {
  const { storeName, storeAddress, storePhone, receiptFooter } = store
  const createdAt = order?.created_at
    ? new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

  const sep = '--------------------------------'
  const lines: string[] = [
    storeName.toUpperCase(),
    storeAddress || '',
    storePhone ? `Tel: ${storePhone}` : '',
    sep,
    `Receipt #: ${order?.order_number || ''}`,
    `Date: ${createdAt}`,
    order?.customer_name ? `Customer: ${order.customer_name}` : '',
    sep,
    'Item                    Qty  Price',
    sep,
  ].filter(l => l !== '')

  for (const item of (order?.items || [])) {
    const qty = Number(item.quantity || 0)
    const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
    const price = `P${Number(item.subtotal || 0).toFixed(2)}`
    const name = String(item.name || '').substring(0, 20).padEnd(20)
    lines.push(`${name} ${qtyStr.padStart(4)}  ${price.padStart(8)}`)
  }

  lines.push(sep)
  const total = Number(order?.total || 0)
  lines.push(`TOTAL: P${total.toFixed(2)}`)

  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
  if (order?.is_credit) {
    lines.push('Payment: Charge to Account')
  } else if (payments.length > 0) {
    for (const p of payments) {
      const method = p.method === 'gcash' ? 'GCASH' : p.method === 'card' ? 'CARD' : 'CASH'
      lines.push(`${method}: P${Number(p.amount || 0).toFixed(2)}`)
    }
  } else if (order?.payment_amount != null) {
    lines.push(`CASH: P${Number(order.payment_amount).toFixed(2)}`)
  }
  if (Number(order?.change_amount || 0) > 0) {
    lines.push(`CHANGE: P${Number(order.change_amount).toFixed(2)}`)
  }

  lines.push(sep)
  lines.push('THANK YOU!')
  lines.push(receiptFooter)
  return lines.join('\n')
}

function usbDeviceName(device: USBDevice): string {
  return device.productName || device.manufacturerName || `USB Device ${device.vendorId.toString(16)}:${device.productId.toString(16)}`
}

export const printerApi = {
  printReceipt: async (order: any) => {
    try {
      const store = await getStoreSettings()
      // Use ESC/POS over USB if a thermal printer is connected
      if (_usbDevice) {
        const data = buildEscPosData(order, store)
        const ok = await sendEscPos(data)
        if (ok) return { success: true }
        // Fall through to browser print if USB failed
      }
      const html = buildReceiptHtml(order, store)
      return printHtml(html)
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  shareReceipt: async (order: any) => {
    try {
      if (!navigator.share) return { success: false, error: 'Share not supported on this browser.' }
      const store = await getStoreSettings()
      const text = buildReceiptText(order, store)
      await navigator.share({ title: `Receipt ${order?.order_number || ''}`, text })
      return { success: true }
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: true }
      return { success: false, error: err?.message }
    }
  },

  testPage: async () => {
    try {
      const store = await getStoreSettings()
      if (_usbDevice) {
        const data = buildEscPosData({ test: true }, store)
        const ok = await sendEscPos(data)
        if (ok) return { success: true }
      }
      const html = buildReceiptHtml({ test: true }, store)
      return printHtml(html)
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getStatus: async () => {
    if (_usbDevice) {
      return {
        connected: true,
        type: 'usb-escpos',
        device: usbDeviceName(_usbDevice),
        error: '',
      }
    }
    return {
      connected: true,
      type: 'browser',
      device: 'System Printer (browser dialog)',
      error: '',
    }
  },

  setConfig: async (config: any) => {
    if (config.paperSize) await settingsApi.set('paper_size', config.paperSize)
    if (typeof config.enabled === 'boolean') await settingsApi.set('thermal_enabled', String(config.enabled))
    return { success: true }
  },

  openDrawer: async () => ({ success: false, error: 'Cash drawer not supported in browser.' }),

  listPrinters: async () => {
    if (_usbDevice) {
      return [{ name: usbDeviceName(_usbDevice), value: 'usb', isDefault: true }]
    }
    return []
  },

  // Connect a USB thermal printer — must be called from a user gesture (button click)
  connectUsb: async () => {
    if (!WEB_USB_SUPPORTED) {
      return { success: false, error: 'Web USB is not supported in this browser. Use Chrome or Edge.' }
    }
    try {
      const device = await navigator.usb.requestDevice({ filters: [] })
      const ok = await openUsbDevice(device)
      if (!ok) return { success: false, error: 'Could not open printer. Make sure no other app is using it.' }
      return { success: true, device: usbDeviceName(device) }
    } catch (err: any) {
      if (err?.name === 'NotFoundError') return { success: false, error: 'No device selected.' }
      return { success: false, error: err?.message || 'Failed to connect.' }
    }
  },

  // Release the USB device
  disconnectUsb: async () => {
    if (!_usbDevice) return { success: true }
    try {
      await _usbDevice.releaseInterface(_usbInterfaceNum)
      await _usbDevice.close()
    } catch { /* ignore */ }
    _usbDevice = null
    return { success: true }
  },

  // Re-connect to a previously authorized USB printer (no user gesture needed)
  autoConnectUsb: async () => {
    if (!WEB_USB_SUPPORTED || _usbDevice) return { connected: !!_usbDevice }
    try {
      const devices = await navigator.usb.getDevices()
      for (const device of devices) {
        const ok = await openUsbDevice(device)
        if (ok) return { connected: true, device: usbDeviceName(device) }
      }
    } catch { /* ignore */ }
    return { connected: false }
  },

  usbSupported: () => WEB_USB_SUPPORTED,
}
