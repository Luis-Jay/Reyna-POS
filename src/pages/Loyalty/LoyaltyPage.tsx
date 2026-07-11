import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { Search, Plus, Star, RotateCcw, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { getProAccessState } from '../../lib/web-api/pro-access'

interface LoyaltyAccount {
  id: string
  name: string
  phone?: string
  points: number
  total_earned: number
  total_redeemed: number
  created_at: string
}

interface LoyaltyTx {
  id: string
  type: 'earn' | 'redeem' | 'adjust'
  points: number
  note?: string
  created_at: string
}

export default function LoyaltyPage() {
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([])
  const [search, setSearch] = useState('')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isPro, setIsPro] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, LoyaltyTx[]>>({})

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', phone: '' })
  const [adding, setAdding] = useState(false)

  const [adjustModal, setAdjustModal] = useState<{ account: LoyaltyAccount; mode: 'add' | 'redeem' } | null>(null)
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const load = async () => {
    const [data, s, proAccess] = await Promise.all([
      window.api.loyalty.getAll(search || undefined),
      window.api.settings.getAll(),
      getProAccessState(),
    ])
    setAccounts(data)
    setSettings(s)
    setIsPro(proAccess.activated)
  }

  useEffect(() => { load() }, [search])

  const handleAdd = async () => {
    if (!addForm.name.trim()) return
    setAdding(true)
    await window.api.loyalty.create({ name: addForm.name.trim(), phone: addForm.phone.trim() || undefined })
    setAddForm({ name: '', phone: '' })
    setShowAdd(false)
    setAdding(false)
    load()
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!history[id]) {
      const h = await window.api.loyalty.getHistory(id)
      setHistory(prev => ({ ...prev, [id]: h }))
    }
  }

  const handleAdjust = async () => {
    if (!adjustModal || !adjustPoints) return
    const pts = parseFloat(adjustPoints)
    if (!pts || pts <= 0) return
    setAdjusting(true)
    if (adjustModal.mode === 'redeem') {
      const result = await window.api.loyalty.redeem(adjustModal.account.id, pts, undefined, adjustNote || 'Manual redeem')
      if (!result.success) { alert(result.error || 'Failed'); setAdjusting(false); return }
    } else {
      await window.api.loyalty.earn(adjustModal.account.id, pts, undefined, adjustNote || 'Manual adjustment')
    }
    setAdjustModal(null)
    setAdjustPoints('')
    setAdjustNote('')
    setAdjusting(false)
    setHistory(prev => { const n = { ...prev }; delete n[adjustModal.account.id]; return n })
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this loyalty account?')) return
    await window.api.loyalty.delete(id)
    load()
  }

  const loyaltyEnabled = settings['loyalty_enabled'] === 'true'
  const earnRate = parseFloat(settings['loyalty_rate'] || '1')
  const redeemRate = parseFloat(settings['loyalty_redeem_rate'] || '1')

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Loyalty / Sukipoints" back="/" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {!isPro && (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-white p-6 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Reyna Pro</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Loyalty cards are part of Pro</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Upgrade to unlock loyalty accounts, earning points, redemptions, and account history for this store.
              </p>
            </div>
          )}

          {/* Status banner */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${loyaltyEnabled ? 'bg-amber-50 border border-amber-200' : 'bg-gray-100 border border-gray-200'}`}>
            <div>
              <p className={`text-sm font-semibold ${loyaltyEnabled ? 'text-amber-700' : 'text-gray-500'}`}>
                Loyalty Program {loyaltyEnabled ? 'Active' : 'Disabled'}
              </p>
              {loyaltyEnabled && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Earn {earnRate} pt per ₱1 spent · Redeem {redeemRate} pt = ₱1
                </p>
              )}
            </div>
            <Star size={20} className={loyaltyEnabled ? 'text-amber-500' : 'text-gray-300'} />
          </div>

          {!loyaltyEnabled && (
            <p className="text-xs text-gray-400 text-center">
              Enable loyalty in Settings → Feature Controls to start earning/redeeming points at checkout.
            </p>
          )}

          {/* Search + Add */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff] bg-white"
              />
            </div>
            <button
              onClick={() => setShowAdd(true)}
              disabled={!isPro}
              className="flex items-center gap-1.5 bg-[#1a8eff] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0077e6]"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">New Loyalty Account</p>
              <input
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Customer name *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <input
                value={addForm.phone}
                onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">Cancel</button>
                <button onClick={handleAdd} disabled={adding || !addForm.name.trim()} className="flex-1 bg-[#1a8eff] text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                  {adding ? 'Adding...' : 'Add Account'}
                </button>
              </div>
            </div>
          )}

          {/* Accounts list */}
          {!isPro ? (
            <div className="py-16 text-center text-gray-400 text-sm">Upgrade to Pro to use loyalty features.</div>
          ) : accounts.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No loyalty accounts yet</div>
          ) : (
            <div className="space-y-2">
              {accounts.map(acc => (
                <div key={acc.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => handleExpand(acc.id)}>
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Star size={16} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{acc.name}</p>
                      {acc.phone && <p className="text-xs text-gray-400">{acc.phone}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-amber-600">{acc.points.toFixed(0)}</p>
                      <p className="text-xs text-gray-400">pts</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setAdjustModal({ account: acc, mode: 'add' }); setAdjustPoints(''); setAdjustNote('') }}
                        className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"
                        title="Add points"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setAdjustModal({ account: acc, mode: 'redeem' }); setAdjustPoints(''); setAdjustNote('') }}
                        className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"
                        title="Redeem points"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(acc.id) }}
                        className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                      {expandedId === acc.id ? <ChevronUp size={14} className="text-gray-400 ml-1" /> : <ChevronDown size={14} className="text-gray-400 ml-1" />}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">
                    <div className="bg-white px-3 py-2 text-center">
                      <p className="text-xs text-gray-400">Total Earned</p>
                      <p className="text-sm font-semibold text-gray-700">{acc.total_earned.toFixed(0)} pts</p>
                    </div>
                    <div className="bg-white px-3 py-2 text-center">
                      <p className="text-xs text-gray-400">Total Redeemed</p>
                      <p className="text-sm font-semibold text-gray-700">{acc.total_redeemed.toFixed(0)} pts</p>
                    </div>
                  </div>

                  {/* History */}
                  {expandedId === acc.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Activity</p>
                      {(history[acc.id] || []).length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">No transactions yet</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(history[acc.id] || []).map(tx => (
                            <div key={tx.id} className="flex items-center justify-between">
                              <div>
                                <span className={`text-xs font-semibold capitalize ${tx.type === 'earn' ? 'text-amber-600' : tx.type === 'redeem' ? 'text-green-600' : 'text-blue-600'}`}>
                                  {tx.type}
                                </span>
                                {tx.note && <span className="text-xs text-gray-400 ml-1">· {tx.note}</span>}
                                <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleString()}</p>
                              </div>
                              <span className={`text-sm font-bold ${tx.type === 'redeem' ? 'text-red-500' : 'text-amber-600'}`}>
                                {tx.type === 'redeem' ? '-' : '+'}{tx.points.toFixed(0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Adjust / Redeem modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800">
              {adjustModal.mode === 'add' ? 'Add Points' : 'Redeem Points'} — {adjustModal.account.name}
            </h2>
            <p className="text-sm text-gray-500">Current balance: <strong>{adjustModal.account.points.toFixed(0)} pts</strong></p>
            <input
              value={adjustPoints}
              onChange={e => setAdjustPoints(e.target.value)}
              type="number"
              placeholder="Points"
              className="w-full border-2 border-[#1a8eff] rounded-xl px-4 py-3 text-xl text-center font-bold focus:outline-none"
              autoFocus
            />
            <input
              value={adjustNote}
              onChange={e => setAdjustNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
            />
            <div className="flex gap-3">
              <button onClick={() => setAdjustModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium text-sm">Cancel</button>
              <button
                onClick={handleAdjust}
                disabled={adjusting || !adjustPoints}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-white text-sm disabled:opacity-50 ${adjustModal.mode === 'redeem' ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {adjusting ? 'Processing...' : adjustModal.mode === 'add' ? 'Add Points' : 'Redeem'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
