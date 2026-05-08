import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Product } from '../../types'
import { Camera, Check, Plus, Tag, Type, Barcode, DollarSign, LayoutGrid, X, Upload, Wand2, ImageIcon, Trash2 } from 'lucide-react'
import { getProductImageSrc, compressImage } from '../../utils/images'

type Tab = 'prices' | 'names' | 'barcodes' | 'costs' | 'photos'

const TABS: { key: Tab; label: string; short: string; icon: React.ReactNode; color: string }[] = [
  { key: 'prices',   label: 'Edit Prices',   short: 'Prices',   icon: <Tag size={14}/>,        color: 'bg-purple-500' },
  { key: 'names',    label: 'Edit Names',    short: 'Names',    icon: <Type size={14}/>,       color: 'bg-pink-500' },
  { key: 'barcodes', label: 'Edit Barcodes', short: 'Barcodes', icon: <Barcode size={14}/>,    color: 'bg-fuchsia-600' },
  { key: 'costs',    label: 'Edit Costs',    short: 'Costs',    icon: <DollarSign size={14}/>, color: 'bg-orange-500' },
  { key: 'photos',   label: 'Edit Photos',   short: 'Photos',   icon: <ImageIcon size={14}/>,  color: 'bg-sky-500' },
]

export default function BulkEditPricesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'prices'
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>(initialTab)
  const [products, setProducts] = useState<Product[]>([])
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMarkup, setShowMarkup] = useState(false)
  const [customMarkup, setCustomMarkup] = useState('')
  const [saving, setSaving] = useState(false)
  const [priceMode, setPriceMode] = useState<'manual' | 'percentage'>('manual')
  const [error, setError] = useState('')
  const [imageTarget, setImageTarget] = useState<Product | null>(null)
  const [imageSavingId, setImageSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
        updates[id] = { price, retail_price: price, base_price: price, markup_pct: pct }
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

  const handleAutoGenerateBarcodes = () => {
    const updates: Record<string, any> = {}
    for (const p of filtered) {
      const currentBarcode = edits[p.id]?.barcode ?? p.barcode
      if (!currentBarcode) {
        const code = String(Math.floor(10000000 + Math.random() * 89999999))
        updates[p.id] = { ...edits[p.id], barcode: code }
      }
    }
    setEdits(e => ({ ...e, ...updates }))
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    setDeletingId(product.id)
    setError('')
    try {
      const result = await window.api.products.delete(product.id)
      if (!result?.success) throw new Error(result?.error || 'Failed to delete product.')
      setProducts(current => current.filter(p => p.id !== product.id))
    } catch (err: any) {
      setError(err?.message || 'Failed to delete product.')
    } finally {
      setDeletingId(null)
    }
  }

  const openImagePicker = (product: Product, useCamera = false) => {
    setImageTarget(product)
    if (useCamera) {
      cameraInputRef.current?.click()
    } else {
      imageInputRef.current?.click()
    }
  }

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const target = imageTarget
    e.target.value = ''
    if (!file || !target) return

    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      if (!raw) return

      setImageSavingId(target.id)
      setError('')
      try {
        const dataUrl = await compressImage(raw)
        const result = await window.api.products.saveImage(target.id, dataUrl)
        if (!result?.success) throw new Error(result?.error || 'Failed to update product image.')
        setProducts(current => current.map(p =>
          p.id === target.id ? { ...p, image_path: result.path || dataUrl } : p
        ))
      } catch (err: any) {
        setError(err?.message || 'Failed to update product image.')
      } finally {
        setImageSavingId(null)
        setImageTarget(null)
      }
    }
    reader.onerror = () => { setError('Failed to read the selected image.'); setImageTarget(null) }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      let result: any = { success: true }
      if (tab === 'prices') {
        const updates = Object.entries(edits).map(([id, v]) => {
          const nextPrice = v.price ?? v.retail_price ?? v.base_price
          return {
            id,
            ...(nextPrice !== undefined ? {
              price: nextPrice,
              retail_price: nextPrice,
              base_price: nextPrice,
            } : {}),
            ...(v.markup_pct !== undefined ? { markup_pct: v.markup_pct } : {}),
          }
        })
        result = await window.api.products.bulkPrices(updates)
      } else if (tab === 'names') {
        const updates = Object.entries(edits).map(([id, v]) => ({ id, ...v }))
        result = await window.api.products.bulkNames(updates)
      } else if (tab === 'barcodes') {
        const updates = Object.entries(edits).map(([id, v]) => ({ id, ...v }))
        result = await window.api.products.bulkBarcodes(updates)
      } else if (tab === 'costs') {
        const updates = Object.entries(edits).map(([id, v]) => {
          const nextCost = v.cost ?? v.base_cost
          return { id, cost: nextCost, base_cost: nextCost }
        })
        result = await window.api.products.bulkCosts(updates)
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to save product updates.')
      }

      setEdits({})
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to save product updates.')
    } finally {
      setSaving(false)
    }
  }

  const editCount = Object.keys(edits).length
  const currentTab = TABS.find(t => t.key === tab)!

  return (
    <div className="h-screen flex flex-col bg-transparent">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImagePick} />

      {/* ── Top bar ── */}
      <div className="brand-gradient relative flex h-14 md:h-20 shrink-0 items-center gap-2 md:gap-3 overflow-hidden border-b border-white/15 px-3 md:px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%)]" />
        <button onClick={() => navigate('/')} className="relative rounded-full border border-white/15 bg-white/10 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium text-white transition hover:bg-white/20">
          Back
        </button>
        <div className="relative min-w-0 flex-1">
          <p className="hidden md:block text-xs uppercase tracking-[0.24em] text-emerald-50/75">Catalog Workspace</p>
          <h1 className="truncate text-base md:text-2xl font-semibold text-white leading-tight">Bulk Edit Products</h1>
        </div>
        <span className="relative shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-white/90">ADMIN</span>
      </div>

      <div className="flex-1 overflow-hidden p-3 md:p-4">
        <div className="glass-panel flex h-full flex-col overflow-hidden rounded-[24px] md:rounded-[30px]">

          {/* ── Action strip (Add, Import, Categories + Tab switcher) ── */}
          <div className="border-b border-emerald-900/5 px-3 md:px-5 py-3">
            {/* Quick actions row */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              <button onClick={() => navigate('/products/add')}
                className="shrink-0 flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600">
                <Plus size={13}/> Add
              </button>
              <button onClick={() => navigate('/products/import')}
                className="shrink-0 flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600">
                <Upload size={13}/> Import CSV
              </button>
              <button onClick={() => navigate('/products/categories')}
                className="shrink-0 flex items-center gap-1 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600">
                <LayoutGrid size={13}/> Categories
              </button>
              {tab === 'barcodes' && (
                <button onClick={handleAutoGenerateBarcodes}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-700">
                  <Wand2 size={13}/> Auto-Generate
                </button>
              )}
            </div>

            {/* Tab selector */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    tab === t.key
                      ? `${t.color} text-white shadow-sm ring-2 ring-white/30`
                      : 'bg-white/60 text-slate-600 hover:bg-white/90'
                  }`}>
                  {t.icon}
                  <span>{t.short}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Sub-header: mode title + pricing toggle ── */}
          <div className="border-b border-emerald-900/5 px-3 md:px-5 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/70">Editing Mode</p>
              <h2 className="text-base md:text-xl font-semibold text-slate-900">
                {tab === 'prices' ? 'Bulk Price Management'
                  : tab === 'names' ? 'Bulk Product Naming'
                  : tab === 'barcodes' ? 'Bulk Barcode Management'
                  : tab === 'photos' ? 'Product Photos'
                  : 'Bulk Cost Management'}
              </h2>
            </div>
            {tab === 'prices' && (
              <div className="rounded-[22px] bg-white/75 p-1 self-start sm:self-auto">
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => setPriceMode('manual')}
                    className={`rounded-[18px] px-4 py-2 text-xs font-semibold transition ${priceMode === 'manual' ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'text-slate-500 hover:bg-[var(--brand-50)]'}`}>
                    Manual
                  </button>
                  <button onClick={() => setPriceMode('percentage')}
                    className={`rounded-[18px] px-4 py-2 text-xs font-semibold transition ${priceMode === 'percentage' ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'text-slate-500 hover:bg-[var(--brand-50)]'}`}>
                    % Markup
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="px-3 md:px-5 py-3 border-b border-emerald-900/5">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products or scan barcode..."
              className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 px-4 py-2.5 text-sm text-slate-700" />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </div>

          {/* ── Product list ── */}
          <div className="flex-1 overflow-y-auto px-3 md:px-4 py-3">
            {tab === 'photos' ? (
              /* ── Photos grid ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map(p => {
                  const isSavingImage = imageSavingId === p.id
                  const imgSrc = p.image_path ? getProductImageSrc(p.image_path) : ''
                  return (
                    <div key={p.id} className="rounded-2xl border border-emerald-900/10 bg-white/82 shadow-sm overflow-hidden flex flex-col">
                      {/* Photo area */}
                      <div className="relative aspect-square bg-gradient-to-b from-gray-50 to-gray-100">
                        {imgSrc
                          ? <img src={imgSrc} alt={p.name} className="w-full h-full object-cover" />
                          : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                              <ImageIcon size={28} />
                              <span className="text-[10px] font-medium">No photo</span>
                            </div>
                          )
                        }
                        {isSavingImage && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                            <span className="text-xs font-semibold text-white">Saving…</span>
                          </div>
                        )}
                      </div>
                      {/* Name */}
                      <p className="px-2 pt-2 pb-1 text-xs font-semibold text-slate-700 truncate">{p.name}</p>
                      {/* Action buttons */}
                      <div className="flex gap-1.5 px-2 pb-2">
                        <button
                          type="button"
                          onClick={() => openImagePicker(p, true)}
                          disabled={isSavingImage}
                          className="flex items-center justify-center gap-1 rounded-xl bg-sky-500 py-1.5 px-2 text-[11px] font-medium text-white hover:bg-sky-600 disabled:opacity-50 sm:hidden"
                        >
                          <Camera size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openImagePicker(p, false)}
                          disabled={isSavingImage}
                          className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-slate-700 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <ImageIcon size={12} />
                          <span>Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="flex items-center justify-center rounded-xl bg-red-50 border border-red-100 py-1.5 px-2 text-red-500 hover:bg-red-100 disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === p.id ? <X size={12} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="col-span-full py-16 text-center text-sm text-slate-400">No matching products found.</div>
                )}
              </div>
            ) : (
              /* ── Standard list for other tabs ── */
              <div className="space-y-2.5">
                {filtered.map(p => {
                  const edit = edits[p.id] || {}
                  const isSelected = selected.has(p.id)
                  const price = edit.price ?? edit.retail_price ?? edit.base_price ?? p.retail_price ?? p.base_price
                  const cost = edit.cost ?? edit.base_cost ?? p.base_cost
                  const name = edit.name ?? p.name
                  const barcode = edit.barcode ?? p.barcode ?? ''
                  const markup = edit.markup_pct ?? p.markup_pct
                  const profit = price - cost
                  const isSavingImage = imageSavingId === p.id

                  return (
                    <div key={p.id}
                      onClick={() => priceMode === 'percentage' && toggleSelect(p.id)}
                      className={`rounded-[22px] border p-3 md:p-4 transition duration-200 ${
                        isSelected && priceMode === 'percentage'
                          ? 'border-[var(--brand-500)] bg-[var(--brand-50)] shadow-[0_12px_28px_rgba(36,152,90,0.12)]'
                          : 'border-emerald-900/10 bg-white/82 shadow-[0_8px_20px_rgba(22,49,39,0.06)] hover:-translate-y-0.5'
                      }`}
                    >
                      {/* Top row: image + name + stats */}
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 md:h-16 md:w-16 overflow-hidden rounded-xl md:rounded-2xl bg-[linear-gradient(180deg,#f4faf6_0%,#e7f4eb_100%)] shrink-0">
                          {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name || ''} className="w-full h-full object-cover" />}
                          {isSavingImage && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-[10px] font-semibold text-white">
                              Saving
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <p className="text-base md:text-xl font-semibold tracking-tight text-slate-800 truncate">{p.name}</p>
                            <span className="shrink-0 rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-700)]">
                              Sold: {p.monthly_sold}
                            </span>
                          </div>
                          {tab === 'prices' && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-medium text-slate-500">
                              <span>Cost: ₱{cost.toFixed(2)}</span>
                              {markup != null && <span className="text-[var(--brand-700)]">Markup: {markup}%</span>}
                              <span>Price: ₱{price.toFixed(2)}</span>
                              <span className={profit >= 0 ? 'text-green-600' : 'text-red-500'}>Profit: ₱{profit.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openImagePicker(p) }}
                          disabled={isSavingImage}
                          className="shrink-0 rounded-full border border-emerald-900/10 bg-white/90 p-2 text-slate-500 transition hover:bg-white hover:text-[var(--brand-700)] disabled:opacity-50"
                          title="Edit photo"
                        >
                          <ImageIcon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleDelete(p) }}
                          disabled={deletingId === p.id}
                          className="shrink-0 rounded-full border border-red-100 bg-white/90 p-2 text-red-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Delete product"
                        >
                          {deletingId === p.id ? <X size={16} /> : <Trash2 size={16} />}
                        </button>
                        {tab === 'prices' && priceMode === 'percentage' && isSelected && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-600)] text-white shadow-sm">
                            <Check size={15} />
                          </div>
                        )}
                      </div>

                      {tab === 'prices' && priceMode === 'manual' && (
                        <div className="mt-2.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <span className="text-slate-400 text-sm shrink-0">₱</span>
                          <input
                            value={price}
                            onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], price: parseFloat(e.target.value) || 0 } }))}
                            type="number"
                            className="brand-ring flex-1 max-w-[140px] rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-right text-sm text-slate-700"
                          />
                        </div>
                      )}
                      {tab === 'names' && (
                        <div className="mt-2.5" onClick={e => e.stopPropagation()}>
                          <input
                            value={name}
                            onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], name: e.target.value } }))}
                            className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                      )}
                      {tab === 'barcodes' && (
                        <div className="mt-2.5" onClick={e => e.stopPropagation()}>
                          <input
                            value={barcode}
                            onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], barcode: e.target.value } }))}
                            placeholder="Enter barcode"
                            className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                      )}
                      {tab === 'costs' && (
                        <div className="mt-2.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <span className="text-slate-400 text-sm shrink-0">₱</span>
                          <input
                            value={cost}
                            onChange={e => setEdits(ed => ({ ...ed, [p.id]: { ...ed[p.id], cost: parseFloat(e.target.value) || 0 } }))}
                            type="number"
                            className="brand-ring flex-1 max-w-[140px] rounded-2xl border border-emerald-900/10 bg-white/85 px-3 py-2 text-right text-sm text-slate-700"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="py-16 text-center text-sm text-slate-400">No matching products found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Markup modal ── */}
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

      {/* ── Bottom save bar ── */}
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
              {saving ? 'Saving…' : `Update ${tab === 'prices' ? 'Price' : tab === 'names' ? 'Name' : tab === 'barcodes' ? 'Barcode' : 'Cost'} for ${editCount} Product${editCount !== 1 ? 's' : ''}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
