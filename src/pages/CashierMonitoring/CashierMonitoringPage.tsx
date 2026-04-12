import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { Clock, LogIn, LogOut, Plus, X, Check, ChevronDown, ChevronUp } from 'lucide-react'

type Shift = {
  id: string
  user_id: string
  cashier_name: string
  start_money: number
  end_money: number | null
  time_in: string
  time_out: string | null
  petty_cash_total: number
  note: string | null
}

type User = { id: string; name: string; role: string }

const fmt = (n: number) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const fmtDt = (s: string) => new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const duration = (timeIn: string, timeOut: string | null) => {
  const ms = (timeOut ? new Date(timeOut) : new Date()).getTime() - new Date(timeIn).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

export default function CashierMonitoringPage() {
  const [activeShifts, setActiveShifts] = useState<Shift[]>([])
  const [allShifts, setAllShifts] = useState<Shift[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tab, setTab] = useState<'active' | 'history'>('active')

  // Time-in modal
  const [showTimeIn, setShowTimeIn] = useState(false)
  const [tiUserId, setTiUserId] = useState('')
  const [tiMoney, setTiMoney] = useState('')
  const [tiNote, setTiNote] = useState('')
  const [tiSaving, setTiSaving] = useState(false)
  const [tiError, setTiError] = useState('')

  // Time-out modal
  const [showTimeOut, setShowTimeOut] = useState<Shift | null>(null)
  const [toMoney, setToMoney] = useState('')
  const [toNote, setToNote] = useState('')
  const [toSaving, setToSaving] = useState(false)

  // Petty cash modal
  const [showPetty, setShowPetty] = useState<Shift | null>(null)
  const [pettyDesc, setPettyDesc] = useState('')
  const [pettyAmt, setPettyAmt] = useState('')
  const [pettyItems, setPettyItems] = useState<any[]>([])
  const [pettySaving, setPettySaving] = useState(false)

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = async () => {
    const [active, all, userList] = await Promise.all([
      window.api.shifts.getActive(),
      window.api.shifts.getAll({}),
      window.api.auth.getUsers(),
    ])
    setActiveShifts(active)
    setAllShifts(all)
    setUsers(userList)
  }

  useEffect(() => { load() }, [])

  const handleTimeIn = async () => {
    if (!tiUserId) return setTiError('Select a cashier.')
    setTiSaving(true)
    const res = await window.api.shifts.timeIn({ userId: tiUserId, startMoney: parseFloat(tiMoney) || 0, note: tiNote })
    setTiSaving(false)
    if (!res.success) return setTiError(res.error || 'Failed.')
    setShowTimeIn(false); setTiUserId(''); setTiMoney(''); setTiNote(''); setTiError('')
    load()
  }

  const handleTimeOut = async () => {
    if (!showTimeOut) return
    setToSaving(true)
    await window.api.shifts.timeOut({ shiftId: showTimeOut.id, endMoney: parseFloat(toMoney) || 0, note: toNote })
    setToSaving(false)
    setShowTimeOut(null); setToMoney(''); setToNote('')
    load()
  }

  const openPetty = async (shift: Shift) => {
    setShowPetty(shift)
    const items = await window.api.shifts.getPettyCash(shift.id)
    setPettyItems(items)
  }

  const handleAddPetty = async () => {
    if (!showPetty || !pettyDesc || !pettyAmt) return
    setPettySaving(true)
    await window.api.shifts.addPettyCash({ shiftId: showPetty.id, description: pettyDesc, amount: parseFloat(pettyAmt) || 0 })
    setPettySaving(false)
    setPettyDesc(''); setPettyAmt('')
    const items = await window.api.shifts.getPettyCash(showPetty.id)
    setPettyItems(items)
    load()
  }

  const toggleExpand = (id: string) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const unusedUsers = users.filter(u => !activeShifts.find(s => s.user_id === u.id))

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Cashier Monitoring" back="/" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-4">

          {/* Tabs + Time In button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['active','history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-[#1a8eff] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                  {t === 'active' ? `Active Shifts (${activeShifts.length})` : 'History'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowTimeIn(true)}
              className="flex items-center gap-2 bg-[#1a8eff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0077e6]">
              <LogIn size={15} /> Time In
            </button>
          </div>

          {/* Active Shifts */}
          {tab === 'active' && (
            activeShifts.length === 0
              ? <div className="bg-white rounded-xl p-10 text-center text-sm text-gray-400 shadow-sm">No active shifts.</div>
              : activeShifts.map(shift => (
                <div key={shift.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-[#1a8eff] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {shift.cashier_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{shift.cashier_name}</p>
                      <p className="text-xs text-gray-500">Time in: {fmtDt(shift.time_in)} · {duration(shift.time_in, null)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">Start Money</p>
                      <p className="font-bold text-gray-900">{fmt(shift.start_money)}</p>
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button onClick={() => openPetty(shift)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-medium">
                        Petty Cash
                      </button>
                      <button onClick={() => { setShowTimeOut(shift); setToMoney('') }}
                        className="text-xs px-2 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-medium flex items-center gap-1">
                        <LogOut size={13} /> Time Out
                      </button>
                    </div>
                  </div>
                  {shift.petty_cash_total > 0 && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                      <p className="text-xs text-amber-700">Petty Cash Used: <span className="font-semibold">{fmt(shift.petty_cash_total)}</span></p>
                    </div>
                  )}
                </div>
              ))
          )}

          {/* History */}
          {tab === 'history' && (
            allShifts.filter(s => s.time_out).length === 0
              ? <div className="bg-white rounded-xl p-10 text-center text-sm text-gray-400 shadow-sm">No completed shifts yet.</div>
              : allShifts.filter(s => s.time_out).map(shift => {
                const isExpanded = expanded.has(shift.id)
                const diff = (shift.end_money ?? 0) - shift.start_money - shift.petty_cash_total
                return (
                  <div key={shift.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpand(shift.id)}>
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0">
                        {shift.cashier_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{shift.cashier_name}</p>
                        <p className="text-xs text-gray-500">{fmtDt(shift.time_in)} → {shift.time_out ? fmtDt(shift.time_out) : '—'} · {duration(shift.time_in, shift.time_out)}</p>
                      </div>
                      <span className={`text-sm font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-3 border-t border-gray-100 text-sm space-y-1 pt-2">
                        <div className="flex justify-between text-gray-600"><span>Start Money</span><span>{fmt(shift.start_money)}</span></div>
                        <div className="flex justify-between text-gray-600"><span>End Money</span><span>{fmt(shift.end_money ?? 0)}</span></div>
                        <div className="flex justify-between text-gray-600"><span>Petty Cash</span><span>-{fmt(shift.petty_cash_total)}</span></div>
                        <div className="flex justify-between font-semibold border-t border-gray-100 pt-1">
                          <span>Difference</span>
                          <span className={diff >= 0 ? 'text-green-600' : 'text-red-500'}>{diff >= 0 ? '+' : ''}{fmt(diff)}</span>
                        </div>
                        {shift.note && <p className="text-xs text-gray-500 mt-1">Note: {shift.note}</p>}
                      </div>
                    )}
                  </div>
                )
              })
          )}
        </div>
      </div>

      {/* Time In modal */}
      {showTimeIn && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Clock size={18} /> Time In</h3>
              <button onClick={() => { setShowTimeIn(false); setTiError('') }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cashier</label>
                <select value={tiUserId} onChange={e => { setTiUserId(e.target.value); setTiError('') }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
                  <option value="">Select cashier...</option>
                  {unusedUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Money (₱)</label>
                <input type="number" min="0" value={tiMoney} onChange={e => setTiMoney(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={tiNote} onChange={e => setTiNote(e.target.value)} placeholder="..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
              {tiError && <p className="text-xs text-red-500">{tiError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowTimeIn(false); setTiError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
              <button onClick={handleTimeIn} disabled={tiSaving}
                className="flex-1 py-2.5 rounded-xl bg-[#1a8eff] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                <Check size={16} /> {tiSaving ? 'Saving...' : 'Clock In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Out modal */}
      {showTimeOut && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><LogOut size={18} /> Time Out — {showTimeOut.cashier_name}</h3>
              <button onClick={() => setShowTimeOut(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Start Money</span><span className="font-medium">{fmt(showTimeOut.start_money)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Petty Cash Used</span><span className="font-medium text-amber-600">-{fmt(showTimeOut.petty_cash_total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-medium">{duration(showTimeOut.time_in, null)}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Money (₱)</label>
                <input type="number" min="0" value={toMoney} onChange={e => setToMoney(e.target.value)}
                  placeholder="0.00" autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
              {toMoney && (
                <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${(parseFloat(toMoney)||0) - showTimeOut.start_money - showTimeOut.petty_cash_total >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  Difference: {fmt((parseFloat(toMoney)||0) - showTimeOut.start_money - showTimeOut.petty_cash_total)}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={toNote} onChange={e => setToNote(e.target.value)} placeholder="..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowTimeOut(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
              <button onClick={handleTimeOut} disabled={toSaving}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                <LogOut size={16} /> {toSaving ? 'Saving...' : 'Clock Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Petty Cash modal */}
      {showPetty && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Petty Cash — {showPetty.cashier_name}</h3>
              <button onClick={() => setShowPetty(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Existing entries */}
            {pettyItems.length > 0 && (
              <div className="mb-3 max-h-36 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {pettyItems.map((item: any) => (
                  <div key={item.id} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-gray-700">{item.description}</span>
                    <span className="font-medium text-amber-700">{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <input value={pettyDesc} onChange={e => setPettyDesc(e.target.value)} placeholder="Description (e.g. Supplies)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
              <input type="number" value={pettyAmt} onChange={e => setPettyAmt(e.target.value)} placeholder="Amount (₱)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowPetty(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">Close</button>
              <button onClick={handleAddPetty} disabled={pettySaving || !pettyDesc || !pettyAmt}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                <Plus size={15} /> {pettySaving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
