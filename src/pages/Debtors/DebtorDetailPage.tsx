import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Debtor, DebtorTransaction } from '../../types'
import { formatDate } from '../../utils/format'
import { CreditCard, Plus, FileText, ArrowDown, ArrowUp, Minus } from 'lucide-react'

const TX_FILTERS = ['All', 'This Month', 'Last Month']

export default function DebtorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [debtor, setDebtor] = useState<Debtor | null>(null)
  const [transactions, setTransactions] = useState<DebtorTransaction[]>([])
  const [filter, setFilter] = useState('All')
  const [modal, setModal] = useState<'payment' | 'debt' | 'note' | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const load = async () => {
    const [d, txs] = await Promise.all([
      window.api.debtors.getById(id!),
      window.api.debtors.getTransactions(id!, filter === 'All' ? undefined : filter),
    ])
    setDebtor(d)
    setTransactions(txs)
  }

  useEffect(() => { load() }, [id, filter])

  const handleTx = async (type: 'payment' | 'debt' | 'note') => {
    await window.api.debtors.addTransaction({
      debtor_id: id,
      type,
      amount: parseFloat(amount) || 0,
      note: note || null,
    })
    setModal(null)
    setAmount('')
    setNote('')
    load()
  }

  if (!debtor) return null

  const txIcon = (type: string) => ({
    debt: <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><ArrowUp size={14} className="text-red-500" /></div>,
    payment: <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><ArrowDown size={14} className="text-green-500" /></div>,
    note: <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><FileText size={14} className="text-gray-500" /></div>,
  }[type] || null)

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title={debtor.name} back="/debtors" />
      <div className="flex-1 overflow-y-auto">
        {/* Summary */}
        <div className="bg-white p-6 text-center border-b">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Outstanding Debt</p>
          <p className="text-4xl font-bold text-red-500">₱{debtor.balance.toFixed(2)}</p>
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
                <p className="font-medium text-gray-800 capitalize">{tx.type === 'debt' ? 'Added Debt' : tx.type === 'payment' ? 'Payment' : 'Note'}</p>
                {tx.note && <p className="text-sm text-gray-500">{tx.note}</p>}
                <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
              </div>
              {tx.type !== 'note' && (
                <div className="text-right">
                  <p className={`font-bold ${tx.type === 'payment' ? 'text-green-500' : 'text-red-500'}`}>
                    {tx.type === 'payment' ? '-' : '+'}₱{tx.amount.toFixed(2)}
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
