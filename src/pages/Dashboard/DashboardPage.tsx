import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, BarChart2, Package, Users, Clock, Settings, List, Tag, UserX } from 'lucide-react'
import { DashboardSnapshot } from '../../types'
import { formatDate } from '../../utils/format'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    window.api.analytics.getDashboard().then(setSnap)
    window.api.orders.getPending().then((r: any[]) => setPendingCount(r.length))
  }, [])

  const tiles = [
    { label: 'POS',           icon: ShoppingCart, color: 'bg-[#1a8eff]',  path: '/pos' },
    { label: 'View Orders',   icon: List,         color: 'bg-[#0ea5e9]',  path: '/orders' },
    { label: 'Product List',  icon: Tag,          color: 'bg-[#0284c7]',  path: '/products' },
    { label: 'Analytics',     icon: BarChart2,    color: 'bg-[#22c55e]',  path: '/analytics' },
    { label: 'Inventory',     icon: Package,      color: 'bg-[#059669]',  path: '/inventory', badge: undefined },
    { label: 'Customers',     icon: Users,        color: 'bg-[#a855f7]',  path: '/debtors' },
    { label: 'Pending Orders',icon: Clock,        color: 'bg-[#f97316]',  path: '/pos', badge: pendingCount > 0 ? pendingCount : undefined },
    { label: 'Debtors',       icon: UserX,        color: 'bg-[#374151]',  path: '/debtors' },
    { label: 'Settings',      icon: Settings,     color: 'bg-[#6b7280]',  path: '/settings' },
  ]

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="h-14 bg-[#1a8eff] flex items-center px-4">
        <h1 className="text-white font-semibold text-lg flex-1">Admin Dashboard</h1>
        <button
          onClick={async () => { await window.api.auth.logout(); window.location.hash = '/login' }}
          className="text-white text-sm hover:text-blue-200"
        >
          ADMIN ⇨
        </button>
      </div>

      <div className="flex-1 p-4 flex gap-4">
        {/* Left — tiles + snapshot */}
        <div className="flex-1">
          {/* Today snapshot */}
          <div className="bg-white rounded-xl p-4 mb-4 flex gap-4">
            <Stat label="Sales Today"    value={`₱${(snap?.sales_today || 0).toFixed(2)}`} />
            <Stat label="Profit Today"   value={`₱${(snap?.profit_today || 0).toFixed(2)}`} green />
            <Stat label="Total Products" value={String(snap?.total_products || 0)} />
          </div>
          <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Management</p>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(t => (
              <button
                key={t.label}
                onClick={() => navigate(t.path)}
                className={`${t.color} text-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 relative hover:opacity-90 active:scale-95 transition-all`}
                style={{ minHeight: t.label === 'POS' ? 120 : 80 }}
              >
                {t.badge != null && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {t.badge}
                  </span>
                )}
                <t.icon size={t.label === 'POS' ? 32 : 22} />
                <span className="font-semibold text-sm">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right — recent orders */}
        <div className="w-80">
          <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Recent Orders</p>
          <div className="bg-white rounded-xl overflow-hidden">
            {(snap?.recent_orders || []).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No orders yet</p>
            ) : (
              snap?.recent_orders.map(o => (
                <button
                  key={o.id}
                  onClick={() => navigate('/orders')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">Order #{o.order_number}</p>
                    <p className="text-xs text-gray-400">{o.item_count} items</p>
                  </div>
                  <p className="text-[#1a8eff] font-semibold text-sm">₱{o.total.toFixed(2)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex-1 bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${green ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
