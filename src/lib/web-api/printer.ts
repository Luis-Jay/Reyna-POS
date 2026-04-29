import { settingsApi } from './settings'

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
      const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=900')
      if (!printWindow) {
        return { success: false, error: 'Unable to open the receipt print window.' }
      }

      printWindow.document.open()
      printWindow.document.write(buildPopupPrintHtml(html))
      printWindow.document.close()
      return { success: true }
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

export const printerApi = {
  printReceipt: async (order: any) => {
    try {
      const store = await getStoreSettings()
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
      if (err?.name === 'AbortError') return { success: true } // user cancelled
      return { success: false, error: err?.message }
    }
  },

  testPage: async () => {
    try {
      const store = await getStoreSettings()
      const html = buildReceiptHtml({ test: true }, store)
      return printHtml(html)
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getStatus: async () => ({
    connected: true,
    type: 'browser',
    device: 'System Printer',
    error: '',
  }),

  setConfig: async (config: any) => {
    if (config.paperSize) await settingsApi.set('paper_size', config.paperSize)
    if (typeof config.enabled === 'boolean') await settingsApi.set('thermal_enabled', String(config.enabled))
    return { success: true }
  },

  openDrawer: async () => ({ success: false, error: 'Cash drawer not supported in browser.' }),

  listPrinters: async () => [],
}
