import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import TopBar from '../../components/layout/TopBar'
import { Category, VariationGroup } from '../../types'
import { getProductImageSrc } from '../../utils/images'

interface PriceTier {
  min_qty: string
  price: string
  label: string
}

export default function AddProductPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const fileRef = useRef<HTMLInputElement>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<VariationGroup[]>([])
  const [form, setForm] = useState({
    name: '', barcode: '', description: '',
    category_id: '', base_price: '', base_cost: '',
    has_variations: false, variation_group_id: '',
    allow_fractions: false, track_inventory: true,
    initial_stock: '',
  })
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageDataUrl, setImageDataUrl] = useState<string>('')
  const [tiers, setTiers] = useState<PriceTier[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.categories.getAll().then(setCategories)
    window.api.variations.getGroups().then(setGroups)
    if (isEdit) {
      window.api.products.getById(id!).then((p: any) => {
        if (p) {
          setForm({
            name: p.name, barcode: p.barcode || '', description: p.description || '',
            category_id: p.category_id || '', base_price: String(p.base_price),
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

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      setImageDataUrl(dataUrl)
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
        await window.api.products.update(id!, {
          name: form.name.trim(), barcode: form.barcode || null,
          description: form.description,
          category_id: form.category_id || null,
          base_price: parseFloat(form.base_price) || 0,
          base_cost: parseFloat(form.base_cost) || 0,
          has_variations: form.has_variations,
          variation_group_id: form.variation_group_id || null,
          allow_fractions: form.allow_fractions,
          track_inventory: form.track_inventory,
        })
      } else {
        const result = await window.api.products.create({
          name: form.name.trim(), barcode: form.barcode || null,
          description: form.description,
          category_id: form.category_id || null,
          base_price: parseFloat(form.base_price) || 0,
          base_cost: parseFloat(form.base_cost) || 0,
          has_variations: form.has_variations,
          variation_group_id: form.variation_group_id || null,
          allow_fractions: form.allow_fractions,
          track_inventory: form.track_inventory,
          initial_stock: parseFloat(form.initial_stock) || 0,
        })
        productId = result.id
      }
      if (imageDataUrl && productId) {
        await window.api.products.saveImage(productId!, imageDataUrl)
      }
      // Save price tiers
      if (productId) {
        const validTiers = tiers
          .filter(t => t.min_qty && t.price)
          .map(t => ({ min_qty: parseFloat(t.min_qty), price: parseFloat(t.price), label: t.label || null }))
        if (validTiers.length > 0) {
          await window.api.priceTiers.set(productId, validTiers)
        } else {
          await window.api.priceTiers.delete(productId)
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title={isEdit ? 'Edit Product' : 'Add Product'} back="/products" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm p-6 space-y-5">
          {/* Image */}
          <div className="flex flex-col items-center gap-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="w-28 h-28 bg-gray-100 rounded-xl overflow-hidden cursor-pointer hover:bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300"
            >
              {imagePreview
                ? <img src={imagePreview} className="w-full h-full object-cover" />
                : <span className="text-4xl text-gray-300">+</span>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <p className="text-xs text-gray-400">Tap to upload product image</p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₱)</label>
              <input value={form.base_price} onChange={e => set('base_price', e.target.value)}
                type="number" placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (₱)</label>
              <input value={form.base_cost} onChange={e => set('base_cost', e.target.value)}
                type="number" placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
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
                <p className="text-xs text-gray-400">Auto-apply lower price when qty threshold is met</p>
              </div>
              <button
                onClick={() => setTiers(t => [...t, { min_qty: '', price: '', label: '' }])}
                className="flex items-center gap-1 text-xs text-[#1a8eff] hover:underline"
              >
                <Plus size={12} /> Add Tier
              </button>
            </div>
            {tiers.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 text-xs text-gray-400 px-1">
                  <span>Min Qty</span><span>Price (₱)</span><span>Label</span><span />
                </div>
                {tiers.map((tier, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 items-center">
                    <input
                      value={tier.min_qty}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, min_qty: e.target.value } : t))}
                      type="number" placeholder="e.g. 10"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <input
                      value={tier.price}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, price: e.target.value } : t))}
                      type="number" placeholder="0.00"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <input
                      value={tier.label}
                      onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, label: e.target.value } : t))}
                      placeholder="e.g. Wholesale"
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    />
                    <button onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-[#1a8eff] text-white py-3 rounded-xl font-semibold hover:bg-[#0077e6] disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  )
}
