import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Product } from '../../types'
import { Check, Plus, Tag, Type, Barcode, DollarSign, LayoutGrid, X } from 'lucide-react'

type Tab = 'prices' | 'names' | 'barcodes' | 'costs'

export default function BulkEditPricesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'prices'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [products, setProducts] = useState<Product[]>([])
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMarkup, setShowMarkup] = useState(false)
  const [customMarkup, setCustomMarkup] = useState('')
  const [saving, setSaving] = useState(false)
  const [priceMode, setPriceMode] = useState<'manual' | 'percentage'>('manual')

  const load = async () => {
    const data = await window.api.products.getAll()
    setProducts(data)
  }

  useEffect(() => { load() }, [])

  const filtered = search
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search))
    : products

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const ns = new Set(s)
      ns.has(id) ? ns.delete(id) : ns.add(id)
      return ns
    })
  }

  const applyMarkup = (pct: number) => {
    const updates: Record<string, any> = {}
    for (const id of selected) {
      const p = products.find(x => x.id === id)
      if (p) {
        const price = Math.ceil(p.base_cost * (1 + pct / 100))
        updates[id] = { price, markup_pct: pct }
      }
    }
    setEdits(e => ({ ...e, ...updates }))
    setShowMarkup(false)
    setSelected(new Set())
  }

  const removeMarkup = () => {
    const updates: Record<string, any> = {}
    for (const id of selected) {
      updates[id] = { markup_pct: null }
    }
    setEdits(e => ({ ...e, ...updates }))
    setShowMarkup(false)
    setSelected(new Set())
  }

  const handleSave = async () => {
    setSaving(true)
    const updates = Object.entries(edits).map(([id, v]) => ({ id, ...v }))
    if (tab === 'prices') await window.api.products.bulkPrices(updates)
    else if (tab === 'names') await window.api.products.bulkNames(updates)
    else if (tab === 'barcodes') await window.api.products.bulkBarcodes(updates)
    else if (tab === 'costs') await window.api.products.bulkCosts(updates)
    setEdits({})
    setSaving(false)
    load()
  }

  const editCount = Object.keys(edits).length

  const topActions = (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate('/products/add')} className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-green-600">
        <Plus size={14} /> Add Product
      </button>
      {(['prices','names','barcodes','costs'] as Tab[]).map((t, i) => {
        const labels = ['Edit Prices','Edit Names','Edit Barcodes','Edit Costs']
        const colors = ['bg-purple-500 hover:bg-purple-600','bg-pink-500 hover:bg-pink-600','bg-fuchsia-600 hover:bg-fuchsia-700','bg-orange-500 hover:bg-orange-600']
        const icons = [<Tag size={14}/>,<Type size={14}/>,<Barcode size={14}/>,<DollarSign size={14}/>]
        return (
          <button key={t} onClick={() => setTab(t)}
            className={`${colors[i]} text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 ${tab === t ? 'ring-2 ring-white ring-offset-1' : ''}`}>
            {icons[i]} {labels[i]}
          </button>
        )
      })}
      <button onClick={() => navigate('/products/categories')} className="bg-teal-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-teal-600">
        <LayoutGrid size={14} /> Categories
      </button>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="h-14 bg-[#1a8eff] flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-white hover:text-blue-200">← Bulk Edit Prices</button>
        <div className="flex-1 overflow-x-auto scrollbar-hide">{topActions}</div>
        <span className="text-white text-xs shrink-0">ADMIN</span>
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <button onClick={() => setPriceMode('manual')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${priceMode === 'manual' ? 'text-[#1a8eff] border-b-2 border-[#1a8eff]' : 'text-gray-500 hover:text-gray-700'}`}>
          Manual Pricing
        </button>
        <button onClick={() => setPriceMode('percentage')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${priceMode === 'percentage' ? 'text-[#1a8eff] border-b-2 border-[#1a8eff]' : 'text-gray-500 hover:text-gray-700'}`}>
          Percentage Pricing
        </button>
      </div>

      {/* Search */}
      <div className="p-4 pb-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search products or scan barcode..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {filtered.map(p => {
          const edit = edits[p.id] || {}
          const isSelected = selected.has(p.id)
          const price = edit.price ?? p.base_price
          const cost = edit.cost ?? p.base_cost
          const name = edit.name ?? p.name
          const barcode = edit.barcode ?? p.barcode ?? ''
          const markup = edit.markup_pct ?? p.markup_pct
          const profit = price - cost

          return (
            <div key={p.id}
              onClick={() => priceMode === 'percentage' && toggleSelect(p.id)}
              className={`bg-white rounded-xl p-4 shadow-sm border-2 transition-colors ${isSelected && priceMode === 'percentage' ? 'border-[#1a8eff]' : 'border-transparent'}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {p.image_path && <img src={`file://${p.image_path}`} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">Monthly Sold: {p.monthly_sold}</p>
                  </div>
                  {tab === 'prices' && priceMode === 'manual' && (
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Cost: ₱{cost.toFixed(2)}</span>
                      {markup != null && <span className="text-blue-500">Markup: {markup}%</span>}
                      <span>Price: ₱{price.toFixed(2)}</span>
                      <span className={profit >= 0 ? 'text-green-500' : 'text-red-500'}>Profit: ₱{profit.toFixed(2)}</span>
                    </div>
                  )}
                  {tab === 'prices' && priceMode === 'percentage' && (
                    <div className="flex gap-3 text-xs">
                      <span className="text-gray-500">Cost: ₱{cost.toFixed(2)}</span>
                      {markup != null
                        ? <span className="text-blue-500 font-medium">{markup}% → ₱{price.toFixed(2)}</span>
                        : <span className="text-gray-400">Markup: N/A</span>}
                      <span>Price: ₱{price.toFixed(2)}</span>
                      <span className={`font-medium ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Profit: ₱{profit.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Input based on tab */}
                {tab === 'prices' && priceMode === 'manual' && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">₱</span>
                    <input
                      value={price}
                      onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], price: parseFloat(e.target.value) || 0 } }))}
                      onClick={e => e.stopPropagation()}
                      type="number"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                  </div>
                )}
                {tab === 'prices' && priceMode === 'percentage' && isSelected && (
                  <Check size={20} className="text-[#1a8eff] shrink-0" />
                )}
                {tab === 'names' && (
                  <input
                    value={name}
                    onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], name: e.target.value } }))}
                    onClick={e => e.stopPropagation()}
                    className="w-48 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                )}
                {tab === 'barcodes' && (
                  <input
                    value={barcode}
                    onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], barcode: e.target.value } }))}
                    onClick={e => e.stopPropagation()}
                    placeholder="Enter barcode"
                    className="w-40 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                )}
                {tab === 'costs' && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">₱</span>
                    <input
                      value={cost}
                      onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], cost: parseFloat(e.target.value) || 0 } }))}
                      onClick={e => e.stopPropagation()}
                      type="number"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Markup modal */}
      {showMarkup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between mb-3">
              <h2 className="font-bold text-gray-800">Set Price Markup</h2>
              <button onClick={() => setShowMarkup(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Apply a new markup percentage to the {selected.size} selected products. Price = Cost × (1 + Markup%)</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[5,10,15,20,25,30].map(pct => (
                <button key={pct} onClick={() => applyMarkup(pct)}
                  className="py-3 bg-blue-50 hover:bg-[#1a8eff] hover:text-white text-[#1a8eff] rounded-xl text-sm font-semibold transition-colors">
                  {pct}%
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={customMarkup} onChange={e => setCustomMarkup(e.target.value)}
                placeholder="Custom %" type="number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <button onClick={() => applyMarkup(parseFloat(customMarkup) || 0)}
                className="bg-[#1a8eff] text-white px-4 rounded-lg text-sm font-medium hover:bg-[#0077e6]">Set</button>
            </div>
            <button onClick={removeMarkup} className="w-full text-red-500 text-sm hover:underline flex items-center justify-center gap-1">
              <X size={14} /> Remove Markup (Use Manual Price)
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {(editCount > 0 || (selected.size > 0 && priceMode === 'percentage')) && (
        <div className="border-t bg-[#1a8eff] p-4">
          {priceMode === 'percentage' && selected.size > 0 ? (
            <button onClick={() => setShowMarkup(true)}
              className="w-full text-white font-bold py-3 rounded-xl hover:bg-[#0077e6] text-center">
              Set Markup for {selected.size} Product{selected.size !== 1 ? 's' : ''}
            </button>
          ) : editCount > 0 ? (
            <button onClick={handleSave} disabled={saving}
              className="w-full text-white font-bold py-3 rounded-xl hover:bg-[#0077e6] disabled:opacity-50 text-center">
              {saving ? 'Saving...' : `Update Price for ${editCount} Product${editCount !== 1 ? 's' : ''}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
