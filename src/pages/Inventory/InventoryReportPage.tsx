import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Printer, FileSpreadsheet, FileDown } from 'lucide-react'
import { exportToExcel, exportToPdf } from '../../utils/export'

interface ReportRow {
  barcode: string | null
  product_id: string
  product_name: string
  category_name: string | null
  quantity: number
  base_cost: number
  retail_price: number
  wholesale_price: number
  description: string | null
  price_tiers?: Array<{
    id: string
    quantity: number
    unit_cost: number
    retail_price: number
    wholesale_price: number
    received_at: string
    note?: string | null
  }>
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

  const formatMoney = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatBatchDate = (value?: string | null) => {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-PH')
  }

  const getBatchEntries = (row: ReportRow) => {
    if (!row.price_tiers?.length) {
      return [{
        id: `fallback-${row.product_id}`,
        quantity: row.quantity,
        unit_cost: row.base_cost,
        retail_price: row.retail_price,
        wholesale_price: row.wholesale_price,
        received_at: '',
        note: null,
      }]
    }
    // If tracked batch qty < actual inventory qty, add the untracked remainder
    const batchTotal = row.price_tiers.reduce((sum, t) => sum + t.quantity, 0)
    const untracked = Math.round((row.quantity - batchTotal) * 1000) / 1000
    if (untracked > 0.001) {
      return [
        ...row.price_tiers,
        {
          id: `untracked-${row.product_id}`,
          quantity: untracked,
          unit_cost: row.base_cost,
          retail_price: row.retail_price,
          wholesale_price: row.wholesale_price,
          received_at: '',
          note: 'Prior stock',
        },
      ]
    }
    return row.price_tiers
  }

  const getRowCostValue = (row: ReportRow) => getBatchEntries(row)
    .reduce((sum, tier) => sum + (tier.quantity * tier.unit_cost), 0)

  const getRowRetailValue = (row: ReportRow) => getBatchEntries(row)
    .reduce((sum, tier) => sum + (tier.quantity * tier.retail_price), 0)

  const batchSummary = (row: ReportRow) => {
    if (!row.price_tiers?.length) {
      return `1 batch • ${row.quantity} pcs • Cost ${formatMoney(row.base_cost)} • Retail ${formatMoney(row.retail_price)}`
    }
    return row.price_tiers
      .map(tier => `${tier.quantity} pcs • Cost ${formatMoney(tier.unit_cost)} • Retail ${formatMoney(tier.retail_price)} • ${formatBatchDate(tier.received_at)}`)
      .join(' | ')
  }

  const batchDetailsHtml = (row: ReportRow) => getBatchEntries(row)
    .map(tier => `${tier.quantity} pcs • Cost ${formatMoney(tier.unit_cost)} • Retail ${formatMoney(tier.retail_price)} • Wholesale ${formatMoney(tier.wholesale_price)} • Received ${formatBatchDate(tier.received_at)}`)
    .join('<br />')

  const batchDetailsText = (row: ReportRow) => getBatchEntries(row)
    .map(tier => `${tier.quantity} pcs | Cost ${formatMoney(tier.unit_cost)} | Retail ${formatMoney(tier.retail_price)} | Wholesale ${formatMoney(tier.wholesale_price)} | Received ${formatBatchDate(tier.received_at)}`)
    .join(' || ')

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0)
  const totalCostValue = rows.reduce((s, r) => s + getRowCostValue(r), 0)
  const totalRetailValue = rows.reduce((s, r) => s + getRowRetailValue(r), 0)

  const buildDocRows = (colCount: number, tdStyle: string, subTdStyle: string) =>
    rows.map(r => {
      const batches = getBatchEntries(r)
      const batchSubRows = batches.map((tier, i) => `
        <tr>
          <td colspan="${colCount}" style="${subTdStyle}">
            <span style="color:#94a3b8;margin-right:4px;">↳ Batch ${i + 1}:</span>
            ${tier.quantity} pcs &nbsp;•&nbsp; Cost ${formatMoney(tier.unit_cost)} &nbsp;•&nbsp; Retail ${formatMoney(tier.retail_price)} &nbsp;•&nbsp; Wholesale ${formatMoney(tier.wholesale_price)}${tier.received_at ? ` &nbsp;•&nbsp; Rcvd ${formatBatchDate(tier.received_at)}` : ''}${tier.note ? ` &nbsp;•&nbsp; <em>${tier.note}</em>` : ''}
          </td>
        </tr>`).join('')
      return `
        <tr>
          <td style="${tdStyle}">${r.barcode ?? '—'}</td>
          <td style="${tdStyle}">${r.product_name}</td>
          <td style="${tdStyle}">${r.category_name ?? '—'}</td>
          <td style="${tdStyle};text-align:right">${r.quantity}</td>
          <td style="${tdStyle};text-align:right">${formatMoney(r.base_cost)}</td>
          <td style="${tdStyle};text-align:right">${formatMoney(r.retail_price)}</td>
          <td style="${tdStyle};text-align:right">${formatMoney(r.wholesale_price)}</td>
          <td style="${tdStyle};text-align:right">${formatMoney(getRowCostValue(r))}</td>
        </tr>
        ${batchSubRows}`
    }).join('')

  const handlePrint = () => {
    const logoHtml = settings.store_logo_data
      ? `<img src="${settings.store_logo_data}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;" />`
      : ''

    const tableRows = buildDocRows(
      8,
      'padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;',
      'padding:3px 8px 3px 20px;border-bottom:1px solid #f5f5f5;font-size:10px;color:#64748b;background:#fafafa;'
    )

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
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1e293b;color:#fff;">
            <th style="padding:7px 8px;text-align:left;font-size:11px;">Product Code</th>
            <th style="padding:7px 8px;text-align:left;font-size:11px;">Description</th>
            <th style="padding:7px 8px;text-align:left;font-size:11px;">Category</th>
            <th style="padding:7px 8px;text-align:right;font-size:11px;">Total Qty</th>
            <th style="padding:7px 8px;text-align:right;font-size:11px;">Cost (₱)</th>
            <th style="padding:7px 8px;text-align:right;font-size:11px;">Retail (₱)</th>
            <th style="padding:7px 8px;text-align:right;font-size:11px;">Wholesale (₱)</th>
            <th style="padding:7px 8px;text-align:right;font-size:11px;">Cost Value (₱)</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="font-size:10px;color:#888;margin-top:8px;">Total products: ${rows.length}</p>
      <table style="width:auto;margin-top:12px;">
        <tr>
          <td style="padding:5px 20px 5px 0;font-size:11px;color:#555;">Total Items in Stock</td>
          <td style="padding:5px 0;font-size:11px;font-weight:bold;">${totalQty.toLocaleString('en-PH')}</td>
        </tr>
        <tr>
          <td style="padding:5px 20px 5px 0;font-size:12px;color:#1d4ed8;font-weight:600;">Total Value at Cost</td>
          <td style="padding:5px 0;font-size:13px;font-weight:700;color:#1d4ed8;">${formatMoney(totalCostValue)}</td>
        </tr>
        <tr>
          <td style="padding:5px 20px 5px 0;font-size:12px;color:#059669;font-weight:600;">Total Value at Retail</td>
          <td style="padding:5px 0;font-size:13px;font-weight:700;color:#059669;">${formatMoney(totalRetailValue)}</td>
        </tr>
      </table>
    `

    void window.api.documents.printHtml({
      title: 'Inventory Report',
      html: `<section style="padding:18mm 16mm;background:#fff;color:#111;">${html}</section>`,
    })
  }

  const handleExcel = () => {
    exportToExcel([
      {
        name: 'Inventory Report',
        rows: [
          ...rows.map(r => ({
            'Product Code': r.barcode ?? '',
            'Description':  r.product_name,
            'Category':     r.category_name ?? '',
            'Total Qty':    r.quantity,
            'Current Cost (₱)': r.base_cost,
            'Retail Price (₱)': r.retail_price,
            'Wholesale (₱)': r.wholesale_price,
            'Batch Cost Value (₱)': getRowCostValue(r),
            'Batch Retail Value (₱)': getRowRetailValue(r),
            'Batch Details': batchDetailsText(r),
          })),
          // blank separator
          { 'Product Code': '', 'Description': '', 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
          { 'Product Code': 'SUMMARY', 'Description': '', 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
          { 'Product Code': 'Total Products', 'Description': rows.length, 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
          { 'Product Code': 'Total Items in Stock', 'Description': totalQty, 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
          { 'Product Code': 'Total Value at Cost (₱)', 'Description': totalCostValue, 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
          { 'Product Code': 'Total Value at Retail (₱)', 'Description': totalRetailValue, 'Category': '', 'Total Qty': '', 'Current Cost (₱)': '', 'Retail Price (₱)': '', 'Wholesale (₱)': '', 'Batch Cost Value (₱)': '', 'Batch Retail Value (₱)': '', 'Batch Details': '' },
        ],
      },
      {
        name: 'Batch Details',
        rows: rows.flatMap(r =>
          getBatchEntries(r).map((tier, index) => ({
            'Product Code': r.barcode ?? '',
            'Description': r.product_name,
            'Category': r.category_name ?? '',
            'Batch #': index + 1,
            'Qty Remaining': tier.quantity,
            'Unit Cost (₱)': tier.unit_cost,
            'Retail Price (₱)': tier.retail_price,
            'Wholesale (₱)': tier.wholesale_price,
            'Batch Cost Value (₱)': tier.quantity * tier.unit_cost,
            'Batch Retail Value (₱)': tier.quantity * tier.retail_price,
            'Received Date': formatBatchDate(tier.received_at),
            'Note': tier.note ?? '',
          }))
        ),
      },
      {
        name: 'Summary',
        rows: [
          { 'Metric': 'Report Date', 'Value': printedAt },
          { 'Metric': 'Store', 'Value': settings.store_name ?? '' },
          { 'Metric': 'Total Products', 'Value': rows.length },
          { 'Metric': 'Total Items in Stock', 'Value': totalQty },
          { 'Metric': 'Total Value at Cost (₱)', 'Value': totalCostValue },
          { 'Metric': 'Total Value at Retail (₱)', 'Value': totalRetailValue },
        ],
      },
    ], `Inventory_Report_${new Date().toISOString().slice(0, 10)}`)
  }

  const handlePdf = async () => {
    const th = (label: string, align = 'left') =>
      `<th style="padding:8px 10px;border-bottom:2px solid #1e293b;text-align:${align};background:#1e293b;color:#fff;font-size:11px;white-space:nowrap;">${label}</th>`

    const tableRows = buildDocRows(
      8,
      'padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;vertical-align:top;',
      'padding:3px 10px 4px 24px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#64748b;background:#f8fafc;'
    )

    await exportToPdf(`Inventory Report ${new Date().toISOString().slice(0, 10)}`, `
      <section style="padding:16mm 14mm;background:#fff;color:#111;font-family:Arial,sans-serif;">
        <div style="text-align:center;margin-bottom:18px;">
          <h1 style="margin:0;font-size:22px;font-weight:800;">${settings.store_name ?? 'Store'}</h1>
          <p style="margin:6px 0 0;color:#475569;font-size:13px;font-weight:600;">Inventory Report</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">Printed at ${printedAt}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              ${th('Product Code')}
              ${th('Description')}
              ${th('Category')}
              ${th('Qty', 'right')}
              ${th('Cost (₱)', 'right')}
              ${th('Retail (₱)', 'right')}
              ${th('Wholesale (₱)', 'right')}
              ${th('Cost Value (₱)', 'right')}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="margin-top:20px;border-top:2px solid #e2e8f0;padding-top:14px;">
          <table style="width:auto;border-collapse:collapse;">
            <tr>
              <td style="padding:4px 28px 4px 0;font-size:11px;color:#64748b;">Total Products</td>
              <td style="padding:4px 0;font-size:11px;font-weight:600;">${rows.length}</td>
            </tr>
            <tr>
              <td style="padding:4px 28px 4px 0;font-size:11px;color:#64748b;">Total Items in Stock</td>
              <td style="padding:4px 0;font-size:11px;font-weight:600;">${totalQty.toLocaleString('en-PH')}</td>
            </tr>
            <tr>
              <td style="padding:6px 28px 4px 0;font-size:13px;color:#1d4ed8;font-weight:700;">Total Value at Cost</td>
              <td style="padding:6px 0 4px;font-size:15px;font-weight:800;color:#1d4ed8;">${formatMoney(totalCostValue)}</td>
            </tr>
            <tr>
              <td style="padding:4px 28px 4px 0;font-size:13px;color:#059669;font-weight:700;">Total Value at Retail</td>
              <td style="padding:4px 0;font-size:15px;font-weight:800;color:#059669;">${formatMoney(totalRetailValue)}</td>
            </tr>
          </table>
        </div>
      </section>
    `)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Inventory Report" back="/inventory" />

      <div className="flex-1 overflow-y-auto">
        {/* Actions */}
        <div className="max-w-6xl mx-auto px-4 pt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">Printed at: {printedAt}</p>
          <div className="flex gap-2">
            <button
              onClick={handleExcel}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button
              onClick={() => { void handlePdf() }}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50"
            >
              <FileDown size={14} /> Export PDF
            </button>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              <Printer size={14} /> Print
            </button>
          </div>
        </div>

        {/* Report header */}
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-4 mb-4">
              {settings.store_logo_data && (
                <img src={settings.store_logo_data} className="w-16 h-16 object-cover rounded" />
              )}
              <div className="flex-1 text-center">
                <p className="text-base font-bold text-[#1a8eff] tracking-wide">{settings.store_name ?? 'Store'}</p>
                {settings.store_address && <p className="text-xs text-gray-500">{settings.store_address}</p>}
                {settings.store_phone && <p className="text-xs text-gray-500">{settings.store_phone}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs font-bold bg-gray-800 text-white px-3 py-1 rounded">TOTAL INVENTORY REPORT</p>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="text-left px-3 py-2 font-medium">Product Code</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-right px-3 py-2 font-medium">Total Qty</th>
                      <th className="text-right px-3 py-2 font-medium">Cost (₱)</th>
                      <th className="text-right px-3 py-2 font-medium">Retail Price (₱)</th>
                      <th className="text-right px-3 py-2 font-medium">Wholesale (₱)</th>
                      <th className="text-right px-3 py-2 font-medium">Batch Cost Value (₱)</th>
                      <th className="text-left px-3 py-2 font-medium">Batch Details</th>
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
                        <td className="px-3 py-1.5 text-right text-gray-700">{getRowCostValue(r).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-[11px] text-gray-500">
                          <div className="space-y-1.5">
                            {getBatchEntries(r).map(tier => (
                              <div key={tier.id} className="rounded-md bg-gray-50 px-2 py-1">
                                <span className="font-medium text-gray-700">{tier.quantity} pcs</span>{' '}
                                <span>• Cost {formatMoney(tier.unit_cost)}</span>{' '}
                                <span>• Retail {formatMoney(tier.retail_price)}</span>{' '}
                                <span>• Wholesale {formatMoney(tier.wholesale_price)}</span>{' '}
                                <span>• Received {formatBatchDate(tier.received_at)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">No inventory data found.</p>
                )}

                {/* Totals summary */}
                {rows.length > 0 && (() => {
                  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  return (
                    <div className="mt-4 grid grid-cols-3 gap-3">
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
