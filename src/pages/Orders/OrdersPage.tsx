import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { Order } from '../../types'
import { formatDate } from '../../utils/format'
import { FileText, RotateCcw, X } from 'lucide-react'

const DATE_FILTERS = ['Today (Manila Time)', 'Yesterday', 'This Week', 'This Month', 'All Time']

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('Today (Manila Time)')

  const load = async () => {
    const filters: any = {}
    if (search) filters.search = search
    if (dateFilter === 'Today (Manila Time)') filters.today = true
    const data = await window.api.orders.getAll(filters)
    setOrders(data)
  }

  useEffect(() => { load() }, [search, dateFilter])

  const toggleExclude = async (id: string, current: number) => {
    await window.api.orders.excludeSales(id, !current)
    load()
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="All Orders" back="/" />

      <div className="p-4 space-y-3">
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]">
          {DATE_FILTERS.map(f => <option key={f}>{f}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by Order # or Customer Name..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-4">
        {orders.length === 0 ? (
          <p className="text-gray-400 text-center py-12">No orders found</p>
        ) : orders.map(o => (
          <OrderCard key={o.id} order={o} onToggleExclude={toggleExclude} onRefund={load} />
        ))}
      </div>
    </div>
  )
}

function OrderCard({ order, onToggleExclude, onRefund }: { order: any; onToggleExclude: (id: string, cur: number) => void; onRefund: () => void }) {
  const [items, setItems] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundQtys, setRefundQtys] = useState<Record<string, string>>({})
  const [refundChecked, setRefundChecked] = useState<Record<string, boolean>>({})
  const [refunding, setRefunding] = useState(false)

  const loadItems = async () => {
    if (expanded) { setExpanded(false); return }
    const full = await window.api.orders.getById(order.id)
    setItems(full?.items || [])
    setExpanded(true)
  }

  const openRefundModal = async () => {
    const full = await window.api.orders.getById(order.id)
    const loadedItems = full?.items || []
    setItems(loadedItems)
    // Default: all items checked at full quantity
    const qtys: Record<string, string> = {}
    const checked: Record<string, boolean> = {}
    for (const item of loadedItems) {
      qtys[item.id] = String(item.quantity)
      checked[item.id] = true
    }
    setRefundQtys(qtys)
    setRefundChecked(checked)
    setShowRefundModal(true)
  }

  const selectedItems = items.filter(i => refundChecked[i.id])
  const refundTotal = selectedItems.reduce((sum, item) => {
    const qty = Math.min(parseFloat(refundQtys[item.id] || '0') || 0, item.quantity)
    const unitPrice = item.quantity > 0 ? item.subtotal / item.quantity : item.price
    return sum + qty * unitPrice
  }, 0)

  const handleProcessRefund = async () => {
    if (selectedItems.length === 0) { alert('Select at least one item to refund.'); return }
    const isFullRefund = selectedItems.length === items.length &&
      selectedItems.every(i => parseFloat(refundQtys[i.id] || '0') >= i.quantity)
    const label = isFullRefund ? 'fully void' : 'partially refund'
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} Order #${order.order_number} for ₱${refundTotal.toFixed(2)}? This will restore inventory and cannot be undone.`)) return
    setRefunding(true)
    try {
      const refundItems = selectedItems.map(item => {
        const qty = Math.min(parseFloat(refundQtys[item.id] || '0') || 0, item.quantity)
        const unitPrice = item.quantity > 0 ? item.subtotal / item.quantity : item.price
        return { item_id: item.id, qty, amount: qty * unitPrice }
      }).filter(ri => ri.qty > 0)

      const res = await window.api.orders.partialRefund(order.id, refundItems)
      if (!res.success) { alert(res.error || 'Refund failed.'); return }
      setShowRefundModal(false)
      onRefund()
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start px-4 py-3">
        <div>
          <p className="text-xs text-gray-400">{order.customer_name || 'No name'}</p>
          <p className="font-semibold text-gray-800">Order #{order.order_number}</p>
          <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
          {order.note && <p className="text-xs text-amber-600 mt-0.5">{order.note}</p>}
        </div>
        <div className="text-right">
          <p className="text-[#1a8eff] font-bold">₱{order.total?.toFixed(2)}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            order.status === 'completed' ? 'bg-green-100 text-green-700' :
            order.status === 'void' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
          }`}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
        </div>
      </div>

      {expanded && items.map(item => (
        <div key={item.id} className="flex justify-between items-center px-4 py-1.5 border-t border-gray-50">
          <span className="text-sm text-gray-700">{item.quantity}× {item.name}</span>
          <div className="text-right">
            <span className="text-sm text-gray-600">₱{item.price?.toFixed(2)}</span>
            {item.cost > 0 && <span className="text-xs text-red-400 ml-1">cost ₱{item.cost?.toFixed(2)}</span>}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50 gap-3">
        <button onClick={loadItems} className="flex items-center gap-1 text-[#1a8eff] text-xs hover:underline">
          <FileText size={12} /> {expanded ? 'Hide' : 'Receipt'}
        </button>
        {order.status === 'completed' && (
          <button onClick={openRefundModal}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:underline">
            <RotateCcw size={12} /> Refund / Return
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer ml-auto">
          <span>Exclude from Sales</span>
          <input type="checkbox" checked={!!order.exclude_sales}
            onChange={() => onToggleExclude(order.id, order.exclude_sales)} />
        </label>
      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-bold text-gray-800">Refund / Return</h3>
                <p className="text-xs text-gray-400">Order #{order.order_number} · Check items to refund and edit qty</p>
              </div>
              <button onClick={() => setShowRefundModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-3 max-h-72 overflow-y-auto space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!refundChecked[item.id]}
                    onChange={e => setRefundChecked(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    className="w-4 h-4 accent-red-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">Max: {item.quantity} · ₱{(item.subtotal / item.quantity).toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-400">Qty:</span>
                    <input
                      type="number"
                      min="1"
                      max={item.quantity}
                      value={refundQtys[item.id] || ''}
                      onChange={e => setRefundQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      disabled={!refundChecked[item.id]}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t bg-gray-50 rounded-b-2xl">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">{selectedItems.length}</span> item{selectedItems.length !== 1 ? 's' : ''} selected
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Refund Amount</p>
                  <p className="text-lg font-bold text-red-500">₱{refundTotal.toFixed(2)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={handleProcessRefund}
                  disabled={refunding || selectedItems.length === 0}
                  className="py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
                >{refunding ? 'Processing...' : 'Process Refund'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
