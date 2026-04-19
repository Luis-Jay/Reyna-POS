import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { InventoryItem } from '../../types'
import { Plus, FileText } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'

const FILTERS = ['Fast Moving', 'Low Stock', 'Out of Stock', 'Critical', 'All']

type EditMode = 'add' | 'set'

export default function InventoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filter, setFilter] = useState('Fast Moving')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<EditMode>('add')
  const [stockQty, setStockQty] = useState('')
  const [counts, setCounts] = useState({ total: 0, safe: 0, low: 0, critical: 0 })

  const load = async () => {
    // When searching, fetch ALL items then filter client-side so search isn't
    // limited to the currently selected category filter
    const [data, all]: [InventoryItem[], InventoryItem[]] = await Promise.all([
      window.api.inventory.getAll(search ? undefined : filter),
      window.api.inventory.getAll(),
    ])
    const filtered = search
      ? all.filter(i => i.product_name.toLowerCase().includes(search.toLowerCase()))
      : data
    setItems(filtered)
    setCounts({
      total: all.length,
      safe: all.filter(i => i.status === 'safe').length,
      low: all.filter(i => i.status === 'low').length,
      critical: all.filter(i => ['critical','out'].includes(i.status)).length,
    })
  }

  useEffect(() => { load() }, [filter, search])

  const openEdit = (productId: string) => {
    setEditingId(productId)
    setEditMode('add')
    setStockQty('')
  }

  const handleConfirm = async (productId: string) => {
    const qty = parseFloat(stockQty)
    if (isNaN(qty)) return
    if (editMode === 'add') {
      await window.api.inventory.addStock(productId, qty)
    } else {
      if (qty < 0) return
      await window.api.inventory.setStock(productId, qty)
    }
    setEditingId(null)
    setStockQty('')
    load()
  }

  const statusLabel = (s: string) => {
    if (s === 'out')      return { text: 'Out of Stock',      class: 'bg-red-100 text-red-600' }
    if (s === 'critical') return { text: 'Critical',          class: 'bg-red-100 text-red-600' }
    if (s === 'low')      return { text: 'Low Stock',         class: 'bg-yellow-100 text-yellow-700' }
    return                       { text: 'Safe',              class: 'bg-green-100 text-green-600' }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Inventory Management" back="/" actions={
        <button
          onClick={() => navigate('/inventory/report')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded-lg hover:bg-white/30"
        >
          <FileText size={13} /> View Report
        </button>
      } />

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3 p-4">
        {[
          { label: 'Total',    value: counts.total,    icon: '📦', color: 'bg-gray-700' },
          { label: 'Safe',     value: counts.safe,     icon: '✓',  color: 'bg-green-500' },
          { label: 'Low',      value: counts.low,      icon: '!',  color: 'bg-yellow-400' },
          { label: 'Critical', value: counts.critical, icon: '⚠',  color: 'bg-red-500' },
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
          placeholder="Search products..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
          {FILTERS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {items.map(item => {
          const sl = statusLabel(item.status)
          const isEditing = editingId === item.product_id
          return (
            <div key={item.id} className="bg-white rounded-xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {item.image_path && <img src={getProductImageSrc(item.image_path)} alt={item.product_name || ''} className="w-full h-full object-cover" />}
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

              {isEditing ? (
                <div className="flex flex-col gap-2 items-end">
                  {/* Mode toggle */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                    <button
                      onClick={() => { setEditMode('add'); setStockQty('') }}
                      className={`px-3 py-1.5 transition ${editMode === 'add' ? 'bg-[#1a8eff] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >+ Add</button>
                    <button
                      onClick={() => { setEditMode('set'); setStockQty(String(item.quantity)) }}
                      className={`px-3 py-1.5 transition ${editMode === 'set' ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >Set To</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={stockQty}
                      onChange={e => setStockQty(e.target.value)}
                      type="number"
                      placeholder={editMode === 'add' ? '±Qty' : 'Exact qty'}
                      autoFocus
                      className="w-24 border-2 border-[#1a8eff] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleConfirm(item.product_id)}
                    />
                    <button
                      onClick={() => handleConfirm(item.product_id)}
                      className={`text-white px-3 py-1.5 rounded-lg text-sm font-medium ${editMode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-purple-500 hover:bg-purple-600'}`}
                    >{editMode === 'add' ? 'Add' : 'Set'}</button>
                    <button onClick={() => { setEditingId(null); setStockQty('') }} className="text-gray-400 hover:text-gray-600 px-1">✕</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openEdit(item.product_id)}
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
