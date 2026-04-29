import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import TopBar from '../../components/layout/TopBar'
import { Download, Upload, CheckCircle, AlertCircle, X, FileText } from 'lucide-react'

const TEMPLATE_HEADERS = [
  'name', 'price', 'wholesale_price', 'cost', 'barcode', 'category', 'stock',
  'description', 'allow_fractions', 'track_inventory', 'variation_group',
  'tier1_min_qty', 'tier1_price', 'tier1_label',
  'tier2_min_qty', 'tier2_price', 'tier2_label',
  'tier3_min_qty', 'tier3_price', 'tier3_label',
]

const TEMPLATE_EXAMPLE = [
  ['Coca-Cola 1L',    '35', '30', '22', '4902102132060', 'Beverages', '100', '',            'no',  'yes', '',        '',  '',   '',           '',   '',   '',           '',   '',   ''],
  ['Lays Original',  '30', '25', '18', '',               'Snacks',    '50',  '',            'no',  'yes', '',        '5', '28', 'Bulk',       '10', '25', 'Wholesale',  '',   '',   ''],
  ['White Rice 1kg', '55', '45', '40', '',               'Grocery',   '200', 'Sold per kg', 'yes', 'yes', '',        '',  '',   '',           '',   '',   '',           '',   '',   ''],
  ['T-Shirt',        '250','200','150','',               'Apparel',   '0',   '',            'no',  'yes', 'Size',    '5', '230','Bulk',       '',   '',   '',           '',   '',   ''],
]

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]
  const csv = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'products_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parseFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as any[]),
        error: reject,
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          resolve(rows as any[])
        } catch (err) {
          reject(err)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reject(new Error('Unsupported file type. Use .csv or .xlsx'))
    }
  })
}

function tierSummary(row: any): string {
  const parts: string[] = []
  for (let t = 1; t <= 3; t++) {
    const qty = row[`tier${t}_min_qty`]
    const price = row[`tier${t}_price`]
    if (qty !== '' && qty !== null && qty !== undefined && price !== '' && price !== null && price !== undefined) {
      const label = row[`tier${t}_label`] ? ` (${row[`tier${t}_label`]})` : ''
      parts.push(`${qty}+→₱${price}${label}`)
    }
  }
  return parts.length ? parts.join(', ') : '—'
}

type ImportResult = { success: boolean; created?: number; skipped?: number; errors?: string[]; error?: string }

export default function ImportProductsPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleFile = async (file: File) => {
    setParseError('')
    setResult(null)
    setRows([])
    setFileName(file.name)
    try {
      const parsed = await parseFile(file)
      setRows(parsed)
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    try {
      const res = await window.api.products.importBatch(rows)
      setResult(res)
      if (res.success) {
        setRows([])
        setFileName('')
      }
    } finally {
      setImporting(false)
    }
  }

  const clearFile = () => {
    setRows([])
    setFileName('')
    setParseError('')
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const get = (row: any, key: string, fallback: any = '—') => {
    const v = row[key]
    return (v !== null && v !== undefined && v !== '') ? v : fallback
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Import Products" back="/products" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">

        {/* Step 1 — Download template */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Step 1</p>
          <p className="text-sm font-medium text-gray-700 mb-3">Download the template and fill it in</p>
          <div className="text-xs text-gray-500 mb-3 space-y-1.5">
            <p><span className="font-semibold text-gray-600">Required:</span> <span className="font-mono bg-gray-100 px-1 rounded">name</span> · <span className="font-mono bg-gray-100 px-1 rounded">price</span></p>
            <p><span className="font-semibold text-gray-600">Pricing:</span> <span className="font-mono bg-gray-100 px-1 rounded">wholesale_price</span> · <span className="font-mono bg-gray-100 px-1 rounded">cost</span></p>
            <p><span className="font-semibold text-gray-600">Basic:</span> <span className="font-mono bg-gray-100 px-1 rounded">barcode</span> · <span className="font-mono bg-gray-100 px-1 rounded">category</span> · <span className="font-mono bg-gray-100 px-1 rounded">stock</span> · <span className="font-mono bg-gray-100 px-1 rounded">description</span></p>
            <p><span className="font-semibold text-gray-600">Options:</span> <span className="font-mono bg-gray-100 px-1 rounded">allow_fractions</span> (yes/no) · <span className="font-mono bg-gray-100 px-1 rounded">track_inventory</span> (yes/no) · <span className="font-mono bg-gray-100 px-1 rounded">variation_group</span></p>
            <p><span className="font-semibold text-gray-600">Price Tiers:</span> <span className="font-mono bg-gray-100 px-1 rounded">tier1_min_qty</span> · <span className="font-mono bg-gray-100 px-1 rounded">tier1_price</span> · <span className="font-mono bg-gray-100 px-1 rounded">tier1_label</span> (up to 3 tiers)</p>
            <p className="text-gray-400">New categories and variation groups are created automatically.</p>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a8eff] text-white text-sm font-medium rounded-lg hover:bg-blue-600"
          >
            <Download size={15} /> Download Template (.csv)
          </button>
        </div>

        {/* Step 2 — Upload */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Step 2</p>
          <p className="text-sm font-medium text-gray-700 mb-3">Upload your filled file (.csv or .xlsx)</p>

          {!fileName ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1a8eff] hover:bg-blue-50 transition"
            >
              <Upload size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Click to select or drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">.csv or .xlsx</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <FileText size={20} className="text-[#1a8eff] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{fileName}</p>
                <p className="text-xs text-gray-400">{rows.length} row{rows.length !== 1 ? 's' : ''} found</p>
              </div>
              <button onClick={clearFile} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />

          {parseError && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} /> {parseError}
            </p>
          )}
        </div>

        {/* Preview table */}
        {rows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Preview — {rows.length} product{rows.length !== 1 ? 's' : ''} to import
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Name</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Price</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Wholesale</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Cost</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Category</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Stock</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Weight?</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Variation</th>
                    <th className="text-left text-gray-400 font-medium py-1.5 pr-3">Price Tiers</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-3 text-gray-800 font-medium">
                        {get(row, 'name', <span className="text-red-400">—</span>)}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-600">
                        {get(row, 'price', '') !== '—' ? `₱${get(row, 'price')}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-500">
                        {get(row, 'wholesale_price', '') !== '—' ? `₱${get(row, 'wholesale_price')}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-500">
                        {get(row, 'cost', '') !== '—' ? `₱${get(row, 'cost')}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-600">{get(row, 'category')}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{get(row, 'stock', 0)}</td>
                      <td className="py-1.5 pr-3 text-gray-500">
                        {['yes', '1', 'true'].includes(String(get(row, 'allow_fractions', 'no')).toLowerCase())
                          ? <span className="text-emerald-600 font-medium">Yes</span>
                          : 'No'}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-600">{get(row, 'variation_group')}</td>
                      <td className="py-1.5 pr-3 text-gray-400 font-mono">{tierSummary(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className="text-xs text-gray-400 mt-2">…and {rows.length - 20} more rows</p>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-xl border p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {result.success ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={16} className="text-green-600" />
                  <p className="text-sm font-semibold text-green-800">
                    Import complete — {result.created} product{result.created !== 1 ? 's' : ''} added
                    {(result.skipped ?? 0) > 0 && `, ${result.skipped} skipped`}
                  </p>
                </div>
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                        <AlertCircle size={11} className="mt-0.5 shrink-0" /> {e}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => navigate('/products')}
                  className="mt-3 px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                >
                  View Products
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500" />
                <p className="text-sm text-red-700">{result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Import button */}
        {rows.length > 0 && !result?.success && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full py-3 bg-[#1a8eff] text-white font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Upload size={16} />
            {importing ? 'Importing...' : `Import ${rows.length} Product${rows.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}
