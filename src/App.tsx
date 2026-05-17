import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/auth.store'
import { canAccessModule, getDefaultRouteForUser, ModuleId } from './lib/access'
import { supabase } from './lib/supabase'
import { clearBusinessId } from './lib/web-api/context'
import ActivationPage from './pages/Activation/ActivationPage'
import SetupPage from './pages/Setup/SetupPage'
import LoginPage from './pages/Login/LoginPage'
import DashboardPage from './pages/Dashboard/DashboardPage'
import POSPage from './pages/POS/POSPage'
import OrdersPage from './pages/Orders/OrdersPage'
import ProductsPage from './pages/Products/ProductsPage'
import AddProductPage from './pages/Products/AddProductPage'
import BulkEditPricesPage from './pages/Products/BulkEditPricesPage'
import CategoriesPage from './pages/Products/CategoriesPage'
import ImportProductsPage from './pages/Products/ImportProductsPage'
import InventoryPage from './pages/Inventory/InventoryPage'
import InventoryReportPage from './pages/Inventory/InventoryReportPage'
import DebtorsPage from './pages/Debtors/DebtorsPage'
import DebtorDetailPage from './pages/Debtors/DebtorDetailPage'
import AnalyticsPage from './pages/Analytics/AnalyticsPage'
import ReportsPage from './pages/Reports/ReportsPage'
import SettingsPage from './pages/Settings/SettingsPage'
import ExpensesPage from './pages/Expenses/ExpensesPage'
import CashierMonitoringPage from './pages/CashierMonitoring/CashierMonitoringPage'
import LoyaltyPage from './pages/Loyalty/LoyaltyPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to={getDefaultRouteForUser(user)} replace />
  return <>{children}</>
}

function RequireModule({ moduleId, children }: { moduleId: ModuleId; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!canAccessModule(user, moduleId)) return <Navigate to={getDefaultRouteForUser(user)} replace />
  return <>{children}</>
}

function RouteFallback() {
  const user = useAuthStore(s => s.user)
  return <Navigate to={getDefaultRouteForUser(user)} replace />
}

export default function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get('setup_completed').then(async (setupCompleted: string | null) => {
      if (setupCompleted === 'true') {
        if (typeof window.api.auth.syncCloudBusinessSettings === 'function') {
          try { await window.api.auth.syncCloudBusinessSettings() } catch { /* ignore */ }
        }
        setSetupComplete(true)
        return
      }
      // Web: if there's already a valid Supabase session the user has previously
      // logged in on this browser — treat it as setup complete.
      if (typeof window.api.auth.checkCloudSession === 'function') {
        try {
          const ok = await window.api.auth.checkCloudSession()
          if (ok) {
            if (typeof window.api.auth.syncCloudBusinessSettings === 'function') {
              await window.api.auth.syncCloudBusinessSettings()
            } else {
              await window.api.settings.set('setup_completed', 'true')
            }
            setSetupComplete(true)
            return
          }
        } catch { /* ignore */ }
      }
      setSetupComplete(false)
    })
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      void window.api.sync.triggerAuto('online')
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // Detect when the Supabase session expires or the refresh token becomes
  // invalid. When that happens redirect back to the cloud sign-in screen so
  // the user can re-authenticate instead of seeing a wall of 401 errors.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        clearBusinessId()
        window.api.settings.set('setup_completed', 'false').catch(() => {})
        setSetupComplete(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (setupComplete === null) return null // loading

  if (!setupComplete) {
    return <SetupPage onComplete={() => setSetupComplete(true)} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireModule moduleId="dashboard"><DashboardPage /></RequireModule>} />
        <Route path="/pos" element={<RequireModule moduleId="pos"><POSPage /></RequireModule>} />
        <Route path="/orders" element={<RequireModule moduleId="sales"><OrdersPage /></RequireModule>} />
        <Route path="/products" element={<RequireModule moduleId="products"><ProductsPage /></RequireModule>} />
        <Route path="/products/add" element={<RequireModule moduleId="products"><AddProductPage /></RequireModule>} />
        <Route path="/products/:id/edit" element={<RequireModule moduleId="products"><AddProductPage /></RequireModule>} />
        <Route path="/products/prices" element={<RequireModule moduleId="products"><BulkEditPricesPage /></RequireModule>} />
        <Route path="/products/categories" element={<RequireModule moduleId="products"><CategoriesPage /></RequireModule>} />
        <Route path="/products/import" element={<RequireModule moduleId="products"><ImportProductsPage /></RequireModule>} />
        <Route path="/inventory" element={<RequireModule moduleId="inventory"><InventoryPage /></RequireModule>} />
        <Route path="/inventory/report" element={<RequireModule moduleId="inventory"><InventoryReportPage /></RequireModule>} />
        <Route path="/debtors" element={<RequireModule moduleId="customer_credit"><DebtorsPage /></RequireModule>} />
        <Route path="/debtors/:id" element={<RequireModule moduleId="customer_credit"><DebtorDetailPage /></RequireModule>} />
        <Route path="/analytics" element={<RequireModule moduleId="sales"><AnalyticsPage /></RequireModule>} />
        <Route path="/reports" element={<RequireModule moduleId="reports"><ReportsPage /></RequireModule>} />
        <Route path="/pro" element={<RequireAdmin><ActivationPage onActivated={() => {}} /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="/expenses" element={<RequireModule moduleId="expenses"><ExpensesPage /></RequireModule>} />
        <Route path="/cashier-monitoring" element={<RequireModule moduleId="cashier_monitoring"><CashierMonitoringPage /></RequireModule>} />
        <Route path="/loyalty" element={<RequireModule moduleId="loyalty"><LoyaltyPage /></RequireModule>} />
        <Route path="/no-access" element={<RequireAuth>
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="glass-panel max-w-md rounded-[28px] p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Access Required</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">No modules assigned</h1>
              <p className="mt-3 text-sm text-slate-500">This account does not have access to any Reyna POS module yet. Ask an admin to assign permissions in staff settings.</p>
            </div>
          </div>
        </RequireAuth>} />
        <Route path="*" element={<RouteFallback />} />
      </Routes>
    </HashRouter>
  )
}
