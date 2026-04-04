import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { SavedOrder } from '../../types'
import { formatDate } from '../../utils/format'

interface Props {
  onClose: () => void
  onLoad: (order: SavedOrder) => void
  onDelete: (id: string) => void
}

export default function SavedOrdersModal({ onClose, onLoad, onDelete }: Props) {
  const [orders, setOrders] = useState<SavedOrder[]>([])

  useEffect(() => {
    window.api.orders.getSaved().then(setOrders)
  }, [])

  const handleDelete = (id: string) => {
    setOrders(o => o.filter(x => x.id !== id))
    onDelete(id)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Saved Orders</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No saved orders</p>
          ) : orders.map(o => (
            <div key={o.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-800">{o.name}</p>
                  <p className="text-xs text-gray-400">{JSON.parse(o.items_json).length} items • Saved: {formatDate(o.created_at)}</p>
                </div>
                <span className="text-[#1a8eff] font-bold">₱{o.total.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDelete(o.id)}
                  className="flex-1 bg-red-50 text-red-500 py-2 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center justify-center gap-1">
                  <Trash2 size={14} /> Delete
                </button>
                <button onClick={() => onLoad(o)}
                  className="flex-1 bg-[#1a8eff] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#0077e6]">
                  Load
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
