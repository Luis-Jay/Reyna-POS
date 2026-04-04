import { useState } from 'react'
import { X } from 'lucide-react'

interface Props { onClose: () => void; onSave: (name: string) => void }

export default function SaveOrderModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-2">Save Order for Later</h2>
        <p className="text-sm text-gray-500 mb-4">Enter a name for this order to save it. The current cart will be cleared.</p>
        <label className="block text-sm font-medium text-gray-700 mb-1">Order Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Customer's name, Table 5"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
          autoFocus
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()}
            className="flex-1 bg-[#1a8eff] text-white py-2.5 rounded-xl font-semibold disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  )
}
