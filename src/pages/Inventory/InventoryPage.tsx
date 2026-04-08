import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { InventoryItem } from '../../types'
import { CheckCircle, AlertTriangle, AlertCircle, XCircle, Plus } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'

const FILTERS = ['Fast Moving', 'Low Stock', 'Out of Stock', 'Critical', 'All']

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filter, setFilter] = useState('Fast Moving')
  const [search, setSearch] = useState('')
  const [addingStock, setAddingStock] = useState<string | null>(null)
  const [stockQty, setStockQty] = useState('')
  const [counts, setCounts] = useState({ total: 0, safe: 0, low: 0, critical: 0 })

  const load = async () => {
    const data: InventoryItem[] = await window.api.inventory.getAll(filter)
    const filtered = search
      ? data.filter(i => i.product_name.toLowerCase().includes(search.toLowerCase()))
      : data
    setItems(filtered)
    const all: InventoryItem[] = await window.api.inventory.getAll()
    setCounts({
      total: all.length,
      safe: all.filter(i => i.status === 'safe').length,
      low: all.filter(i => i.status === 'low').length,
      critical: all.filter(i => ['critical','out'].includes(i.status)).length,
    })
  }

  useEffect(() => { load() }, [filter, search])

  const handleAddStock = async (productId: string) => {
    const qty = parseFloat(stockQty)
    if (!qty) return
    await window.api.inventory.addStock(productId, qty)
    setAddingStock(null)
    setStockQty('')
    load()
  }

  const statusIcon = (s: string) => ({
    safe:     <CheckCircle size={14} className="text-green-500" />,
    low:      <AlertTriangle size={14} className="text-yellow-500" />,
    critical: <AlertCircle size={14} className="text-red-500" />,
    out:      <XCircle size={14} className="text-red-500" />,
  }[s] || null)

  const statusLabel = (s: string, qty: number) => {
    if (s === 'out') return { text: 'Out of Stock', class: 'bg-red-100 text-red-600' }
    if (s === 'critical') return { text: 'Critical', class: 'bg-red-100 text-red-600' }
    if (s === 'low') return { text: 'Low Stock (~2d left)', class: 'bg-yellow-100 text-yellow-700' }
    return { text: 'Safe', class: 'bg-green-100 text-green-600' }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Inventory Management" back="/" />

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3 p-4">
        {[
          { label: 'Total', value: counts.total, icon: '📦', color: 'bg-gray-700' },
          { label: 'Safe', value: counts.safe, icon: '✓', color: 'bg-green-500' },
          { label: 'Low', value: counts.low, icon: '!', color: 'bg-yellow-400' },
          { label: 'Critical', value: counts.critical, icon: '⚠', color: 'bg-red-500' },
        ].map(c => (
          <div key={c.label} className={`${c.color} text-white rounded-xl p-3 flex items-center gap-3`}>
            <span className="text-2xl">{c.icon}</span>
            <div>
              <p className="text-xs opacity-80">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="px-4 pb-3 flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search products or scan barcode..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
          {FILTERS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {items.map(item => {
          const sl = statusLabel(item.status, item.quantity)
          return (
            <div key={item.id} className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {item.product_image && <img src={getProductImageSrc(item.product_image)} alt={item.product_name || ''} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-800">{item.product_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.class}`}>{sl.text}</span>
                </div>
                <div className="flex gap-6 mt-1">
                  <div>
                    <p className="text-xs text-gray-400">Total Stock</p>
                    <p className={`font-bold text-lg ${item.quantity <= 0 ? 'text-red-500' : 'text-gray-800'}`}>{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Monthly Sold</p>
                    <p className="font-bold text-lg text-green-600">{item.monthly_sold}</p>
                  </div>
                </div>
              </div>

              {addingStock === item.product_id ? (
                <div className="flex items-center gap-2">
                  <input value={stockQty} onChange={e => setStockQty(e.target.value)}
                    type="number" placeholder="Qty" autoFocus
                    className="w-20 border-2 border-[#1a8eff] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleAddStock(item.product_id)} />
                  <button onClick={() => handleAddStock(item.product_id)}
                    className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium">Add</button>
                  <button onClick={() => { setAddingStock(null); setStockQty('') }}
                    className="text-gray-400 hover:text-gray-600 px-2">✕</button>
                </div>
              ) : (
                <button onClick={() => { setAddingStock(item.product_id); setStockQty('') }}
                  className="w-10 h-10 bg-[#1a8eff] text-white rounded-full flex items-center justify-center hover:bg-[#0077e6] shrink-0">
                  <Plus size={20} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
