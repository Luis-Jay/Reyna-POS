import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Printer, FileSpreadsheet } from 'lucide-react'
import { exportToExcel } from '../../utils/export'

interface Batch {
  qty: number
  note: string | null
  date: string | null
}

interface ReportRow {
  barcode: string | null
  product_id: string
  product_name: string
  category_name: string | null
  quantity: number
  low_threshold: number
  base_cost: number
  retail_price: number
  wholesale_price: number
  description: string | null
  monthly_sold: number
  status: string
  stock_value: number
  potential_revenue: number
  batches: Batch[]
}

interface Settings {
  store_name?: string
  store_address?: string
  store_phone?: string
  store_logo_data?: string
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-PH', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

export default function InventoryReportPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ReportRow[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      (window.api.inventory as any).getReport(),
      window.api.settings.getAll(),
    ]).then(([data, s]) => {
      setRows(data)
      setSettings(s)
      setLoading(false)
    })
  }, [])

  const printedAt = new Date().toLocaleString('en-PH', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const handlePrint = () => {
    const logoHtml = settings.store_logo_data
      ? `<img src="${settings.store_logo_data}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />`
      : ''

    const tableRows = rows.map((r, i) => {
      const costValue = r.quantity * r.base_cost
      const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
      const batchDetail = r.batches.map((b, bi) => {
        const parts = [`${b.qty} pcs`]
        if (r.base_cost > 0) parts.push(`Cost ₱${r.base_cost.toFixed(2)}`)
        if (r.retail_price > 0) parts.push(`Retail ₱${r.retail_price.toFixed(2)}`)
        if (r.wholesale_price > 0) parts.push(`Wholesale ₱${r.wholesale_price.toFixed(2)}`)
        parts.push(`Received ${b.date ? fmtDate(b.date) : '—'}`)
        if (b.note) parts.push(b.note)
        return `<div style="margin-bottom:${bi < r.batches.length - 1 ? '4px' : '0'}">${parts.join(' • ')}</div>`
      }).join('')

      return `
        <tr style="background:${rowBg}">
          <td style="padding:5px 8px;font-family:monospace;color:#555;">${r.barcode ?? '—'}</td>
          <td style="padding:5px 8px;font-weight:600;color:#111;">${r.product_name}</td>
          <td style="padding:5px 8px;color:#555;">${r.category_name ?? '—'}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:600;color:#111;">${r.quantity}</td>
          <td style="padding:5px 8px;text-align:right;color:#555;">₱${r.base_cost.toFixed(2)}</td>
          <td style="padding:5px 8px;text-align:right;color:#111;">₱${r.retail_price.toFixed(2)}</td>
          <td style="padding:5px 8px;text-align:right;color:#555;">₱${r.wholesale_price.toFixed(2)}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:600;color:#1d4ed8;">₱${costValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="padding:5px 8px;color:#6b7280;font-size:9px;">${batchDetail || '—'}</td>
        </tr>`
    }).join('')

    const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
    const totalCostValue = rows.reduce((s, r) => s + r.quantity * r.base_cost, 0)
    const totalRetailValue = rows.reduce((s, r) => s + r.quantity * r.retail_price, 0)
    const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const html = `
      <div style="text-align:center;margin-bottom:20px;">
        ${logoHtml}
        <div style="font-size:20px;font-weight:700;color:#111;letter-spacing:0.02em;">${settings.store_name ?? 'Store'}</div>
        ${settings.store_address ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${settings.store_address}</div>` : ''}
        ${settings.store_phone ? `<div style="font-size:10px;color:#6b7280;">${settings.store_phone}</div>` : ''}
        <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-top:6px;letter-spacing:0.04em;">Inventory Report</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px;">Printed at ${printedAt}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th style="text-align:left;padding:7px 8px;font-weight:600;">Product Code</th>
            <th style="text-align:left;padding:7px 8px;font-weight:600;">Description</th>
            <th style="text-align:left;padding:7px 8px;font-weight:600;">Category</th>
            <th style="text-align:right;padding:7px 8px;font-weight:600;">Qty</th>
            <th style="text-align:right;padding:7px 8px;font-weight:600;">Cost (₱)</th>
            <th style="text-align:right;padding:7px 8px;font-weight:600;">Retail (₱)</th>
            <th style="text-align:right;padding:7px 8px;font-weight:600;">Wholesale (₱)</th>
            <th style="text-align:right;padding:7px 8px;font-weight:600;">Batch Cost Value (₱)</th>
          <th style="text-align:left;padding:7px 8px;font-weight:600;">Batch Details</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <table style="width:auto;margin-top:8px;font-size:10px;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 24px 4px 0;color:#6b7280;">Total Products</td>
          <td style="padding:4px 0;font-weight:700;">${rows.length}</td>
        </tr>
        <tr>
          <td style="padding:4px 24px 4px 0;color:#6b7280;">Total Items in Stock</td>
          <td style="padding:4px 0;font-weight:700;">${totalQty.toLocaleString('en-PH')}</td>
        </tr>
        <tr>
          <td style="padding:4px 24px 4px 0;color:#6b7280;">Total Value at Cost</td>
          <td style="padding:4px 0;font-weight:700;color:#1d4ed8;">${fmt(totalCostValue)}</td>
        </tr>
        <tr>
          <td style="padding:4px 24px 4px 0;color:#6b7280;">Total Value at Retail</td>
          <td style="padding:4px 0;font-weight:700;color:#059669;">${fmt(totalRetailValue)}</td>
        </tr>
      </table>
    `

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <title>Inventory Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 28px 32px; }
        @media print { body { padding: 0; } }
      </style>
      </head><body>${html}</body></html>
    `)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleExcel = () => {
    const excelRows: Record<string, string | number>[] = []
    for (const r of rows) {
      excelRows.push({
        'Product Code': r.barcode ?? '',
        'Description': r.product_name,
        'Category': r.category_name ?? '',
        'Total Qty': r.quantity,
        'Cost (₱)': r.base_cost,
        'Retail Price (₱)': r.retail_price,
        'Wholesale (₱)': r.wholesale_price,
        'Cost Value (₱)': r.quantity * r.base_cost,
      })
      r.batches.forEach((b, bi) => {
        const parts: string[] = [`${b.qty} pcs`]
        if (b.date) parts.push(`Rcvd ${fmtDate(b.date)}`)
        if (b.note) parts.push(b.note)
        excelRows.push({
          'Product Code': '',
          'Description': `  ↳ Batch ${bi + 1}: ${parts.join(' • ')}`,
          'Category': '',
          'Total Qty': b.qty,
          'Cost (₱)': '',
          'Retail Price (₱)': '',
          'Wholesale (₱)': '',
          'Cost Value (₱)': '',
        } as any)
      })
    }

    exportToExcel([{
      name: 'Inventory Report',
      rows: excelRows,
    }], `Inventory_Report_${new Date().toISOString().slice(0, 10)}`)
  }

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
  const totalCostValue = rows.reduce((s, r) => s + r.quantity * r.base_cost, 0)
  const totalRetailValue = rows.reduce((s, r) => s + r.quantity * r.retail_price, 0)
  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Inventory Report" back="/inventory" />

      <div className="flex-1 overflow-y-auto">
        {/* Actions */}
        <div className="max-w-6xl mx-auto px-3 pt-3 sm:px-4 sm:pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">Printed at: {printedAt}</p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              onClick={handleExcel}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              <Printer size={14} /> Print
            </button>
          </div>
        </div>

        {/* Report */}
        <div className="max-w-6xl mx-auto px-3 pt-3 pb-6 sm:px-4 sm:pt-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">

            {/* Header */}
            <div className="mb-5 flex flex-col items-center text-center">
              {settings.store_logo_data && (
                <img src={settings.store_logo_data} className="w-16 h-16 object-cover rounded mb-2" />
              )}
              <p className="text-xl font-bold text-gray-900 leading-tight">{settings.store_name ?? 'Store'}</p>
              {settings.store_address && <p className="text-xs text-gray-500">{settings.store_address}</p>}
              {settings.store_phone && <p className="text-xs text-gray-500">{settings.store_phone}</p>}
              <p className="text-sm font-bold text-blue-600 mt-1.5 tracking-wide">Inventory Report</p>
              <p className="text-xs text-gray-400 mt-0.5">Printed at {printedAt}</p>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left px-3 py-2.5 font-semibold">Product Code</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Description</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Category</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Total Qty</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Cost (₱)</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Retail Price (₱)</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Wholesale (₱)</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Batch Cost Value (₱)</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Batch Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.product_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-gray-500 font-mono align-top">{r.barcode ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-800 font-semibold align-top">{r.product_name}</td>
                          <td className="px-3 py-2 text-gray-500 align-top">{r.category_name ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800 align-top">{r.quantity}</td>
                          <td className="px-3 py-2 text-right text-gray-500 align-top">{r.base_cost.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-700 align-top">{r.retail_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-500 align-top">{r.wholesale_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700 align-top">
                            {fmt(r.quantity * r.base_cost)}
                          </td>
                          <td className="px-3 py-2 text-gray-500 align-top">
                            {r.batches.length === 0 ? <span className="text-gray-300">—</span> : (
                              <div className="flex flex-col gap-0.5">
                                {r.batches.map((b, bi) => {
                                  const parts: string[] = [`${b.qty} pcs`]
                                  if (r.base_cost > 0) parts.push(`Cost ₱${r.base_cost.toFixed(2)}`)
                                  if (r.retail_price > 0) parts.push(`Retail ₱${r.retail_price.toFixed(2)}`)
                                  if (r.wholesale_price > 0) parts.push(`Wholesale ₱${r.wholesale_price.toFixed(2)}`)
                                  parts.push(`Received ${b.date ? fmtDate(b.date) : '—'}`)
                                  if (b.note) parts.push(b.note)
                                  return (
                                    <span key={bi} className="text-[10px] text-gray-500 leading-relaxed">
                                      {parts.join(' • ')}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length === 0 && (
                    <p className="text-center text-gray-400 py-8 text-sm">No inventory data found.</p>
                  )}
                </div>

                {rows.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-400 mb-0.5">Total Products</p>
                      <p className="text-lg font-bold text-gray-800">{rows.length}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      <p className="text-xs text-gray-400 mb-0.5">Total Items in Stock</p>
                      <p className="text-lg font-bold text-gray-800">{totalQty.toLocaleString('en-PH')}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                      <p className="text-xs text-blue-500 mb-0.5">Total Value at Cost</p>
                      <p className="text-lg font-bold text-blue-700">{fmt(totalCostValue)}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                      <p className="text-xs text-emerald-500 mb-0.5">Total Value at Retail</p>
                      <p className="text-lg font-bold text-emerald-700">{fmt(totalRetailValue)}</p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-3">Total products: {rows.length}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
