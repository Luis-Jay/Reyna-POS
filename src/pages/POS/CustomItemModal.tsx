import { useState } from 'react'
import { X } from 'lucide-react'

interface Props { onClose: () => void; onAdd: (item: any) => void }

export default function CustomItemModal({ onClose, onAdd }: Props) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')

  const handleAdd = () => {
    if (!name.trim() || !price) return
    onAdd({ name: name.trim(), price: parseFloat(price), base_price: parseFloat(price), cost: parseFloat(cost) || parseFloat(price), quantity: 1, is_custom: true })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Custom Item / Service</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="SERVICE FEE"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (₱)</label>
            <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="0.00"
              className="w-full border-2 border-[#1a8eff] rounded-lg px-3 py-2 text-lg font-bold focus:outline-none" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cost (₱) — Optional</label>
            <input value={cost} onChange={e => setCost(e.target.value)} type="number" placeholder="Leave blank to use price"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdd} disabled={!name || !price}
              className="flex-1 bg-green-500 text-white py-2.5 rounded-xl font-semibold hover:bg-green-600 disabled:opacity-40">Add Item</button>
          </div>
        </div>
      </div>
    </div>
  )
}
