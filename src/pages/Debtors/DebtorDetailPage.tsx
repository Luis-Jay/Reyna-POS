import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Debtor, DebtorTransaction } from '../../types'
import { formatDate } from '../../utils/format'
import { CreditCard, Plus, FileText, ArrowDown, ArrowUp, BellRing, LockKeyhole, Save, MessageSquare } from 'lucide-react'

const TX_FILTERS = ['All', 'This Month', 'Last Month']

export default function DebtorDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [debtor, setDebtor] = useState<Debtor | null>(null)
  const [transactions, setTransactions] = useState<DebtorTransaction[]>([])
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState<'payment' | 'debt' | 'note' | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [phone, setPhone] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [sendingSms, setSendingSms] = useState(false)
  const [smsResult, setSmsResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [isPro, setIsPro] = useState(false)

  const load = async () => {
    const [d, txs] = await Promise.all([
      window.api.debtors.getById(id!),
      window.api.debtors.getTransactions(id!, filter === 'All' ? undefined : filter),
    ])
    setDebtor(d)
    setTransactions(txs)
    setPhone(d?.phone || '')
    setCreditLimit(d?.credit_limit ? String(d.credit_limit) : '')
    setDueDate(d?.due_date || '')
    setFollowUpDate(d?.follow_up_date || '')
  }

  useEffect(() => { load() }, [id, filter])
  useEffect(() => {
    window.api.activation.getStatus().then(status => setIsPro(status.activated === true))
  }, [])

  const handleTx = async (type: 'payment' | 'debt' | 'note') => {
    const result = await window.api.debtors.addTransaction({
      debtor_id: id,
      type,
      amount: parseFloat(amount) || 0,
      note: note || null,
    })
    if (!result?.success) {
      alert(result?.error || 'Failed to save debtor transaction.')
      return
    }
    setModal(null)
    setAmount('')
    setNote('')
    load()
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await window.api.debtors.update(id!, {
        phone,
        credit_limit: parseFloat(creditLimit) || 0,
        due_date: dueDate || null,
        follow_up_date: followUpDate || null,
      })
      load()
    } catch (error) {
      console.error('Failed to update debtor profile:', error)
      alert(`Failed to update debtor profile: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSendSms = async () => {
    if (!debtor?.phone) return
    setSendingSms(true)
    setSmsResult(null)
    try {
      const storeName = (await window.api.settings.get('store_name')) || 'Your Store'
      const message = `Hi ${debtor.name}, this is a reminder from ${storeName}. Your outstanding balance is ₱${debtor.balance.toFixed(2)}. Please settle at your earliest convenience. Thank you!`
      const res = await window.api.sms.send(debtor.phone, message)
      if (res.success) {
        setSmsResult({ ok: true, msg: `SMS sent! Credits remaining: ${res.credits_remaining}` })
        await window.api.debtors.markReminder(id!, 'SMS reminder sent via Semaphore.')
        load()
      } else {
        setSmsResult({ ok: false, msg: res.error || 'Failed to send SMS.' })
      }
    } catch (err: any) {
      setSmsResult({ ok: false, msg: err?.message || 'Failed to send SMS.' })
    } finally {
      setSendingSms(false)
    }
  }

  const handleMarkReminder = async () => {
    setSendingReminder(true)
    try {
      await window.api.debtors.markReminder(id!, 'Reminder marked as sent from debtor follow-up panel.')
      load()
    } catch (error) {
      alert(`Failed to mark reminder: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSendingReminder(false)
    }
  }

  if (!debtor) return null

  const txIcon = (type: string) => ({
    debt: <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><ArrowUp size={14} className="text-red-500" /></div>,
    payment: <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><ArrowDown size={14} className="text-green-500" /></div>,
    note: <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><FileText size={14} className="text-gray-500" /></div>,
  }[type] || null)

  const txLabel = (tx: DebtorTransaction) => {
    if (tx.type === 'note') return 'Note'
    if (tx.type === 'payment') return 'Payment'
    return tx.amount < 0 ? 'Debt Adjustment' : 'Added Debt'
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title={debtor.name} back="/debtors" />
      <div className="flex-1 overflow-y-auto">
        {/* Summary */}
        <div className="bg-white p-6 text-center border-b">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Outstanding Debt</p>
          <p className="text-4xl font-bold text-red-500">₱{debtor.balance.toFixed(2)}</p>
          {(debtor as any).credit_limit > 0 && (
            <div className="mt-2 mx-auto max-w-xs">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Credit used</span>
                <span className={debtor.balance >= (debtor as any).credit_limit ? 'text-red-500 font-semibold' : ''}>
                  ₱{debtor.balance.toFixed(2)} / ₱{(debtor as any).credit_limit.toFixed(2)}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${debtor.balance >= (debtor as any).credit_limit ? 'bg-red-500' : 'bg-orange-400'}`}
                  style={{ width: `${Math.min(100, (debtor.balance / (debtor as any).credit_limit) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-center gap-8 mt-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase">Total Credit</p>
              <p className="font-bold text-gray-800">₱{debtor.total_credit.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase">Total Paid</p>
              <p className="font-bold text-green-600">₱{debtor.total_paid.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Follow-up details</p>
                <p className="text-xs text-gray-400">Keep debtor reminders, due dates, and contact details organized in one place.</p>
              </div>
              {isPro ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Pro Active</span>
              ) : (
                <button
                  onClick={() => navigate('/pro')}
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#1a8eff] hover:bg-blue-100"
                >
                  Unlock Pro Reminders
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</span>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+639123456789"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Credit Limit (₱)</span>
                <input
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0 = no limit"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Due Date</span>
                <input
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  type="date"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Next Follow Up</span>
                <input
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  type="date"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="rounded-xl bg-[#1a8eff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0077e6] disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2"><Save size={16} /> {savingProfile ? 'Saving...' : 'Save Follow-up Details'}</span>
              </button>

              {isPro ? (
                <button
                  onClick={handleMarkReminder}
                  disabled={sendingReminder}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2"><BellRing size={16} /> {sendingReminder ? 'Saving...' : 'Mark Reminder Sent'}</span>
                </button>
              ) : (
                <button
                  onClick={() => navigate('/pro')}
                  className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-[#1a8eff] hover:bg-blue-50"
                >
                  <span className="inline-flex items-center gap-2"><LockKeyhole size={16} /> Pro Reminder Tools</span>
                </button>
              )}

              {debtor.phone && (
                <button
                  onClick={handleSendSms}
                  disabled={sendingSms}
                  className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2"><MessageSquare size={16} /> {sendingSms ? 'Sending...' : 'Send SMS Reminder'}</span>
                </button>
              )}

              {smsResult && (
                <p className={`text-xs rounded-lg px-3 py-2 ${smsResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {smsResult.msg}
                </p>
              )}

              {debtor.last_reminder_at && (
                <p className="text-xs text-gray-400">Last reminder: {formatDate(debtor.last_reminder_at)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="px-4 py-3">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
            {TX_FILTERS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>

        {/* Transactions */}
        <div className="px-4 space-y-2">
          {transactions.map(tx => (
            <div key={tx.id} className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm">
              {txIcon(tx.type)}
              <div className="flex-1">
                <p className="font-medium text-gray-800 capitalize">{txLabel(tx)}</p>
                {tx.note && <p className="text-sm text-gray-500">{tx.note}</p>}
                <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
              </div>
              {tx.type !== 'note' && (
                <div className="text-right">
                  <p className={`font-bold ${tx.type === 'payment' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'payment' ? '-' : tx.amount < 0 ? '-' : '+'}₱{Math.abs(tx.amount).toFixed(2)}
                  </p>
                  {tx.profit > 0 && <p className="text-xs text-green-500">+₱{tx.profit.toFixed(2)}</p>}
                </div>
              )}
            </div>
          ))}
          {transactions.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No transactions</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t bg-white p-4 grid grid-cols-3 gap-3 shrink-0">
        <button onClick={() => setModal('payment')}
          className="bg-green-500 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-600">
          <CreditCard size={18} /> Payment
        </button>
        <button onClick={() => setModal('debt')}
          className="bg-red-500 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-red-600">
          <Plus size={18} /> Add Items
        </button>
        <button onClick={() => setModal('note')}
          className="bg-gray-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-700">
          <FileText size={18} /> Note
        </button>
      </div>

      {/* Transaction Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 capitalize">
              {modal === 'payment' ? 'Record Payment' : modal === 'debt' ? 'Add Debt' : 'Add Note'}
            </h2>
            {modal !== 'note' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number"
                  className="w-full border-2 border-[#1a8eff] rounded-xl px-4 py-3 text-xl text-center font-bold focus:outline-none"
                  autoFocus />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                autoFocus={modal === 'note'} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium">Cancel</button>
              <button onClick={() => handleTx(modal)}
                className={`flex-1 text-white py-2.5 rounded-xl font-semibold ${modal === 'payment' ? 'bg-green-500 hover:bg-green-600' : modal === 'debt' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700'}`}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
