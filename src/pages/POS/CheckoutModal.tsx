import { useState } from 'react'
import { X, Tag, User } from 'lucide-react'
import { useCartStore } from '../../stores/cart.store'
import { useAuthStore } from '../../stores/auth.store'
import { formatCurrency } from '../../utils/format'

const QUICK_AMOUNTS = [100, 200, 500, 1000]

interface Props { onClose: () => void; onComplete: () => void }

export default function CheckoutModal({ onClose, onComplete }: Props) {
  const cart = useCartStore()
  const { user } = useAuthStore()
  const [paymentInput, setPaymentInput] = useState(cart.total().toFixed(2))
  const [loading, setLoading] = useState(false)
  const [customerName, setCustomerName] = useState(cart.customerName)
  const [showNameInput, setShowNameInput] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)
  const [error, setError] = useState('')

  const payment = parseFloat(paymentInput) || 0
  const total = cart.total()
  const change = Math.max(0, payment - total)

  const handleConfirm = async () => {
    if (payment < total) { setError('Payment is less than total'); return }
    setLoading(true)
    try {
      const result = await window.api.orders.create({
        customer_name: customerName || null,
        subtotal: cart.subtotal(),
        discount: cart.discount,
        total,
        payment_amount: payment,
        change_amount: change,
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

          {/* Payment input */}
          <div>
            <label className="text-sm text-gray-600 block mb-1">Enter Payment Amount</label>
            <input
              value={paymentInput}
              onChange={e => { setPaymentInput(e.target.value); setError('') }}
              type="number"
              className="w-full border-2 border-[#1a8eff] rounded-xl px-4 py-3 text-xl text-center font-bold focus:outline-none"
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map(a => (
              <button key={a} onClick={() => setPaymentInput(a.toFixed(2))}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-[#1a8eff] py-2 rounded-lg text-sm font-medium">
                ₱{a}
              </button>
            ))}
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
            disabled={loading || payment < total}
            className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-base hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
