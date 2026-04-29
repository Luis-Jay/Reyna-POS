import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Printer, FileSpreadsheet } from 'lucide-react'
import { exportToExcel } from '../../utils/export'

interface ReportRow {
  barcode: string | null
  product_name: string
  category_name: string | null
  quantity: number
  base_cost: number
  retail_price: number
  wholesale_price: number
  description: string | null
}

interface Settings {
  store_name?: string
  store_address?: string
  store_phone?: string
  store_logo_data?: string
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
      ? `<img src="${settings.store_logo_data}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;" />`
      : ''

    const tableRows = rows.map(r => `
      <tr>
        <td>${r.barcode ?? '—'}</td>
        <td>${r.product_name}</td>
        <td>${r.category_name ?? '—'}</td>
        <td style="text-align:right">${r.quantity}</td>
        <td style="text-align:right">₱${r.base_cost.toFixed(2)}</td>
        <td style="text-align:right">₱${r.retail_price.toFixed(2)}</td>
        <td style="text-align:right">₱${r.wholesale_price.toFixed(2)}</td>
      </tr>
    `).join('')

    const html = `
      <div style="text-align:center;margin-bottom:16px;">
        ${logoHtml}
        <h2 style="margin:8px 0 2px;font-size:16px;color:#111;">${settings.store_name ?? 'Store'}</h2>
        ${settings.store_address ? `<p style="margin:0;font-size:11px;color:#555;">${settings.store_address}</p>` : ''}
        ${settings.store_phone ? `<p style="margin:0;font-size:11px;color:#555;">${settings.store_phone}</p>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:11px;color:#555;">Printed at: ${printedAt}</span>
        <strong style="font-size:13px;">TOTAL INVENTORY REPORT</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Product Code</th>
            <th>Description</th>
            <th>Category</th>
            <th style="text-align:right">Total Qty</th>
            <th style="text-align:right">Cost (₱)</th>
            <th style="text-align:right">Retail Price (₱)</th>
            <th style="text-align:right">Wholesale (₱)</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="font-size:10px;color:#888;margin-top:8px;">Total products: ${rows.length}</p>
      <table style="width:auto;margin-top:12px;">
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:11px;color:#555;">Total Items in Stock</td>
          <td style="padding:6px 0;font-size:11px;font-weight:bold;">${rows.reduce((s, r) => s + r.quantity, 0).toLocaleString('en-PH')}</td>
        </tr>
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:11px;color:#555;">Total Value at Cost</td>
          <td style="padding:6px 0;font-size:11px;font-weight:bold;">₱${rows.reduce((s, r) => s + r.quantity * r.base_cost, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:11px;color:#555;">Total Value at Retail</td>
          <td style="padding:6px 0;font-size:11px;font-weight:bold;">₱${rows.reduce((s, r) => s + r.quantity * r.retail_price, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
    `

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <title>Total Inventory Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #1a1a1a; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
        tr:nth-child(even) td { background: #f9fafb; }
        @media print { body { padding: 0; } }
      </style>
      </head><body>${html}</body></html>
    `)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleExcel = () => {
    exportToExcel([{
      name: 'Inventory Report',
      rows: rows.map(r => ({
        'Product Code': r.barcode ?? '',
        'Description':  r.product_name,
        'Category':     r.category_name ?? '',
        'Total Qty':    r.quantity,
        'Cost (₱)':     r.base_cost,
        'Retail Price (₱)': r.retail_price,
        'Wholesale (₱)': r.wholesale_price,
      })),
    }], `Inventory_Report_${new Date().toISOString().slice(0, 10)}`)
  }

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

        {/* Report header */}
        <div className="max-w-6xl mx-auto px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="mb-4 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
              {settings.store_logo_data && (
                <img src={settings.store_logo_data} className="w-16 h-16 object-cover rounded" />
              )}
              <div className="flex-1">
                <p className="text-base font-bold text-[#1a8eff] tracking-wide">{settings.store_name ?? 'Store'}</p>
                {settings.store_address && <p className="text-xs text-gray-500">{settings.store_address}</p>}
                {settings.store_phone && <p className="text-xs text-gray-500">{settings.store_phone}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold bg-gray-800 text-white px-3 py-1 rounded">TOTAL INVENTORY REPORT</p>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="text-left px-3 py-2 font-medium">Product Code</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-right px-3 py-2 font-medium">Total Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Cost (₱)</th>
                      <th className="text-right px-3 py-2 font-medium">Retail Price (₱)</th>
                      <th className="text-right px-3 py-2 font-medium">Wholesale (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5 text-gray-500 font-mono">{r.barcode ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-800 font-medium">{r.product_name}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.category_name ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-800 text-right font-medium">{r.quantity}</td>
                        <td className="px-3 py-1.5 text-gray-600 text-right">{r.base_cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-gray-800 text-right">{r.retail_price.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-gray-600 text-right">{r.wholesale_price.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">No inventory data found.</p>
                )}

                {/* Totals summary */}
                {rows.length > 0 && (() => {
                  const totalCostValue    = rows.reduce((s, r) => s + r.quantity * r.base_cost, 0)
                  const totalRetailValue  = rows.reduce((s, r) => s + r.quantity * r.retail_price, 0)
                  const totalQty          = rows.reduce((s, r) => s + r.quantity, 0)
                  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  return (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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
                  )
                })()}

                <p className="text-xs text-gray-400 mt-3">Total products: {rows.length}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
