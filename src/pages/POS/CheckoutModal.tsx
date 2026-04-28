import { useEffect, useRef, useState } from 'react'
import { X, Tag, User, Star, CreditCard, Share2, Printer } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { useCartStore } from '../../stores/cart.store'
import { useAuthStore } from '../../stores/auth.store'
import { formatCurrency } from '../../utils/format'
import { PaymentEntry, PaymentMethod } from '../../types'

const QUICK_AMOUNTS = [100, 200, 500, 1000]
const PAYMENT_MODES: Array<{ key: 'cash' | 'gcash' | 'card' | 'split' | 'credit'; label: string }> = [
  { key: 'cash',   label: 'Cash' },
  { key: 'gcash',  label: 'GCash' },
  { key: 'card',   label: 'Card' },
  { key: 'split',  label: 'Split' },
  { key: 'credit', label: 'Credit' },
]

interface Props { onClose: () => void; onComplete: () => void }

export default function CheckoutModal({ onClose, onComplete }: Props) {
  const cart = useCartStore()
  const { user } = useAuthStore()
  const [paymentMode, setPaymentMode] = useState<'cash' | 'gcash' | 'card' | 'split' | 'credit'>('cash')
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

  // Credit / debtor
  const [debtorSearch, setDebtorSearch] = useState('')
  const [debtorResults, setDebtorResults] = useState<any[]>([])
  const [selectedDebtor, setSelectedDebtor] = useState<any>(null)
  const [allDebtors, setAllDebtors] = useState<any[]>([])

  const searchDebtors = async (q: string) => {
    setDebtorSearch(q)
    if (!q.trim()) {
      setDebtorResults(allDebtors.slice(0, 8))
      return
    }
    const res = await window.api.debtors.getAll({ search: q })
    setDebtorResults(res.slice(0, 8))
  }

  // VAT
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState(12)

  // Receipt preview
  const [showReceiptPreview, setShowReceiptPreview] = useState(false)
  const [completedOrder, setCompletedOrder] = useState<any>(null)
  const [printError, setPrintError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [storeSettings, setStoreSettings] = useState<Record<string, string>>({})

  // Loyalty
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)
  const [loyaltyRate, setLoyaltyRate] = useState(1)
  const [loyaltyQuery, setLoyaltyQuery] = useState('')
  const [loyaltyResults, setLoyaltyResults] = useState<any[]>([])
  const [loyaltyAccount, setLoyaltyAccount] = useState<any>(null)
  const [loyaltySearchOpen, setLoyaltySearchOpen] = useState(false)

  useEffect(() => {
    window.api.settings.getAll().then((s: any) => {
      setStoreSettings(s)
      setLoyaltyEnabled(s['loyalty_enabled'] === 'true')
      setLoyaltyRate(parseFloat(s['loyalty_rate'] || '1'))
      setVatEnabled(s['vat_enabled'] === 'true')
      setVatRate(parseFloat(s['vat_rate'] || '12'))
    })
    // Pre-load all debtors so credit mode shows them immediately
    window.api.debtors.getAll({}).then((list: any[]) => {
      setAllDebtors(list)
    })
  }, [])

  const handleLoyaltyQuery = async (q: string) => {
    setLoyaltyQuery(q)
    if (!q.trim()) { setLoyaltyResults([]); return }
    const results = await window.api.loyalty.getAll(q.trim())
    setLoyaltyResults((results as any[]).slice(0, 6))
  }

  const subtotalBeforeVat = cart.total()
  const vatAmount = vatEnabled ? Math.round(subtotalBeforeVat * (vatRate / 100) * 100) / 100 : 0
  const total = subtotalBeforeVat + vatAmount
  const singlePayment = Math.max(0, parseFloat(paymentInput) || 0)
  const cashSplit = Math.max(0, parseFloat(splitPayments.cash) || 0)
  const gcashSplit = Math.max(0, parseFloat(splitPayments.gcash) || 0)
  const cardSplit = Math.max(0, parseFloat(splitPayments.card) || 0)
  const isCredit = paymentMode === 'credit'
  const totalPaid = isCredit ? total : paymentMode === 'split' ? cashSplit + gcashSplit + cardSplit : singlePayment
  const change = paymentMode === 'cash' || paymentMode === 'split' ? Math.max(0, totalPaid - total) : 0

  const paymentBreakdown: PaymentEntry[] = paymentMode === 'split'
    ? ([
        { method: 'cash', amount: cashSplit },
        { method: 'gcash', amount: gcashSplit },
        { method: 'card', amount: cardSplit },
      ] as PaymentEntry[]).filter(entry => entry.amount > 0)
    : isCredit ? []
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
    if (isCredit) {
      if (!selectedDebtor) { setError('Select a debtor to charge to.'); return }
    } else {
      if (totalPaid < total) { setError('Payment is less than total'); return }
      if (paymentBreakdown.length === 0) { setError('Enter at least one payment amount.'); return }
    }
    setError('')
    setLoading(true)
    try {
      const result = await window.api.orders.create({
        customer_name: isCredit ? selectedDebtor.name : (customerName || null),
        subtotal: cart.subtotal(),
        discount: cart.discount,
        total,
        payment_amount: isCredit ? 0 : totalPaid,
        change_amount: isCredit ? 0 : change,
        payment_breakdown: paymentBreakdown,
        is_credit: isCredit,
        debtor_id: isCredit ? selectedDebtor.id : null,
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
        // Award loyalty points
        if (loyaltyEnabled && loyaltyAccount) {
          const pts = Math.floor(total * loyaltyRate)
          if (pts > 0) {
            await window.api.loyalty.earn(loyaltyAccount.id, pts, result.order?.id, 'Sale')
          }
        }
        // Show receipt preview instead of auto-printing
        setCompletedOrder(result.order)
        setShowReceiptPreview(true)
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

          {/* Loyalty */}
          {loyaltyEnabled && (
            loyaltyAccount ? (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <Star size={14} className="text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">{loyaltyAccount.name}</p>
                    <p className="text-xs text-amber-600">{loyaltyAccount.points} pts · +{Math.floor(total * loyaltyRate)} pts this sale</p>
                  </div>
                </div>
                <button onClick={() => { setLoyaltyAccount(null); setLoyaltyQuery(''); setLoyaltyResults([]); setLoyaltySearchOpen(false) }} className="text-amber-400 hover:text-amber-600">
                  <X size={14} />
                </button>
              </div>
            ) : loyaltySearchOpen ? (
              <div className="relative">
                <input
                  value={loyaltyQuery}
                  onChange={e => handleLoyaltyQuery(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full border-2 border-amber-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  autoFocus
                />
                {loyaltyResults.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {loyaltyResults.map((a: any) => (
                      <button key={a.id}
                        onClick={() => { setLoyaltyAccount(a); setLoyaltyQuery(''); setLoyaltyResults([]); setLoyaltySearchOpen(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b last:border-0">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{a.phone} · {a.points} pts</span>
                      </button>
                    ))}
                  </div>
                )}
                {loyaltyQuery.length > 0 && loyaltyResults.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1 px-1">No loyalty account found.</p>
                )}
              </div>
            ) : (
              <button onClick={() => setLoyaltySearchOpen(true)} className="flex items-center gap-2 text-amber-600 text-sm hover:underline">
                <Star size={14} /> + Link Loyalty Account
              </button>
            )
          )}

          {/* Total */}
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            {vatEnabled && (
              <div className="flex justify-between text-xs text-gray-500 mb-1 px-2">
                <span>Subtotal</span><span>{formatCurrency(subtotalBeforeVat)}</span>
              </div>
            )}
            {vatEnabled && (
              <div className="flex justify-between text-xs text-gray-500 mb-2 px-2">
                <span>VAT ({vatRate}%)</span><span>+{formatCurrency(vatAmount)}</span>
              </div>
            )}
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount Due</p>
            <p className="text-4xl font-bold text-[#1a8eff]">{formatCurrency(total)}</p>
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_MODES.map(mode => (
                <button
                  key={mode.key}
                  onClick={() => {
                    setPaymentMode(mode.key)
                    setError('')
                    setSelectedDebtor(null)
                    setDebtorSearch('')
                    setDebtorResults([])
                    if (mode.key !== 'split' && mode.key !== 'credit') setPaymentInput(total.toFixed(2))
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition flex items-center justify-center gap-1 ${
                    paymentMode === mode.key
                      ? mode.key === 'credit'
                        ? 'border-orange-400 bg-orange-50 text-orange-600'
                        : 'border-[#1a8eff] bg-blue-50 text-[#1a8eff]'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode.key === 'credit' && <CreditCard size={13} />}
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credit mode — debtor search */}
          {isCredit ? (
            <div className="space-y-2">
              {selectedDebtor ? (
                <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="font-semibold text-orange-800">{selectedDebtor.name}</p>
                    <p className="text-xs text-orange-500">Current balance: {formatCurrency(selectedDebtor.balance)}</p>
                  </div>
                  <button onClick={() => { setSelectedDebtor(null); setDebtorSearch(''); setDebtorResults(allDebtors.slice(0, 8)) }} className="text-orange-400 hover:text-orange-600"><X size={16} /></button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={debtorSearch}
                    onChange={e => searchDebtors(e.target.value)}
                    onFocus={() => { if (!debtorSearch) setDebtorResults(allDebtors.slice(0, 8)) }}
                    placeholder="Search or pick a debtor..."
                    className="w-full border-2 border-orange-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
                    autoFocus
                  />
                  {debtorResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden max-h-48 overflow-y-auto">
                      {debtorResults.map(d => (
                        <button key={d.id} onClick={() => { setSelectedDebtor(d); setDebtorSearch(d.name); setDebtorResults([]) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-sm border-b last:border-0">
                          <span className="font-medium">{d.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">Balance: {formatCurrency(d.balance)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="bg-orange-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-orange-500 uppercase tracking-wide">Amount to be charged</p>
                <p className="text-3xl font-bold text-orange-600">{formatCurrency(total)}</p>
              </div>
            </div>
          ) : paymentMode === 'split' ? (
            <div className="space-y-3">
              <SplitInput label="Cash"  value={splitPayments.cash}  onChange={v => { setSplitPayments(p => ({ ...p, cash: v }));  setError('') }} />
              <SplitInput label="GCash" value={splitPayments.gcash} onChange={v => { setSplitPayments(p => ({ ...p, gcash: v })); setError('') }} />
              <SplitInput label="Card"  value={splitPayments.card}  onChange={v => { setSplitPayments(p => ({ ...p, card: v }));  setError('') }} />
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

          {/* Quick amounts — hidden for credit */}
          {!isCredit && (
            <div className="flex gap-2">
              {QUICK_AMOUNTS.map(a => (
                <button key={a} onClick={() => applyQuickAmount(a)}
                  className="flex-1 bg-blue-50 hover:bg-blue-100 text-[#1a8eff] py-2 rounded-lg text-sm font-medium">
                  ₱{a}
                </button>
              ))}
            </div>
          )}

          {!isCredit && (
            <>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Total Paid</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Change</p>
                <p className="text-3xl font-bold text-green-500">{formatCurrency(change)}</p>
              </div>
            </>
          )}

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleConfirm}
            disabled={loading || (!isCredit && totalPaid < total) || (isCredit && !selectedDebtor)}
            className={`w-full py-4 rounded-xl font-bold text-base active:scale-95 transition-all disabled:opacity-50 text-white ${
              isCredit ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {loading ? 'Processing...' : isCredit ? 'Charge to Debtor' : 'Confirm Payment'}
          </button>
        </div>
      </div>

      {/* Receipt Preview */}
      {showReceiptPreview && completedOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="px-6 pt-5 pb-3 border-b text-center shrink-0">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">✓</span>
              </div>
              <h3 className="text-lg font-bold text-gray-800">Receipt Preview</h3>
              <p className="text-sm text-gray-500">Confirm this is what will print</p>
            </div>
            <div className="px-6 py-5 bg-[#f3f4f6] overflow-y-auto">
              <ReceiptPreviewSheet
                order={completedOrder}
                cashierName={user?.name || 'Cashier'}
                storeSettings={storeSettings}
                vatEnabled={vatEnabled}
                vatRate={vatRate}
              />
            </div>
            {printError && (
              <p className="px-6 pb-2 text-xs text-red-500 text-center shrink-0">{printError}</p>
            )}
            <div className="px-4 pb-5 pt-3 shrink-0 border-t border-gray-100 bg-white space-y-2">
              {/* Print + Share row */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={printing}
                  onClick={async () => {
                    setPrintError('')
                    setPrinting(true)
                    try {
                      const res = await window.api.printer.printReceipt(completedOrder)
                      if (!res?.success) {
                        setPrintError(res?.error || 'Printer unavailable.')
                        setPrinting(false)
                        return
                      }
                    } catch {
                      setPrintError('Printer unavailable.')
                      setPrinting(false)
                      return
                    }
                    setPrinting(false)
                    setShowReceiptPreview(false)
                    setPrintError('')
                    onComplete()
                  }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a8eff] text-white font-semibold hover:bg-[#0077e6] disabled:opacity-60"
                >
                  <Printer size={16} />
                  {printing ? 'Printing…' : 'Print'}
                </button>

                {/* Share via native share sheet (WhatsApp, SMS, etc.) */}
                {'share' in navigator && (
                  <button
                    onClick={async () => {
                      setPrintError('')
                      const res = await window.api.printer.shareReceipt(completedOrder)
                      if (!res?.success && res?.error) setPrintError(res.error)
                    }}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600"
                  >
                    <Share2 size={16} /> Share
                  </button>
                )}
              </div>

              {/* Skip button */}
              <button
                onClick={() => { setShowReceiptPreview(false); setPrintError(''); onComplete() }}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50"
              >
                Skip — Done
              </button>
            </div>
          </div>
        </div>
      )}
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

function ReceiptPreviewSheet({
  order,
  cashierName,
  storeSettings,
  vatEnabled,
  vatRate,
}: {
  order: any
  cashierName: string
  storeSettings: Record<string, string>
  vatEnabled: boolean
  vatRate: number
}) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  const paperSize = storeSettings['paper_size'] || '58mm'
  const createdAt = new Date(order.created_at || Date.now()).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  useEffect(() => {
    const svg = barcodeRef.current
    if (!svg || !order?.order_number) return
    try {
      JsBarcode(svg, order.order_number, {
        format: 'CODE128',
        displayValue: false,
        background: '#ffffff',
        lineColor: '#111111',
        width: paperSize === '80mm' ? 1.45 : 1.02,
        height: paperSize === '80mm' ? 48 : 34,
        margin: 0,
      })
    } catch {
      svg.innerHTML = ''
    }
  }, [order?.order_number, paperSize])

  const payments = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
  const subtotal = Number(order?.subtotal || order?.total || 0)
  const discount = Number(order?.discount || 0)
  const total = Number(order?.total || 0)
  // vatAmount = total - (subtotal after discount); must account for discount in the formula
  const vatAmount = vatEnabled ? Math.max(0, total - (subtotal - discount)) : 0
  const hasBreakdown = discount > 0 || vatAmount > 0

  if (paperSize === '80mm') {
    return (
      <div className="mx-auto w-full max-w-[304px] rounded-[24px] bg-white px-4 py-7 font-sans text-[#111] shadow-lg">
        <div className="text-center">
          <p className="text-[20px] font-black uppercase tracking-tight">{storeSettings['store_name'] || 'SUPERMARKET'}</p>
          {storeSettings['store_address'] && <p className="mt-1 text-[11px] leading-4">{storeSettings['store_address']}</p>}
          {storeSettings['store_phone'] && <p className="mt-1 text-[11px] leading-4">Tel.: {storeSettings['store_phone']}</p>}
          {storeSettings['store_tin'] && <p className="mt-1 text-[11px] leading-4">TIN: {storeSettings['store_tin']}</p>}
        </div>

        <Divider />

        <div className="space-y-1 text-[12px]">
          <ReceiptInfoRow label="Cashier:" value={cashierName} />
          <ReceiptInfoRow label="Receipt #:" value={order?.order_number || 'N/A'} />
          <ReceiptInfoRow label="Date:" value={createdAt} />
          {order?.customer_name && <ReceiptInfoRow label="Customer:" value={order.customer_name} />}
        </div>

        <Divider />

        <div className="grid grid-cols-[1fr_38px_68px] gap-2 text-[12px] font-medium">
          <span>Name</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Price</span>
        </div>

        <div className="mt-4 space-y-2 text-[12px]">
          {(order?.items || []).map((item: any, index: number) => (
            <div key={index} className="grid grid-cols-[1fr_38px_68px] gap-2 items-start">
              <span className="leading-4">{item.name}</span>
              <span className="text-center">{Number(item.quantity || 0) % 1 === 0 ? item.quantity : Number(item.quantity || 0).toFixed(2)}</span>
              <span className="text-right">{formatCurrency(item.subtotal || 0).replace('₱', '₱')}</span>
            </div>
          ))}
        </div>

        <Divider />

        <div className="space-y-1 text-[12px]">
          {hasBreakdown && (
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Discount</span>
              <span>- {formatCurrency(discount)}</span>
            </div>
          )}
          {vatAmount > 0 && (
            <div className="flex justify-between">
              <span>VAT ({vatRate}%)</span>
              <span>{formatCurrency(vatAmount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between text-[17px] font-black">
            <span>{hasBreakdown ? 'Total' : 'Sub Total'}</span>
            <span>{formatCurrency(total)}</span>
          </div>
          {payments.length > 0 ? payments.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between uppercase">
              <span>{entry.method === 'gcash' ? 'GCASH' : entry.method === 'card' ? 'CARD' : 'CASH'}</span>
              <span>{formatCurrency(entry.amount || 0)}</span>
            </div>
          )) : (
            !order?.is_credit && (
              <div className="flex justify-between uppercase">
                <span>Cash</span>
                <span>{formatCurrency(order?.payment_amount || 0)}</span>
              </div>
            )
          )}
          {!order?.is_credit && Number(order?.change_amount || 0) > 0 && (
            <div className="flex justify-between uppercase">
              <span>Change</span>
              <span>{formatCurrency(order.change_amount || 0)}</span>
            </div>
          )}
          {order?.is_credit && (
            <div className="flex justify-between uppercase">
              <span>Payment</span>
              <span>Charge to Account</span>
            </div>
          )}
        </div>

        <div className="mx-auto my-5 w-36 border-t border-dotted border-[#777]" />

        <div className="flex justify-center">
          <svg ref={barcodeRef} className="max-w-full" />
        </div>

        <div className="mt-4 text-center">
          <p className="text-[17px] font-black uppercase">Thank You!</p>
          <p className="text-[12px]">{storeSettings['receipt_footer'] || 'Glad to see you again!'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[240px] rounded-[20px] bg-white px-3 py-4 font-sans text-[#111] shadow-lg">
      <div className="text-center">
        <p className="text-[15px] font-black uppercase leading-tight tracking-tight">{storeSettings['store_name'] || 'SUPERMARKET'}</p>
        {storeSettings['store_address'] && <p className="mt-1 text-[10px] leading-3.5">{storeSettings['store_address']}</p>}
        {storeSettings['store_phone'] && <p className="mt-1 text-[10px] leading-3.5">Tel.: {storeSettings['store_phone']}</p>}
        {storeSettings['store_tin'] && <p className="mt-1 text-[10px] leading-3.5">TIN: {storeSettings['store_tin']}</p>}
      </div>

      <Divider compact />

      <div className="space-y-1 text-[10.5px]">
        <ReceiptInfoRow label="Cashier:" value={cashierName} />
        <ReceiptInfoRow label="Receipt #:" value={order?.order_number || 'N/A'} />
        <ReceiptInfoRow label="Date:" value={createdAt} />
        {order?.customer_name && <ReceiptInfoRow label="Customer:" value={order.customer_name} />}
      </div>

      <Divider compact />

      <div className="grid grid-cols-[1fr_28px_54px] gap-1.5 text-[10.5px] font-medium">
        <span>Name</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Price</span>
      </div>

      <div className="mt-3 space-y-1.5 text-[10.5px]">
        {(order?.items || []).map((item: any, index: number) => (
          <div key={index} className="grid grid-cols-[1fr_28px_54px] gap-1.5 items-start">
            <span className="leading-3.5">{item.name}</span>
            <span className="text-center">{Number(item.quantity || 0) % 1 === 0 ? item.quantity : Number(item.quantity || 0).toFixed(2)}</span>
            <span className="text-right">{formatCurrency(item.subtotal || 0).replace('₱', '₱')}</span>
          </div>
        ))}
      </div>

      <Divider compact />

      <div className="space-y-1 text-[10.5px]">
        {hasBreakdown && (
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount</span>
            <span>- {formatCurrency(discount)}</span>
          </div>
        )}
        {vatAmount > 0 && (
          <div className="flex justify-between">
            <span>VAT ({vatRate}%)</span>
            <span>{formatCurrency(vatAmount)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between text-[16px] font-black">
          <span>{hasBreakdown ? 'Total' : 'Sub Total'}</span>
          <span>{formatCurrency(total)}</span>
        </div>
        {payments.length > 0 ? payments.map((entry: any, index: number) => (
          <div key={index} className="flex justify-between uppercase">
            <span>{entry.method === 'gcash' ? 'GCASH' : entry.method === 'card' ? 'CARD' : 'CASH'}</span>
            <span>{formatCurrency(entry.amount || 0)}</span>
          </div>
        )) : (
          !order?.is_credit && (
            <div className="flex justify-between uppercase">
              <span>Cash</span>
              <span>{formatCurrency(order?.payment_amount || 0)}</span>
            </div>
          )
        )}
        {!order?.is_credit && Number(order?.change_amount || 0) > 0 && (
          <div className="flex justify-between uppercase">
            <span>Change</span>
            <span>{formatCurrency(order.change_amount || 0)}</span>
          </div>
        )}
        {order?.is_credit && (
          <div className="flex justify-between uppercase">
            <span>Payment</span>
            <span>Charge to Account</span>
          </div>
        )}
      </div>

      <div className="mx-auto my-4 w-28 border-t border-dotted border-[#777]" />

      <div className="flex justify-center">
        <svg ref={barcodeRef} className="max-w-full" />
      </div>

      <div className="mt-3 text-center">
        <p className="text-[15px] font-black uppercase">Thank You!</p>
        <p className="text-[10px]">{storeSettings['receipt_footer'] || 'Glad to see you again!'}</p>
      </div>
    </div>
  )
}

function ReceiptInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function Divider({ compact = false }: { compact?: boolean }) {
  return <div className={`${compact ? 'my-3' : 'my-4'} border-t border-dotted border-[#777]`} />
}
