import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Product } from '../../types'
import { Check, Plus, Tag, Type, Barcode, DollarSign, LayoutGrid, X } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'

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
    <div className="h-screen flex flex-col bg-transparent">
      {/* Top bar */}
      <div className="brand-gradient relative flex h-20 shrink-0 items-center gap-3 overflow-hidden border-b border-white/15 px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%)]" />
        <button onClick={() => navigate('/')} className="relative rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">Back</button>
        <div className="relative min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-50/75">Catalog Workspace</p>
          <h1 className="truncate text-2xl font-semibold text-white">Bulk Edit Products</h1>
        </div>
        <div className="relative flex-1 overflow-x-auto scrollbar-hide">{topActions}</div>
        <span className="relative shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-white/90">ADMIN</span>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <div className="glass-panel flex h-full flex-col overflow-hidden rounded-[30px]">
          <div className="border-b border-emerald-900/5 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Editing Mode</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {tab === 'prices' ? 'Bulk Price Management' : tab === 'names' ? 'Bulk Product Naming' : tab === 'barcodes' ? 'Bulk Barcode Management' : 'Bulk Cost Management'}
                </h2>
              </div>
              <div className="rounded-[22px] bg-white/75 p-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => setPriceMode('manual')}
                    className={`rounded-[18px] px-5 py-2.5 text-sm font-semibold transition ${priceMode === 'manual' ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'text-slate-500 hover:bg-[var(--brand-50)]'}`}>
                    Manual Pricing
                  </button>
                  <button onClick={() => setPriceMode('percentage')}
                    className={`rounded-[18px] px-5 py-2.5 text-sm font-semibold transition ${priceMode === 'percentage' ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'text-slate-500 hover:bg-[var(--brand-50)]'}`}>
                    Percentage Pricing
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search products or scan barcode..."
                className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 px-4 py-3 text-sm text-slate-700" />
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
              className={`rounded-[26px] border p-4 transition duration-200 ${isSelected && priceMode === 'percentage' ? 'border-[var(--brand-500)] bg-[var(--brand-50)] shadow-[0_18px_35px_rgba(36,152,90,0.12)]' : 'border-emerald-900/10 bg-white/82 shadow-[0_12px_30px_rgba(22,49,39,0.06)] hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(22,49,39,0.10)]'}`}
            >
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#f4faf6_0%,#e7f4eb_100%)] shrink-0">
                  {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name || ''} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold tracking-tight text-slate-800">{p.name}</p>
                    <p className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-semibold text-[var(--brand-700)]">Monthly Sold: {p.monthly_sold}</p>
                  </div>
                  {tab === 'prices' && priceMode === 'manual' && (
                    <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-500">
                      <span>Cost: ₱{cost.toFixed(2)}</span>
                      {markup != null && <span className="text-[var(--brand-700)]">Markup: {markup}%</span>}
                      <span>Price: ₱{price.toFixed(2)}</span>
                      <span className={profit >= 0 ? 'text-green-600' : 'text-red-500'}>Profit: ₱{profit.toFixed(2)}</span>
                    </div>
                  )}
                  {tab === 'prices' && priceMode === 'percentage' && (
                    <div className="flex flex-wrap gap-3 text-xs font-medium">
                      <span className="text-slate-500">Cost: ₱{cost.toFixed(2)}</span>
                      {markup != null
                        ? <span className="font-medium text-[var(--brand-700)]">{markup}% → ₱{price.toFixed(2)}</span>
                        : <span className="text-slate-400">Markup: N/A</span>}
                      <span className="text-slate-600">Price: ₱{price.toFixed(2)}</span>
                      <span className={`font-medium ${profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Profit: ₱{profit.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Input based on tab */}
                {tab === 'prices' && priceMode === 'manual' && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">₱</span>
                    <input
                      value={price}
                      onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], price: parseFloat(e.target.value) || 0 } }))}
                      onClick={e => e.stopPropagation()}
                      type="number"
                      className="brand-ring w-28 rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-right text-sm text-slate-700"
                    />
                  </div>
                )}
                {tab === 'prices' && priceMode === 'percentage' && isSelected && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-600)] text-white shadow-sm shrink-0">
                    <Check size={18} />
                  </div>
                )}
                {tab === 'names' && (
                  <input
                    value={name}
                    onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], name: e.target.value } }))}
                    onClick={e => e.stopPropagation()}
                    className="brand-ring w-56 rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-sm text-slate-700"
                  />
                )}
                {tab === 'barcodes' && (
                  <input
                    value={barcode}
                    onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], barcode: e.target.value } }))}
                    onClick={e => e.stopPropagation()}
                    placeholder="Enter barcode"
                    className="brand-ring w-44 rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-sm text-slate-700"
                  />
                )}
                {tab === 'costs' && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">₱</span>
                    <input
                      value={cost}
                      onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], cost: parseFloat(e.target.value) || 0 } }))}
                      onClick={e => e.stopPropagation()}
                      type="number"
                      className="brand-ring w-28 rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-right text-sm text-slate-700"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-400">No matching products found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Markup modal */}
      {showMarkup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-strong w-full max-w-sm rounded-[28px] p-6">
            <div className="flex justify-between mb-3">
              <h2 className="font-bold text-slate-800">Set Price Markup</h2>
              <button onClick={() => setShowMarkup(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500">Apply a new markup percentage to the {selected.size} selected products. Price = Cost × (1 + Markup%)</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[5,10,15,20,25,30].map(pct => (
                <button key={pct} onClick={() => applyMarkup(pct)}
                  className="rounded-2xl bg-[var(--brand-50)] py-3 text-sm font-semibold text-[var(--brand-700)] transition hover:bg-[var(--brand-600)] hover:text-white">
                  {pct}%
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={customMarkup} onChange={e => setCustomMarkup(e.target.value)}
                placeholder="Custom %" type="number"
                className="brand-ring flex-1 rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-sm text-slate-700" />
              <button onClick={() => applyMarkup(parseFloat(customMarkup) || 0)}
                className="rounded-2xl bg-[var(--brand-600)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-700)]">Set</button>
            </div>
            <button onClick={removeMarkup} className="flex w-full items-center justify-center gap-1 text-sm text-red-500 hover:underline">
              <X size={14} /> Remove Markup (Use Manual Price)
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {(editCount > 0 || (selected.size > 0 && priceMode === 'percentage')) && (
        <div className="border-t border-white/10 bg-[var(--brand-700)] p-4">
          {priceMode === 'percentage' && selected.size > 0 ? (
            <button onClick={() => setShowMarkup(true)}
              className="w-full rounded-2xl bg-white/12 py-3 text-center font-bold text-white transition hover:bg-white/18">
              Set Markup for {selected.size} Product{selected.size !== 1 ? 's' : ''}
            </button>
          ) : editCount > 0 ? (
            <button onClick={handleSave} disabled={saving}
              className="w-full rounded-2xl bg-white/12 py-3 text-center font-bold text-white transition hover:bg-white/18 disabled:opacity-50">
              {saving ? 'Saving...' : `Update ${tab === 'prices' ? 'Price' : tab === 'names' ? 'Name' : tab === 'barcodes' ? 'Barcode' : 'Cost'} for ${editCount} Product${editCount !== 1 ? 's' : ''}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
