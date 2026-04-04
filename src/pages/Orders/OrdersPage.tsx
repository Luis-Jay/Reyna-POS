import { useEffect, useState } from 'react'
import TopBar from '../../components/layout/TopBar'
import { Order } from '../../types'
import { formatDate } from '../../utils/format'
import { FileText } from 'lucide-react'

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
          <OrderCard key={o.id} order={o} onToggleExclude={toggleExclude} />
        ))}
      </div>
    </div>
  )
}

function OrderCard({ order, onToggleExclude }: { order: any; onToggleExclude: (id: string, cur: number) => void }) {
  const [items, setItems] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)

  const loadItems = async () => {
    if (expanded) { setExpanded(false); return }
    const full = await window.api.orders.getById(order.id)
    setItems(full?.items || [])
    setExpanded(true)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-start px-4 py-3">
        <div>
          <p className="text-xs text-gray-400">{order.customer_name || 'No name'}</p>
          <p className="font-semibold text-gray-800">Order #{order.order_number}</p>
          <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
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
          <div className="flex items-center gap-2">
            <input type="checkbox" checked readOnly className="text-[#1a8eff]" />
            <span className="text-sm text-gray-700">{item.quantity}x {item.name}</span>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-600">₱{item.price.toFixed(2)}</span>
            {item.cost > 0 && <span className="text-xs text-red-400 ml-1">- ₱{item.cost.toFixed(2)}</span>}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50">
        <button onClick={loadItems} className="flex items-center gap-1 text-[#1a8eff] text-xs hover:underline">
          <FileText size={12} /> {expanded ? 'Hide' : 'Receipt'}
        </button>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <span>Exclude from Sales</span>
          <input type="checkbox" checked={!!order.exclude_sales}
            onChange={() => onToggleExclude(order.id, order.exclude_sales)} />
        </label>
      </div>
    </div>
  )
}
