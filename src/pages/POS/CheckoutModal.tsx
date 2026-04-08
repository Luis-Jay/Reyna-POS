import { useState } from 'react'
import { X, Tag, User } from 'lucide-react'
import { useCartStore } from '../../stores/cart.store'
import { useAuthStore } from '../../stores/auth.store'
import { formatCurrency } from '../../utils/format'
import { PaymentEntry, PaymentMethod } from '../../types'

const QUICK_AMOUNTS = [100, 200, 500, 1000]
const PAYMENT_MODES: Array<{ key: 'cash' | 'gcash' | 'card' | 'split'; label: string }> = [
  { key: 'cash', label: 'Cash' },
  { key: 'gcash', label: 'GCash' },
  { key: 'card', label: 'Card' },
  { key: 'split', label: 'Split Payment' },
]

interface Props { onClose: () => void; onComplete: () => void }

export default function CheckoutModal({ onClose, onComplete }: Props) {
  const cart = useCartStore()
  const { user } = useAuthStore()
  const [paymentMode, setPaymentMode] = useState<'cash' | 'gcash' | 'card' | 'split'>('cash')
  const [paymentInput, setPaymentInput] = useState(cart.total().toFixed(2))
  const [splitPayments, setSplitPayments] = useState<Record<PaymentMethod, string>>({
    cash: cart.total().toFixed(2),
    gcash: '',
    card: '',
  })
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState(cart.customerName)
  const [showNameInput, setShowNameInput] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)
  const [error, setError] = useState('')

  const total = cart.total()
  const singlePayment = Math.max(0, parseFloat(paymentInput) || 0)
  const cashSplit = Math.max(0, parseFloat(splitPayments.cash) || 0)
  const gcashSplit = Math.max(0, parseFloat(splitPayments.gcash) || 0)
  const cardSplit = Math.max(0, parseFloat(splitPayments.card) || 0)
  const totalPaid = paymentMode === 'split' ? cashSplit + gcashSplit + cardSplit : singlePayment
  const change = paymentMode === 'cash' || paymentMode === 'split' ? Math.max(0, totalPaid - total) : 0

  const paymentBreakdown: PaymentEntry[] = paymentMode === 'split'
    ? ([
        { method: 'cash', amount: cashSplit },
        { method: 'gcash', amount: gcashSplit },
        { method: 'card', amount: cardSplit },
      ] as PaymentEntry[]).filter(entry => entry.amount > 0)
    : totalPaid > 0
      ? [{ method: paymentMode as PaymentMethod, amount: totalPaid }]
      : []

  const applyQuickAmount = (amount: number) => {
    if (paymentMode === 'split') {
      setSplitPayments(prev => ({ ...prev, cash: amount.toFixed(2) }))
    } else {
      setPaymentInput(amount.toFixed(2))
    }
    setError('')
  }

  const handleConfirm = async () => {
    if (totalPaid < total) { setError('Payment is less than total'); return }
    if (paymentBreakdown.length === 0) { setError('Enter at least one payment amount.'); return }
    setLoading(true)
    try {
      const result = await window.api.orders.create({
        customer_name: customerName || null,
        subtotal: cart.subtotal(),
        discount: cart.discount,
        total,
        payment_amount: totalPaid,
        change_amount: change,
        payment_breakdown: paymentBreakdown,
        is_credit: false,
        user_id: user?.id,
        items: cart.items.map(i => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          cost: i.cost,
          quantity: i.quantity,
          subtotal: i.subtotal,
          is_custom: i.is_custom,
        })),
      })
      if (result.success) {
        // Print receipt
        await window.api.printer.printReceipt(result.order)
        onComplete()
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Checkout</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer name */}
          {showNameInput ? (
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              autoFocus
            />
          ) : (
            <button onClick={() => setShowNameInput(true)} className="flex items-center gap-2 text-[#1a8eff] text-sm hover:underline">
              <User size={14} /> {customerName || '+ Add Name'}
            </button>
          )}

          {/* Discount */}
          {showDiscount ? (
            <div className="flex gap-2">
              <input
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                placeholder="Discount amount..."
                type="number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <button
                onClick={() => { cart.setDiscount(parseFloat(discountInput) || 0); setShowDiscount(false) }}
                className="bg-[#1a8eff] text-white px-3 py-2 rounded-lg text-sm font-medium"
              >Apply</button>
            </div>
          ) : (
            <button onClick={() => setShowDiscount(true)} className="flex items-center gap-2 text-[#1a8eff] text-sm hover:underline">
              <Tag size={14} /> + Add Discount {cart.discount > 0 && `(₱${cart.discount})`}
            </button>
          )}

          {/* Total */}
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount Due</p>
            <p className="text-4xl font-bold text-[#1a8eff]">{formatCurrency(total)}</p>
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-2">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map(mode => (
                <button
                  key={mode.key}
                  onClick={() => {
                    setPaymentMode(mode.key)
                    setError('')
                    if (mode.key !== 'split') setPaymentInput(total.toFixed(2))
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    paymentMode === mode.key
                      ? 'border-[#1a8eff] bg-blue-50 text-[#1a8eff]'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMode === 'split' ? (
            <div className="space-y-3">
              <SplitInput
                label="Cash"
                value={splitPayments.cash}
                onChange={value => { setSplitPayments(prev => ({ ...prev, cash: value })); setError('') }}
              />
              <SplitInput
                label="GCash"
                value={splitPayments.gcash}
                onChange={value => { setSplitPayments(prev => ({ ...prev, gcash: value })); setError('') }}
              />
              <SplitInput
                label="Card"
                value={splitPayments.card}
                onChange={value => { setSplitPayments(prev => ({ ...prev, card: value })); setError('') }}
              />
            </div>
          ) : (
            <div>
              <label className="text-sm text-gray-600 block mb-1">
                Enter {paymentMode === 'cash' ? 'Cash' : paymentMode === 'gcash' ? 'GCash' : 'Card'} Amount
              </label>
              <input
                value={paymentInput}
                onChange={e => { setPaymentInput(e.target.value); setError('') }}
                type="number"
                className="w-full border-2 border-[#1a8eff] rounded-xl px-4 py-3 text-xl text-center font-bold focus:outline-none"
              />
            </div>
          )}

          {/* Quick amounts */}
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map(a => (
              <button key={a} onClick={() => applyQuickAmount(a)}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-[#1a8eff] py-2 rounded-lg text-sm font-medium">
                ₱{a}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Total Paid</span>
              <span className="font-semibold text-slate-800">{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          {/* Change */}
          <div className="text-center">
            <p className="text-sm text-gray-500">Change</p>
            <p className="text-3xl font-bold text-green-500">{formatCurrency(change)}</p>
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleConfirm}
            disabled={loading || totalPaid < total}
            className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-base hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SplitInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-sm text-gray-600 block mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        type="number"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
      />
    </div>
  )
}
