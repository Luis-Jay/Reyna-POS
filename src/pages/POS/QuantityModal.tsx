import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Product } from '../../types'

const FRACTIONS = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 0.333 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
]
const WHOLE = [1, 2, 3, 4, 5, 10, 15, 20]

interface VariationOption {
  id: string
  name: string
  price: number
  cost: number
}

interface PriceTier {
  min_qty: number
  price: number
  label?: string | null
}

interface Props {
  product: Product
  initialPriceType?: 'retail' | 'wholesale'
  cachedTiers?: PriceTier[]
  loadTiers?: (productId: string) => Promise<PriceTier[]>
  onClose: () => void
  onAdd: (item: any) => void
}

export default function QuantityModal({ product, initialPriceType = 'retail', cachedTiers, loadTiers, onClose, onAdd }: Props) {
  const [qty, setQty] = useState<number | string>(1)
  const [customQty, setCustomQty] = useState('')
  // Pricing mode comes from the global POS toggle — no per-item override.
  const priceType = initialPriceType
  const [tiers, setTiers] = useState<PriceTier[]>(cachedTiers || [])

  // Variations
  const [options, setOptions] = useState<VariationOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [selectedOption, setSelectedOption] = useState<VariationOption | null>(null)

  // Show variation picker only when a group is set AND options actually exist
  // (loadingOptions keeps it pending until we know for sure)
  const hasVariations = !!(product.variation_group_id) && (loadingOptions || options.length > 0)

  useEffect(() => {
    if (!hasVariations) return
    setLoadingOptions(true)
    window.api.variations.getOptions(product.variation_group_id!)
      .then((opts: VariationOption[]) => {
        setOptions(opts)
        // Auto-select first option if only one exists
        if (opts.length === 1) setSelectedOption(opts[0])
      })
      .finally(() => setLoadingOptions(false))
  }, [product.variation_group_id, hasVariations])

  useEffect(() => {
    let active = true
    setTiers(cachedTiers || [])
    if (cachedTiers !== undefined || !loadTiers) return

    loadTiers(product.id).then(rows => {
      if (active) setTiers(rows || [])
    })

    return () => { active = false }
  }, [cachedTiers, loadTiers, product.id])

  const resolveTierPrice = (quantity: number, basePrice: number) => {
    const best = [...tiers].filter(t => quantity >= t.min_qty).sort((a, b) => b.min_qty - a.min_qty)[0]
    return best ? best.price : basePrice
  }

  const retailPrice = product.retail_price ?? product.base_price
  const wholesalePrice = product.wholesale_price ?? retailPrice

  const finalQty = customQty ? parseFloat(customQty) || 1 : (typeof qty === 'number' ? qty : parseFloat(qty) || 1)
  const tieredRetailPrice = resolveTierPrice(finalQty, retailPrice)
  const activeTier = [...tiers].filter(t => finalQty >= t.min_qty).sort((a, b) => b.min_qty - a.min_qty)[0]

  // Price: use variation price if set, otherwise use product price or auto-tiered retail price
  const basePrice = priceType === 'wholesale' ? wholesalePrice : tieredRetailPrice
  const effectivePrice = selectedOption && selectedOption.price > 0
    ? selectedOption.price
    : basePrice
  const cartBasePrice = selectedOption && selectedOption.price > 0
    ? selectedOption.price
    : (priceType === 'wholesale' ? wholesalePrice : retailPrice)

  const canAdd = !hasVariations || selectedOption !== null

  const handleAdd = () => {
    const q = customQty ? parseFloat(customQty) : finalQty
    if (!q || q <= 0) return
    if (!canAdd) return

    const itemName = selectedOption
      ? `${product.name} (${selectedOption.name})`
      : product.name

    const itemCost = selectedOption && selectedOption.cost > 0
      ? selectedOption.cost
      : product.base_cost

    onAdd({
      product_id: product.id,
      name: itemName,
      price: effectivePrice,
      base_price: cartBasePrice,
      retail_unit_price: selectedOption && selectedOption.price > 0 ? selectedOption.price : retailPrice,
      wholesale_unit_price: selectedOption && selectedOption.price > 0 ? selectedOption.price : wholesalePrice,
      cost: itemCost,
      quantity: q,
      is_custom: false,
      image_path: product.image_path,
      price_type: priceType,
      variation_option_id: selectedOption?.id,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-800">Set Quantity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-3 text-center">{product.name}</p>

          {/* Variation picker */}
          {hasVariations && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {product.variation_group_name || 'Select Variation'}
              </p>
              {loadingOptions ? (
                <p className="text-sm text-gray-400 text-center py-2">Loading options…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-amber-600 text-center py-2">No variations configured for this product.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedOption(opt)}
                      className={`py-2.5 px-2 rounded-xl text-sm font-semibold border-2 transition-colors truncate ${
                        selectedOption?.id === opt.id
                          ? 'bg-[#1a8eff] text-white border-[#1a8eff]'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#1a8eff]'
                      }`}
                    >
                      {opt.name}
                      {opt.price > 0 && (
                        <span className="block text-xs font-normal opacity-80">₱{opt.price.toFixed(0)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {hasVariations && !selectedOption && options.length > 0 && (
                <p className="text-xs text-amber-500 mt-1.5 text-center">Please select a variation to continue</p>
              )}
            </div>
          )}

          {/* Price display */}
          <div className="mb-4 rounded-xl bg-gray-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Price {priceType === 'wholesale' && <span className="font-semibold text-emerald-700">(Wholesale)</span>}
              </span>
              <span className="font-semibold text-gray-800">₱{effectivePrice.toFixed(2)}</span>
            </div>
            {!hasVariations && priceType === 'retail' && activeTier && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-emerald-700">{activeTier.label || `Tier @ ${activeTier.min_qty}+`}</span>
                <span className="font-semibold text-emerald-700">Auto applied</span>
              </div>
            )}
          </div>

          {!hasVariations && tiers.length > 0 && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Wholesale Tiers</p>
              <p className="mt-1 text-xs text-emerald-700">Tier price auto-applies once quantity reaches the minimum.</p>
              <div className="mt-3 space-y-2">
                {tiers.map((tier) => {
                  const isActive = activeTier?.min_qty === tier.min_qty && priceType === 'retail'
                  return (
                    <div
                      key={`${tier.min_qty}-${tier.price}-${tier.label || ''}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        isActive ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-900'
                      }`}
                    >
                      <span>{tier.label || 'Wholesale'} {tier.min_qty}+</span>
                      <span className="font-semibold">₱{tier.price.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fractions */}
          {product.allow_fractions ? (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {FRACTIONS.map(f => (
                <button key={f.label}
                  onClick={() => { setQty(f.value); setCustomQty('') }}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    qty === f.value ? 'bg-[#1a8eff] text-white border-[#1a8eff]' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#1a8eff]'
                  }`}
                >{f.label}</button>
              ))}
            </div>
          ) : null}

          {/* Whole numbers */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {WHOLE.map(n => (
              <button key={n}
                onClick={() => { setQty(n); setCustomQty('') }}
                className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  qty === n && !customQty ? 'bg-[#1a8eff] text-white border-[#1a8eff]' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#1a8eff]'
                }`}
              >{n}</button>
            ))}
          </div>

          {/* Custom quantity + Add button */}
          <div className="flex flex-col gap-2">
            <input
              value={customQty}
              onChange={e => { setCustomQty(e.target.value); setQty(parseFloat(e.target.value) || 1) }}
              placeholder="Custom Quantity"
              type="number"
              step="0.01"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-base focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
            />
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {hasVariations && !selectedOption ? 'Select a variation first' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
