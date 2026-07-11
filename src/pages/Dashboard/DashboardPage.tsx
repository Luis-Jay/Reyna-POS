import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, BarChart2, Package, Clock, Settings, List, Tag, UserX, FileText, Receipt, Users, Star } from 'lucide-react'
import { DashboardSnapshot } from '../../types'
import { formatDate } from '../../utils/format'
import { useAuthStore } from '../../stores/auth.store'
import { canAccessModule, getAccessibleModules } from '../../lib/access'
import { getBusinessId } from '../../lib/web-api/context'
import { ensureBasicProductAccess } from '../../lib/web-api/basic-product-access'
import { getProAccessState } from '../../lib/web-api/pro-access'

type DashboardSyncState = {
  status?: string
  pending?: number
  pendingCount?: number
  syncing?: boolean
  cloudSignedIn?: boolean
  lastSyncedAt?: string | null
  message?: string
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncState, setSyncState] = useState<DashboardSyncState | null>(null)
  const [cloudBusinessName, setCloudBusinessName] = useState<string | null>(null)
  const [cloudEmail, setCloudEmail] = useState<string | null>(null)
  const [isPro, setIsPro] = useState(true)
  const [basicLockNotice, setBasicLockNotice] = useState<{
    businessId: string
    totalActive: number
    accessibleCount: number
    lockedCount: number
  } | null>(null)
  const [doNotRemindAgain, setDoNotRemindAgain] = useState(false)

  useEffect(() => {
    window.api.analytics.getDashboard().then(setSnap)
    window.api.orders.getPending().then((r: any[]) => setPendingCount(r.length))
    // Web-only: load the cloud account's business name and email
    if (typeof (window.api.auth as any).getCloudBusinessName === 'function') {
      ;(window.api.auth as any).getCloudBusinessName().then((name: string | null) => setCloudBusinessName(name))
      ;(window.api.auth as any).getCloudEmail().then((email: string | null) => setCloudEmail(email))
    }

    ;(async () => {
      try {
        const proAccess = await getProAccessState()
        setIsPro(proAccess.activated)

        const businessId = await getBusinessId()
        const access = await ensureBasicProductAccess(businessId)
        if (access.activated || access.totalActive <= access.limit) return

        const reminderKey = `basic_product_lock_notice_dismissed__${businessId}`
        const dismissed = await window.api.settings.get(reminderKey)
        if (dismissed === 'true') return

        setBasicLockNotice({
          businessId,
          totalActive: access.totalActive,
          accessibleCount: access.accessibleCount,
          lockedCount: Math.max(access.totalActive - access.accessibleCount, 0),
        })
      } catch {
        // ignore notice failures so the dashboard still loads
      }
    })()
  }, [])

  useEffect(() => {
    let mounted = true

    window.api.sync.getStatus().then((status: DashboardSyncState) => {
      if (mounted) setSyncState(status)
    })

    const unsubscribe = window.api.on.syncStatus((status: DashboardSyncState) => {
      setSyncState(status)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const tiles = [
    { label: 'POS',           icon: ShoppingCart, tone: 'from-emerald-500 to-green-700', path: '/pos' },
    { label: 'View Orders',   icon: List,         tone: 'from-emerald-400 to-teal-700', path: '/orders' },
    { label: 'Product List',  icon: Tag,          tone: 'from-lime-500 to-emerald-700', path: '/products' },
    { label: 'Analytics',     icon: BarChart2,    tone: 'from-green-400 to-emerald-700', path: '/analytics' },
    { label: 'Reports',       icon: FileText,     tone: 'from-cyan-500 to-emerald-800', path: '/reports' },
    { label: 'Inventory',     icon: Package,      tone: 'from-teal-400 to-green-700', path: '/inventory', badge: undefined },
    { label: 'Pending Orders',icon: Clock,        tone: 'from-amber-400 to-emerald-700', path: '/orders', badge: pendingCount > 0 ? pendingCount : undefined },
    { label: 'Debtors',       icon: UserX,        tone: 'from-stone-500 to-emerald-900', path: '/debtors' },
    { label: 'Expenses',          icon: Receipt,  tone: 'from-rose-400 to-red-700',     path: '/expenses' },
    { label: 'Cashier Monitoring',icon: Users,    tone: 'from-violet-500 to-purple-700', path: '/cashier-monitoring' },
    { label: 'Loyalty / Sukipoints', icon: Star, tone: 'from-amber-400 to-orange-600', path: '/loyalty' },
    { label: 'Settings',      icon: Settings,     tone: 'from-zinc-500 to-green-800', path: '/settings' },
  ]
  const visibleTiles = tiles.filter(tile => {
    if (!isPro && (tile.path === '/reports' || tile.path === '/debtors' || tile.path === '/loyalty')) return false
    if (tile.path === '/pos') return canAccessModule(user, 'pos')
    if (tile.path === '/orders' || tile.path === '/analytics') return canAccessModule(user, 'sales')
    if (tile.path === '/products') return canAccessModule(user, 'products')
    if (tile.path === '/reports') return canAccessModule(user, 'reports')
    if (tile.path === '/inventory') return canAccessModule(user, 'inventory')
    if (tile.path === '/debtors') return canAccessModule(user, 'customer_credit')
    if (tile.path === '/expenses') return canAccessModule(user, 'expenses')
    if (tile.path === '/cashier-monitoring') return canAccessModule(user, 'cashier_monitoring')
    if (tile.path === '/loyalty') return canAccessModule(user, 'loyalty')
    if (tile.path === '/settings') return user?.role === 'admin'
    return true
  })
  const canSeeSalesPanel = canAccessModule(user, 'sales')
  const workspaceCount = getAccessibleModules(user).length

  const dismissBasicLockNotice = async () => {
    if (basicLockNotice && doNotRemindAgain) {
      await window.api.settings.set(`basic_product_lock_notice_dismissed__${basicLockNotice.businessId}`, 'true')
    }
    setBasicLockNotice(null)
    setDoNotRemindAgain(false)
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      {basicLockNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-xl rounded-[28px] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Basic Plan Notice</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Some products are now blocked</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This account has exceeded the Basic plan limit of 300 products. The system has automatically blocked some products for this account.
            </p>
            <div className="mt-4 rounded-2xl bg-emerald-50/80 p-4 text-sm text-slate-700">
              <p>Total active products: <strong>{basicLockNotice.totalActive}</strong></p>
              <p>Accessible on Basic: <strong>{basicLockNotice.accessibleCount}</strong></p>
              <p>Currently blocked: <strong>{basicLockNotice.lockedCount}</strong></p>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={doNotRemindAgain}
                onChange={(e) => setDoNotRemindAgain(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Do not remind again for this account
            </label>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => void dismissBasicLockNotice()}
                className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="brand-gradient relative flex h-24 items-end overflow-hidden border-b border-white/15 px-6 pb-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_28%)]" />
        <div className="relative flex w-full items-end gap-4">
          <div className="flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-50/80">Operations Overview</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">{user?.role === 'admin' ? 'Admin Dashboard' : 'Staff Dashboard'}</h1>
          </div>
          <div className="flex items-center gap-2">
            {cloudBusinessName && (
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                <span className="text-xs font-semibold text-white/90 max-w-[160px] truncate">{cloudBusinessName}</span>
                <button
                  title={`Signed in as ${cloudEmail ?? '...'} — click to switch account`}
                  onClick={async () => {
                    if (!confirm('Switch to a different cloud account?')) return
                    await (window.api.auth as any).cloudLogout()
                    logout()
                    window.location.reload()
                  }}
                  className="text-[10px] font-bold text-white/60 hover:text-white underline underline-offset-2 transition whitespace-nowrap"
                >
                  Switch
                </button>
              </div>
            )}
            <button
              onClick={async () => { await window.api.auth.logout(); logout(); navigate('/login') }}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              ADMIN
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_380px]">
          <div>
            <div className="glass-panel mb-5 rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Today</p>
                  <h2 className="text-xl font-semibold text-slate-900">Store snapshot</h2>
                </div>
                <div className="flex items-center gap-2">
                  <DashboardSyncBadge syncState={syncState} />
                  <div className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-semibold text-[var(--brand-700)]">
                    Live summary
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Sales Today"    value={`₱${(snap?.sales_today || 0).toFixed(2)}`} />
            <Stat label="Profit Today"   value={`₱${(snap?.profit_today || 0).toFixed(2)}`} green />
            <Stat label="Total Products" value={String(snap?.total_products || 0)} />
              </div>
          </div>

            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Management</p>
                <h2 className="text-xl font-semibold text-slate-900">Quick actions</h2>
                <p className="mt-1 text-xs text-slate-500">{workspaceCount} assigned module{workspaceCount === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleTiles.map(t => (
              <button
                key={t.label}
                onClick={() => navigate(t.path)}
                  className={`relative overflow-hidden rounded-[24px] bg-gradient-to-br ${t.tone} p-5 text-left text-white shadow-[0_18px_40px_rgba(20,95,57,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(20,95,57,0.22)]`}
                  style={{ minHeight: t.label === 'POS' ? 150 : 112 }}
              >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_32%)]" />
                {t.badge != null && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {t.badge}
                  </span>
                )}
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
                      <t.icon size={t.label === 'POS' ? 28 : 22} />
                    </div>
                    <div>
                      <span className="block text-lg font-semibold">{t.label}</span>
                      <span className="text-xs text-white/75">Open workspace</span>
                    </div>
                  </div>
              </button>
            ))}
            </div>
          </div>

          <div className="glass-panel rounded-[28px] p-5 min-w-0">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">{canSeeSalesPanel ? 'Orders' : 'Access'}</p>
              <h2 className="text-xl font-semibold text-slate-900">{canSeeSalesPanel ? 'Recent activity' : 'Assigned modules'}</h2>
            </div>
            <div className="overflow-hidden rounded-[22px] bg-white/70">
            {!canSeeSalesPanel ? (
                <div className="px-4 py-4">
                  {getAccessibleModules(user).map(module => (
                    <button
                      key={module.id}
                      onClick={() => navigate(module.path)}
                      className="flex w-full items-center justify-between border-b border-emerald-900/5 py-3 text-left transition hover:bg-emerald-50/70 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{module.label}</p>
                        <p className="text-xs text-slate-400">{module.description}</p>
                      </div>
                      <p className="text-xs font-semibold text-[var(--brand-700)]">Open</p>
                    </button>
                  ))}
                </div>
            ) : (snap?.recent_orders || []).length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No orders yet</p>
            ) : (
              snap?.recent_orders.map(o => (
                <button
                  key={o.id}
                  onClick={() => navigate('/orders')}
                    className="flex w-full items-center justify-between border-b border-emerald-900/5 px-4 py-3 text-left transition hover:bg-emerald-50/70 last:border-0"
                >
                  <div className="text-left">
                      <p className="text-sm font-medium text-slate-800">Order #{o.order_number}</p>
                      <p className="text-xs text-slate-400">{o.item_count} items</p>
                  </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--brand-700)]">₱{o.total.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">{formatDate(o.created_at)}</p>
                    </div>
                </button>
              ))
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-[22px] border border-emerald-900/5 bg-white/75 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${green ? 'text-green-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function DashboardSyncBadge({ syncState }: { syncState: DashboardSyncState | null }) {
  const pending = syncState?.pending ?? syncState?.pendingCount ?? 0

  if (syncState?.syncing) {
    return (
      <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        Syncing local data...
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        {pending} local change{pending === 1 ? '' : 's'} pending sync
      </div>
    )
  }

  if (syncState?.cloudSignedIn === false || syncState?.status === 'not_signed_in') {
    return (
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        Local-only data
      </div>
    )
  }

  if (syncState?.lastSyncedAt) {
    return (
      <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        Synced {formatDate(syncState.lastSyncedAt)}
      </div>
    )
  }

  return (
    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      Cloud connected
    </div>
  )
}
