import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Debtor } from '../../types'
import { Plus, Search } from 'lucide-react'
import { formatShortDate } from '../../utils/format'

export default function DebtorsPage() {
  const navigate = useNavigate()
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('High to Low')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const load = async () => {
    const data = await window.api.debtors.getAll({ search, sort })
    setDebtors(data)
  }

  useEffect(() => { load() }, [search, sort])

  const withBalance = debtors.filter(d => d.balance > 0)
  const totalOutstanding = debtors.reduce((s, d) => s + d.balance, 0)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  const overdueCount = debtors.filter(d => d.balance > 0 && d.due_date && d.due_date < today).length
  const followUpCount = debtors.filter(d => d.follow_up_date && d.follow_up_date <= today).length

  const handleAdd = async () => {
    if (!newName.trim()) return
    await window.api.debtors.create({ name: newName.trim(), phone: newPhone })
    setNewName('')
    setNewPhone('')
    setShowAdd(false)
    load()
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Debtors" back="/" actions={
        <button onClick={() => setShowAdd(true)}
          className="bg-white text-[#1a8eff] text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-blue-50">
          <Plus size={14} /> Add Debtor
        </button>
      } />

      <div className="flex-1 overflow-y-auto">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 p-4 xl:grid-cols-4">
          <div className="bg-white rounded-xl p-4 border-l-4 border-red-400">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-500">₱{totalOutstanding.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-orange-400">
            <p className="text-xs text-gray-500 uppercase tracking-wide">With Balance</p>
            <p className="text-2xl font-bold text-gray-800">{withBalance.length} <span className="text-sm font-normal text-gray-400">people</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-amber-400">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Overdue</p>
            <p className="text-2xl font-bold text-amber-600">{overdueCount}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border-l-4 border-blue-400">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Follow Up Today</p>
            <p className="text-2xl font-bold text-blue-600">{followUpCount}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 pb-3 flex gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search debtors..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
            <option>High to Low</option>
            <option>Low to High</option>
            <option>A-Z</option>
          </select>
        </div>

        {/* List */}
        <div className="px-4 grid grid-cols-2 gap-3">
          {debtors.map(d => (
            <button key={d.id} onClick={() => navigate(`/debtors/${d.id}`)}
              className="bg-white rounded-xl p-4 text-left hover:shadow-md transition-shadow border border-gray-100">
              <p className="font-semibold text-gray-800">{d.name}</p>
              <p className={`text-xl font-bold ${d.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                ₱{d.balance.toFixed(2)}
              </p>
              {d.due_date && <p className="text-xs text-gray-500 mt-1">Due: {formatShortDate(d.due_date)}</p>}
              {d.follow_up_date && <p className="text-xs text-blue-500 mt-1">Follow up: {formatShortDate(d.follow_up_date)}</p>}
              {d.last_activity && (
                <p className="text-xs text-gray-400 mt-1">Last activity: {formatShortDate(d.last_activity)}</p>
              )}
            </button>
          ))}
          {debtors.length === 0 && (
            <p className="col-span-2 text-gray-400 text-sm text-center py-8">No debtors found</p>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add Debtor</h2>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Full Name *" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleAdd} disabled={!newName.trim()}
                className="flex-1 bg-[#1a8eff] text-white py-2.5 rounded-xl font-semibold disabled:opacity-40">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
