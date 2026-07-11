import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Camera, ImageIcon } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import TopBar from '../../components/layout/TopBar'
import { Category, VariationGroup } from '../../types'
import { getProductImageSrc, compressImage } from '../../utils/images'
import { getProAccessState } from '../../lib/web-api/pro-access'

interface PriceTier {
  min_qty: string
  price: string
  label: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function AddProductPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const barcodeSvgRef = useRef<SVGSVGElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<VariationGroup[]>([])
  const [form, setForm] = useState({
    name: '', barcode: '', description: '',
    category_id: '', retail_price: '', wholesale_price: '', base_cost: '',
    has_variations: false, variation_group_id: '',
    allow_fractions: false, track_inventory: true,
    initial_stock: '',
  })
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageDataUrl, setImageDataUrl] = useState<string>('')
  const [tiers, setTiers] = useState<PriceTier[]>([])
  const [isPro, setIsPro] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.categories.getAll().then(setCategories)
    window.api.variations.getGroups().then(setGroups)
    getProAccessState().then(access => setIsPro(access.activated)).catch(() => setIsPro(false))
    if (isEdit) {
      window.api.products.getById(id!).then((p: any) => {
        if (p) {
          setForm({
            name: p.name, barcode: p.barcode || '', description: p.description || '',
            category_id: p.category_id || '', retail_price: String(p.retail_price ?? p.base_price),
            wholesale_price: String(p.wholesale_price ?? p.retail_price ?? p.base_price),
            base_cost: String(p.base_cost), has_variations: !!p.has_variations,
            variation_group_id: p.variation_group_id || '',
            allow_fractions: !!p.allow_fractions, track_inventory: !!p.track_inventory,
            initial_stock: '',
          })
          if (p.image_path) setImagePreview(getProductImageSrc(p.image_path))
        }
      })
      window.api.priceTiers.get(id!).then((rows: any[]) => {
        if (rows?.length) {
          setTiers(rows.map(r => ({ min_qty: String(r.min_qty), price: String(r.price), label: r.label || '' })))
        }
      })
    }
  }, [id])

  useEffect(() => {
    const svg = barcodeSvgRef.current
    const value = form.barcode.trim()
    if (!svg) return

    if (!value) {
      svg.innerHTML = ''
      return
    }

    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: true,
        background: '#ffffff',
        lineColor: '#111827',
        width: 2,
        height: 72,
        margin: 12,
        fontSize: 16,
      })
      setError(current => current === 'Please enter a valid barcode value.' ? '' : current)
    } catch {
      svg.innerHTML = ''
    }
  }, [form.barcode])

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const raw = reader.result as string
      compressImage(raw).then(compressed => {
        setImagePreview(compressed)
        setImageDataUrl(compressed)
      }).catch(() => {
        // Fall back to uncompressed if canvas fails (e.g. cross-origin sandbox)
        setImagePreview(raw)
        setImageDataUrl(raw)
      })
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      let productId = id
      if (isEdit) {
        const result = await window.api.products.update(id!, {
          name: form.name.trim(), barcode: form.barcode || null,
          description: form.description,
          category_id: form.category_id || null,
          retail_price: parseFloat(form.retail_price) || 0,
          base_price: parseFloat(form.retail_price) || 0,
          wholesale_price: parseFloat(form.wholesale_price) || 0,
          base_cost: parseFloat(form.base_cost) || 0,
          has_variations: form.has_variations,
          variation_group_id: form.variation_group_id || null,
          allow_fractions: form.allow_fractions,
          track_inventory: form.track_inventory,
        })
        if (!result?.success) throw new Error(result?.error || 'Failed to update product.')
      } else {
        const result = await window.api.products.create({
          name: form.name.trim(), barcode: form.barcode || null,
          description: form.description,
          category_id: form.category_id || null,
          retail_price: parseFloat(form.retail_price) || 0,
          base_price: parseFloat(form.retail_price) || 0,
          wholesale_price: parseFloat(form.wholesale_price) || 0,
          base_cost: parseFloat(form.base_cost) || 0,
          has_variations: form.has_variations,
          variation_group_id: form.variation_group_id || null,
          allow_fractions: form.allow_fractions,
          track_inventory: form.track_inventory,
          initial_stock: parseFloat(form.initial_stock) || 0,
        })
        if (!result?.success || !result?.id) throw new Error(result?.error || 'Failed to create product.')
        productId = result.id
      }
      if (imageDataUrl && productId) {
        const imageResult = await window.api.products.saveImage(productId!, imageDataUrl)
        if (!imageResult?.success) throw new Error(imageResult?.error || 'Failed to save product image.')
      }
      // Save price tiers
      if (productId) {
        const validTiers = tiers
          .filter(t => t.min_qty && t.price)
          .map(t => ({ min_qty: parseFloat(t.min_qty), price: parseFloat(t.price), label: t.label || null }))
        if (validTiers.length > 0) {
          const tierResult = await window.api.priceTiers.set(productId, validTiers)
          if (!tierResult?.success) throw new Error('Failed to save price tiers.')
        } else {
          const tierResult = await window.api.priceTiers.delete(productId)
          if (!tierResult?.success) throw new Error('Failed to clear price tiers.')
        }
      }
      navigate('/products')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }))

  const handleDelete = async () => {
    if (!isEdit || !id) return
    if (!confirm(`Delete "${form.name.trim() || 'this product'}"?`)) return

    setSaving(true)
    setError('')
    try {
      const result = await window.api.products.delete(id)
      if (!result?.success) throw new Error(result?.error || 'Failed to delete product.')
      navigate('/products')
    } catch (e: any) {
      setError(e?.message || 'Failed to delete product.')
    } finally {
      setSaving(false)
    }
  }

  const generateBarcodeValue = () => {
    const timestamp = Date.now().toString().slice(-10)
    const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
    set('barcode', `${timestamp}${randomSuffix}`)
  }

  const withBarcodeSvg = () => {
    const svg = barcodeSvgRef.current
    const value = form.barcode.trim()
    if (!svg || !value) {
      setError('Please enter a barcode first.')
      return null
    }

    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: true,
        background: '#ffffff',
        lineColor: '#111827',
        width: 2,
        height: 72,
        margin: 12,
        fontSize: 16,
      })
      return svg
    } catch {
      setError('Please enter a valid barcode value.')
      return null
    }
  }

  const handleDownloadBarcode = () => {
    const svg = withBarcodeSvg()
    if (!svg) return

    const serialized = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fallbackName = form.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'product'
    link.href = url
    link.download = `${fallbackName}-barcode.svg`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handlePrintBarcode = () => {
    const svg = withBarcodeSvg()
    if (!svg) return

    const serialized = new XMLSerializer().serializeToString(svg)
    const productName = form.name.trim() || 'Product Barcode'
    const safeProductName = escapeHtml(productName)
    const safeBarcodeValue = escapeHtml(form.barcode.trim())
    const printWindow = window.open('', '_blank', 'width=420,height=600')
    if (!printWindow) {
      setError('Unable to open print window.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${safeProductName}</title>
          <style>
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #111827;
            }
            .sheet {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 24px;
              box-sizing: border-box;
            }
            .card {
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              padding: 24px;
              text-align: center;
              width: 100%;
              max-width: 320px;
            }
            .name {
              font-size: 18px;
              font-weight: 600;
              margin-bottom: 12px;
            }
            .code {
              font-size: 13px;
              letter-spacing: 0.08em;
              color: #6b7280;
              margin-top: 12px;
            }
            svg {
              width: 100%;
              height: auto;
            }
            @media print {
              body { margin: 0; }
              .card { border: none; padding: 0; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="card">
              <div class="name">${safeProductName}</div>
              ${serialized}
              <div class="code">${safeBarcodeValue}</div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title={isEdit ? 'Edit Product' : 'Add Product'} back="/products" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm p-6 space-y-5">
          {/* Image */}
          <div className="flex flex-col items-center gap-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="w-28 h-28 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300 transition"
            >
              {imagePreview
                ? <img src={imagePreview} className="w-full h-full object-cover" />
                : <span className="text-4xl text-gray-300">+</span>
              }
            </div>

            {/* Hidden inputs */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImagePick} />

            {/* On mobile: two buttons; on desktop: single label */}
            <div className="flex items-center gap-2">
              {/* Camera button — visible on mobile, hidden on desktop */}
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 active:scale-95 transition sm:hidden"
              >
                <Camera size={14} /> Take Photo
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 active:scale-95 transition"
              >
                <ImageIcon size={14} />
                <span className="sm:hidden">Choose from Gallery</span>
                <span className="hidden sm:inline">Upload image</span>
              </button>
            </div>
          </div>

          {/* Form fields */}
          {[
            { label: 'Product Name *', key: 'name', placeholder: 'e.g. 555 Tuna Afritada' },
            { label: 'Barcode', key: 'barcode', placeholder: 'Scan or enter barcode' },
            { label: 'Description', key: 'description', placeholder: 'Optional description' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
          ))}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Barcode Generator</p>
                <p className="text-xs text-gray-400">Create, download, or print a barcode for this product.</p>
              </div>
              <button
                type="button"
                onClick={generateBarcodeValue}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-900"
              >
                Generate Code
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4">
              {form.barcode.trim() ? (
                <svg ref={barcodeSvgRef} className="mx-auto max-w-full" />
              ) : (
                <div className="py-10 text-center text-sm text-gray-400">Enter or generate a barcode to preview it here.</div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleDownloadBarcode}
                disabled={!form.barcode.trim()}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download SVG
              </button>
              <button
                type="button"
                onClick={handlePrintBarcode}
                disabled={!form.barcode.trim()}
                className="flex-1 rounded-lg bg-[#1a8eff] px-3 py-2 text-sm font-medium text-white hover:bg-[#0077e6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print Barcode
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price (₱)</label>
              <input value={form.retail_price} onChange={e => set('retail_price', e.target.value)}
                type="number" placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale Price (₱)</label>
              <input value={form.wholesale_price} onChange={e => set('wholesale_price', e.target.value)}
                type="number" placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (₱)</label>
              <input value={form.base_cost} onChange={e => set('base_cost', e.target.value)}
                type="number" placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
              <input value={form.initial_stock} onChange={e => set('initial_stock', e.target.value)}
                type="number" placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
          )}

          {/* Toggles */}
          {[
            { label: 'Has Variations', key: 'has_variations', desc: 'Product comes in sizes or types' },
            { label: 'Allow Fractional Quantity', key: 'allow_fractions', desc: 'e.g. 1/4, 1/2, 0.25 kg' },
            { label: 'Track Inventory', key: 'track_inventory', desc: 'Deduct stock on each sale' },
          ].map(t => (
            <div key={t.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">{t.label}</p>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
              <button
                onClick={() => set(t.key, !(form as any)[t.key])}
                className={`w-12 h-6 rounded-full transition-colors ${(form as any)[t.key] ? 'bg-[#1a8eff]' : 'bg-gray-200'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${(form as any)[t.key] ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}

          {form.has_variations && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Variation Group</label>
              <select value={form.variation_group_id} onChange={e => set('variation_group_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
                <option value="">Select group</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {/* Wholesale Price Tiers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Wholesale Price Tiers</p>
                <p className="text-xs text-gray-400">
                  {isPro ? 'Auto-apply lower price when qty threshold is met' : 'Available on Reyna Pro only'}
                </p>
              </div>
              <button
                disabled={!isPro}
                onClick={() => setTiers(t => [...t, { min_qty: '', price: '', label: '' }])}
                className="flex items-center gap-1 text-xs text-[#1a8eff] hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                <Plus size={12} /> Add Tier
              </button>
            </div>
            {!isPro && (
              <div className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Upgrade this account to Pro to save and auto-apply wholesale price tiers.
              </div>
            )}
            {tiers.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 text-xs text-gray-400 px-1">
                  <span>Min Qty</span><span>Price (₱)</span><span>Label</span><span />
                </div>
                {tiers.map((tier, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 items-center">
                    <input
                      value={tier.min_qty}
                      disabled={!isPro}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, min_qty: e.target.value } : t))}
                      type="number" placeholder="e.g. 10"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <input
                      value={tier.price}
                      disabled={!isPro}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, price: e.target.value } : t))}
                      type="number" placeholder="0.00"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <input
                      value={tier.label}
                      disabled={!isPro}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, label: e.target.value } : t))}
                      placeholder="e.g. Wholesale"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <button disabled={!isPro} onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className={`grid gap-3 ${isEdit ? 'sm:grid-cols-[1fr_auto]' : ''}`}>
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-[#1a8eff] text-white py-3 rounded-xl font-semibold hover:bg-[#0077e6] disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="w-full sm:w-auto border border-red-200 text-red-600 py-3 px-5 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-50"
              >
                Delete Product
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
