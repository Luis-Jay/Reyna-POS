import { useState } from 'react'
import { X } from 'lucide-react'
import { Product } from '../../types'

const FRACTIONS = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 0.333 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
]
const WHOLE = [1, 2, 3, 4, 5, 10, 15, 20]

interface Props {
  product: Product
  onClose: () => void
  onAdd: (item: any) => void
}

export default function QuantityModal({ product, onClose, onAdd }: Props) {
  const [qty, setQty] = useState<number | string>(1)
  const [customQty, setCustomQty] = useState('')
  const retailPrice = product.retail_price ?? product.base_price
  const wholesalePrice = product.wholesale_price ?? retailPrice
  const hasWholesale = wholesalePrice > 0 && wholesalePrice !== retailPrice
  const [priceType, setPriceType] = useState<'retail' | 'wholesale'>('retail')

  const finalQty = typeof qty === 'number' ? qty : parseFloat(qty) || 1
  const selectedPrice = priceType === 'wholesale' ? wholesalePrice : retailPrice

  const handleAdd = () => {
    const q = customQty ? parseFloat(customQty) : finalQty
    if (!q || q <= 0) return
    onAdd({
      product_id: product.id,
      name: product.name,
      price: selectedPrice,
      base_price: retailPrice,
      cost: product.base_cost,
      quantity: q,
      is_custom: false,
      image_path: product.image_path,
      price_type: priceType,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Set Quantity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-3 text-center">{product.name}</p>

          <div className="mb-4 rounded-xl bg-gray-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Retail</span>
              <span className="font-semibold text-gray-800">₱{retailPrice.toFixed(2)}</span>
            </div>
            {hasWholesale && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-gray-500">Wholesale</span>
                <span className="font-semibold text-emerald-700">₱{wholesalePrice.toFixed(2)}</span>
              </div>
            )}
          </div>

          {hasWholesale && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPriceType('retail')}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${priceType === 'retail' ? 'border-[#1a8eff] bg-[#1a8eff] text-white' : 'border-gray-200 bg-white text-gray-700'}`}
              >
                Retail
              </button>
              <button
                onClick={() => setPriceType('wholesale')}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${priceType === 'wholesale' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
              >
                Wholesale
              </button>
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

          {/* Custom quantity */}
          <div className="flex flex-col gap-2">
            <input
              value={customQty}
              onChange={e => { setCustomQty(e.target.value); setQty(parseFloat(e.target.value) || 1) }}
              placeholder="Custom Quantity"
              type="number"
              step="0.01"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-base focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
            />
            <button onClick={handleAdd}
              className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold hover:bg-green-600">
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
