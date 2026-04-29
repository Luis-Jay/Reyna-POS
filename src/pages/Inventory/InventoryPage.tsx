import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { InventoryItem } from '../../types'
import { Plus, FileText, ShoppingCart, X, PackageCheck, Clock, FileSpreadsheet, Printer } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'
import { exportToExcel, exportToPdf } from '../../utils/export'

const FILTERS = ['Fast Moving', 'Low Stock', 'Out of Stock', 'Critical', 'All']
type EditMode = 'add' | 'set'

interface OrderForm {
  product_id: string
  product_name: string
  barcode: string | null
  base_cost: number
  retail_price: number
  wholesale_price: number
}

interface PendingOrder {
  id: string
  product_id: string
  product_name: string
  barcode: string | null
  vendor_name: string | null
  quantity: number
  unit_cost: number
  status: 'pending' | 'received' | 'cancelled'
  expected_at: string | null
  received_at: string | null
  notes: string | null
  created_at: string
}

export default function InventoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filter, setFilter] = useState('Fast Moving')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<EditMode>('add')
  const [stockQty, setStockQty] = useState('')
  const [counts, setCounts] = useState({ total: 0, safe: 0, low: 0, critical: 0 })

  // Order modal
  const [orderForm, setOrderForm] = useState<OrderForm | null>(null)
  const [vendorName, setVendorName] = useState('')
  const [orderQty, setOrderQty] = useState('1')
  const [orderCost, setOrderCost] = useState('')
  const [orderRetailPrice, setOrderRetailPrice] = useState('')
  const [orderWholesalePrice, setOrderWholesalePrice] = useState('')
  const [orderExpected, setOrderExpected] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [placingOrder, setPlacingOrder] = useState(false)
  const [batchPricingAvailable, setBatchPricingAvailable] = useState(false)

  // Pending orders sheet
  const [showPending, setShowPending] = useState(false)
  const [ordersTab, setOrdersTab] = useState<'pending' | 'all'>('pending')
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [allOrders, setAllOrders] = useState<PendingOrder[]>([])
  const [receivingId, setReceivingId] = useState<string | null>(null)

  const load = async () => {
    const [data, all]: [InventoryItem[], InventoryItem[]] = await Promise.all([
      window.api.inventory.getAll(search ? undefined : filter),
      window.api.inventory.getAll(),
    ])
    const filtered = search
      ? all.filter(i => i.product_name.toLowerCase().includes(search.toLowerCase()))
      : data
    setItems(filtered)
    setCounts({
      total: all.length,
      safe: all.filter(i => i.status === 'safe').length,
      low: all.filter(i => i.status === 'low').length,
      critical: all.filter(i => ['critical', 'out'].includes(i.status)).length,
    })
  }

  const loadPending = async () => {
    const orders = await window.api.productOrders.getPending()
    setPendingOrders(orders)
  }

  const loadAllOrders = async () => {
    const orders = await window.api.productOrders.getAll()
    setAllOrders(orders)
  }

  const handleExportOrders = async () => {
    const rows = await window.api.productOrders.getAll()
    exportToExcel([{
      name: 'Product Orders',
      rows: rows.map((o: any) => ({
        'Product':        o.product_name,
        'Barcode':        o.barcode ?? '',
        'Vendor':         o.vendor_name ?? '',
        'Qty Ordered':    o.quantity,
        'Unit Cost (₱)':  o.unit_cost,
        'Total Value (₱)':(o.quantity * o.unit_cost).toFixed(2),
        'Status':         o.status,
        'Expected Date':  o.expected_at ? new Date(o.expected_at).toLocaleDateString('en-PH') : '',
        'Received Date':  o.received_at ? new Date(o.received_at).toLocaleDateString('en-PH') : '',
        'Date Ordered':   new Date(o.created_at).toLocaleDateString('en-PH'),
      })),
    }], `ProductOrders_${new Date().toISOString().slice(0, 10)}`)
  }

  const handlePrintOrders = async () => {
    const rows = await window.api.productOrders.getAll()
    const tableRows = rows.map((o: any) => `
      <tr>
        <td>${o.product_name}</td>
        <td>${o.barcode ?? ''}</td>
        <td>${o.vendor_name ?? ''}</td>
        <td style="text-align:center">${o.quantity}</td>
        <td style="text-align:right">₱${o.unit_cost.toFixed(2)}</td>
        <td style="text-align:right">₱${(o.quantity * o.unit_cost).toFixed(2)}</td>
        <td style="text-align:center">${o.status}</td>
        <td>${o.expected_at ? new Date(o.expected_at).toLocaleDateString('en-PH') : ''}</td>
        <td>${o.received_at ? new Date(o.received_at).toLocaleDateString('en-PH') : ''}</td>
        <td>${new Date(o.created_at).toLocaleDateString('en-PH')}</td>
      </tr>`).join('')
    exportToPdf('Product Orders Report', `
      <table>
        <thead><tr>
          <th>Product</th><th>Barcode</th><th>Vendor</th>
          <th>Qty</th><th>Unit Cost</th><th>Total</th>
          <th>Status</th><th>Expected</th><th>Received</th><th>Ordered</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`)
  }

  useEffect(() => { load() }, [filter, search])
  useEffect(() => {
    Promise.all([
      window.api.activation.getStatus(),
      window.api.settings.getAll(),
    ]).then(([activation, settings]: any[]) => {
      setBatchPricingAvailable(activation?.activated === true && settings?.batch_pricing_enabled === 'true')
    }).catch(() => setBatchPricingAvailable(false))
  }, [])

  const openEdit = (productId: string) => {
    setEditingId(productId)
    setEditMode('add')
    setStockQty('')
  }

  const handleConfirm = async (productId: string) => {
    const qty = parseFloat(stockQty)
    if (isNaN(qty)) return
    if (editMode === 'add') {
      await window.api.inventory.addStock(productId, qty)
    } else {
      if (qty < 0) return
      await window.api.inventory.setStock(productId, qty)
    }
    setEditingId(null)
    setStockQty('')
    load()
  }

  const openOrderForm = (item: InventoryItem) => {
    setOrderForm({
      product_id: item.product_id,
      product_name: item.product_name,
      barcode: item.barcode ?? null,
      base_cost: item.base_cost ?? 0,
      retail_price: item.retail_price ?? item.base_price ?? 0,
      wholesale_price: item.wholesale_price ?? item.retail_price ?? item.base_price ?? 0,
    })
    setVendorName('')
    setOrderQty('1')
    setOrderCost(String(item.base_cost ?? 0))
    setOrderRetailPrice(String(item.retail_price ?? item.base_price ?? 0))
    setOrderWholesalePrice(String(item.wholesale_price ?? item.retail_price ?? item.base_price ?? 0))
    setOrderExpected('')
    setOrderNotes('')
  }

  const handlePlaceOrder = async () => {
    if (!orderForm || !orderQty) return
    setPlacingOrder(true)
    try {
      await window.api.productOrders.create({
        product_id: orderForm.product_id,
        vendor_name: vendorName || null,
        quantity: parseFloat(orderQty) || 0,
        unit_cost: parseFloat(orderCost) || 0,
        retail_price: batchPricingAvailable ? parseFloat(orderRetailPrice) || 0 : null,
        wholesale_price: batchPricingAvailable ? parseFloat(orderWholesalePrice) || 0 : null,
        expected_at: orderExpected || null,
        notes: orderNotes || null,
      })
      setOrderForm(null)
    } catch (err) {
      console.error('Place order failed:', err)
      alert('Failed to place order. Please restart the app and try again.')
    } finally {
      setPlacingOrder(false)
    }
  }

  const handleReceive = async (id: string) => {
    setReceivingId(id)
    try {
      await window.api.productOrders.receive(id)
      loadPending()
      loadAllOrders()
      load()
    } catch (err) {
      console.error('Receive failed:', err)
      alert('Failed to receive order. Please restart the app and try again.')
    } finally {
      setReceivingId(null)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await window.api.productOrders.cancel(id)
      loadPending()
      loadAllOrders()
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  const openPending = () => {
    setOrdersTab('pending')
    loadPending()
    loadAllOrders()
    setShowPending(true)
  }

  const statusLabel = (s: string) => {
    if (s === 'out')      return { text: 'Out of Stock', class: 'bg-red-100 text-red-600' }
    if (s === 'critical') return { text: 'Critical',     class: 'bg-red-100 text-red-600' }
    if (s === 'low')      return { text: 'Low Stock',    class: 'bg-yellow-100 text-yellow-700' }
    return                       { text: 'Safe',         class: 'bg-green-100 text-green-600' }
  }

  return (
    <div className="h-screen flex flex-col bg-[#f6faf7]">
      <TopBar title="Inventory Management" back="/" actions={
        <div className="flex items-center gap-2">
          <button
            onClick={openPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded-lg hover:bg-white/30"
          >
            <Clock size={13} /> Pending Orders
          </button>
          <button
            onClick={() => navigate('/inventory/report')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded-lg hover:bg-white/30"
          >
            <FileText size={13} /> View Report
          </button>
        </div>
      } />

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3 p-4">
        {[
          { label: 'Total',    value: counts.total,    icon: '📦', color: 'from-slate-800 to-slate-700' },
          { label: 'Safe',     value: counts.safe,     icon: '✓',  color: 'from-emerald-600 to-emerald-500' },
          { label: 'Low',      value: counts.low,      icon: '!',  color: 'from-amber-500 to-yellow-500' },
          { label: 'Critical', value: counts.critical, icon: '⚠',  color: 'from-red-600 to-rose-500' },
        ].map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.color} text-white rounded-xl p-4 flex items-center gap-3 shadow-sm`}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-2xl">{c.icon}</span>
            <div>
              <p className="text-xs opacity-80">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="px-4 pb-3 flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search products..."
          className="flex-1 border border-emerald-100 rounded-xl px-4 py-2.5 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-emerald-100 rounded-xl px-4 py-2.5 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200">
          {FILTERS.map(f => <option key={f}>{f}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
        {items.map(item => {
          const sl = statusLabel(item.status)
          const isEditing = editingId === item.product_id
          return (
            <div key={item.id} className="bg-white/95 rounded-2xl border border-emerald-50 p-4 flex items-center gap-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="w-14 h-14 bg-emerald-50 rounded-xl overflow-hidden shrink-0">
                {item.image_path && (
                  <img src={getProductImageSrc(item.image_path)} alt={item.product_name || ''} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-800 truncate">{item.product_name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${sl.class}`}>{sl.text}</span>
                </div>
                {item.barcode && <p className="text-xs text-gray-400 font-mono mt-0.5">{item.barcode}</p>}
                <div className="flex gap-6 mt-2">
                  <div>
                    <p className="text-xs text-gray-400">Total Stock</p>
                    <p className={`font-bold text-lg ${item.quantity <= 0 ? 'text-red-500' : 'text-gray-800'}`}>{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Monthly Sold</p>
                    <p className="font-bold text-lg text-green-600">{item.monthly_sold}</p>
                  </div>
                </div>
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                    <button
                      onClick={() => { setEditMode('add'); setStockQty('') }}
                      className={`px-3 py-1.5 transition ${editMode === 'add' ? 'bg-[#1a8eff] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >+ Add</button>
                    <button
                      onClick={() => { setEditMode('set'); setStockQty(String(item.quantity)) }}
                      className={`px-3 py-1.5 transition ${editMode === 'set' ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >Set To</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={stockQty}
                      onChange={e => setStockQty(e.target.value)}
                      type="number"
                      placeholder={editMode === 'add' ? '±Qty' : 'Exact qty'}
                      autoFocus
                      className="w-24 border-2 border-[#1a8eff] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleConfirm(item.product_id)}
                    />
                    <button
                      onClick={() => handleConfirm(item.product_id)}
                      className={`text-white px-3 py-1.5 rounded-lg text-sm font-medium ${editMode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-purple-500 hover:bg-purple-600'}`}
                    >{editMode === 'add' ? 'Add' : 'Set'}</button>
                    <button onClick={() => { setEditingId(null); setStockQty('') }} className="text-gray-400 hover:text-gray-600 px-1">✕</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openOrderForm(item)}
                    title="Place Order"
                    className="w-11 h-11 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-blue-700"
                  >
                    <ShoppingCart size={16} />
                  </button>
                  <button
                    onClick={() => openEdit(item.product_id)}
                    title="Adjust Stock"
                    className="w-11 h-11 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-emerald-700"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Place Order Modal ── */}
      {orderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Add Order</p>
                <h2 className="text-lg font-bold text-gray-800">{orderForm.product_name}</h2>
                {orderForm.barcode && <p className="text-xs text-gray-400 font-mono">{orderForm.barcode}</p>}
              </div>
              <button onClick={() => setOrderForm(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Vendor Name</label>
                <input value={vendorName} onChange={e => setVendorName(e.target.value)}
                  placeholder="e.g. Favero Ricardo"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Quantity *</label>
                  <input type="number" min="1" value={orderQty} onChange={e => setOrderQty(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Unit Cost (₱)</label>
                  <input type="number" min="0" step="0.01" value={orderCost} onChange={e => setOrderCost(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${batchPricingAvailable ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/70'}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Batch Price Management</p>
                    <p className="text-xs text-gray-500">
                      {batchPricingAvailable
                        ? 'This price becomes active after older stock is sold out.'
                        : 'Pro feature. Enable Reyna Pro and Batch Price Management in Settings.'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${batchPricingAvailable ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-800'}`}>
                    {batchPricingAvailable ? 'PRO ON' : 'PRO'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">New Retail Price (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={orderRetailPrice}
                      onChange={e => setOrderRetailPrice(e.target.value)}
                      disabled={!batchPricingAvailable}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-white/60 disabled:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">New Wholesale (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={orderWholesalePrice}
                      onChange={e => setOrderWholesalePrice(e.target.value)}
                      disabled={!batchPricingAvailable}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-white/60 disabled:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Expected Delivery</label>
                <input type="date" value={orderExpected} onChange={e => setOrderExpected(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
                <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              {orderQty && orderCost && (
                <div className="bg-blue-50 rounded-lg px-4 py-2 flex justify-between text-sm">
                  <span className="text-gray-500">Total Order Value</span>
                  <span className="font-bold text-blue-700">
                    ₱{((parseFloat(orderQty) || 0) * (parseFloat(orderCost) || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setOrderForm(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={placingOrder || !orderQty || parseFloat(orderQty) <= 0}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={15} />
                {placingOrder ? 'Placing...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders Sheet ── */}
      {showPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden shadow-2xl ring-1 ring-black/5">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Orders</h2>
                <p className="text-sm text-gray-500">{pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} awaiting receipt</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportOrders} title="Export Excel"
                  className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 text-gray-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600">
                  <FileSpreadsheet size={15} />
                </button>
                <button onClick={handlePrintOrders} title="Print / PDF"
                  className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 text-gray-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600">
                  <Printer size={15} />
                </button>
                <button onClick={() => setShowPending(false)} className="grid h-9 w-9 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 bg-white px-5">
              <button
                onClick={() => setOrdersTab('pending')}
                className={`flex-1 py-3 text-sm font-semibold transition ${ordersTab === 'pending' ? 'text-emerald-700 border-b-2 border-emerald-500' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Pending ({pendingOrders.length})
              </button>
              <button
                onClick={() => setOrdersTab('all')}
                className={`flex-1 py-3 text-sm font-semibold transition ${ordersTab === 'all' ? 'text-emerald-700 border-b-2 border-emerald-500' : 'text-gray-400 hover:text-gray-600'}`}
              >
                All Orders ({allOrders.length})
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-gray-50/70 p-5 space-y-3">
              {(ordersTab === 'pending' ? pendingOrders : allOrders).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
                  <PackageCheck className="mx-auto mb-3 text-emerald-500" size={32} />
                  <p className="text-sm font-semibold text-gray-700">
                    {ordersTab === 'pending' ? 'No pending orders' : 'No orders yet'}
                  </p>
                  <p className="text-xs text-gray-400">Product orders will appear here.</p>
                </div>
              ) : (
                (ordersTab === 'pending' ? pendingOrders : allOrders).map(order => {
                  const statusStyle =
                    order.status === 'received'  ? 'bg-emerald-100 text-emerald-700' :
                    order.status === 'cancelled' ? 'bg-red-100 text-red-500' :
                    'bg-amber-100 text-amber-700'
                  return (
                    <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-900 truncate">{order.product_name}</p>
                            {ordersTab === 'all' && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${statusStyle}`}>
                                {order.status}
                              </span>
                            )}
                          </div>
                          {order.barcode && <p className="text-sm text-gray-400 font-mono">{order.barcode}</p>}
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-gray-600">Qty <span className="font-bold text-gray-800">{order.quantity}</span></span>
                            {order.unit_cost > 0 && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-gray-600">Cost <span className="font-bold text-gray-800">₱{order.unit_cost.toFixed(2)}</span></span>
                            )}
                            {order.unit_cost > 0 && (
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">Total <span className="font-bold">₱{(order.quantity * order.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></span>
                            )}
                            {order.vendor_name && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-gray-600">Vendor <span className="font-bold text-gray-800">{order.vendor_name}</span></span>
                            )}
                          </div>
                          {order.expected_at && (
                            <p className="text-sm font-medium text-amber-600 mt-3">Expected: {new Date(order.expected_at).toLocaleDateString('en-PH')}</p>
                          )}
                          {order.notes && <p className="text-sm text-gray-500 mt-1 italic">{order.notes}</p>}
                          <p className="text-xs text-gray-400 mt-4">Ordered {new Date(order.created_at).toLocaleDateString('en-PH')}</p>
                        </div>
                        {order.status === 'pending' && (
                          <div className="flex w-32 flex-col gap-2 shrink-0">
                            <button
                              onClick={() => handleReceive(order.id)}
                              disabled={receivingId === order.id}
                              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <PackageCheck size={13} />
                              {receivingId === order.id ? 'Receiving...' : 'Received'}
                            </button>
                            <button
                              onClick={() => handleCancel(order.id)}
                              className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
