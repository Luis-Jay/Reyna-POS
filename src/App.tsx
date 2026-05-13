import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/auth.store'
import { getDefaultAuthorizedPath, hasPermission } from './lib/access'
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
  if (user.role !== 'admin') {
    return <Navigate to={getDefaultAuthorizedPath(user) || '/login'} replace />
  }
  return <>{children}</>
}

function RequirePermission({
  children,
  permission,
}: {
  children: React.ReactNode
  permission: Parameters<typeof hasPermission>[1]
}) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!hasPermission(user, permission)) {
    return <Navigate to={getDefaultAuthorizedPath(user) || '/login'} replace />
  }
  return <>{children}</>
}

function HomeRoute() {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (hasPermission(user, 'can_access_dashboard')) return <DashboardPage />

  const fallback = getDefaultAuthorizedPath(user)
  if (fallback && fallback !== '/') return <Navigate to={fallback} replace />
  return <Navigate to="/login" replace />
}

function FallbackRoute() {
  const user = useAuthStore(s => s.user)
  return <Navigate to={getDefaultAuthorizedPath(user) || '/login'} replace />
}

export default function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get('setup_completed').then(async (setupCompleted: string | null) => {
      if (setupCompleted === 'true') {
        setSetupComplete(true)
        return
      }
      // Web: if there's already a valid Supabase session the user has previously
      // logged in on this browser — treat it as setup complete.
      if (typeof window.api.auth.checkCloudSession === 'function') {
        try {
          const ok = await window.api.auth.checkCloudSession()
          if (ok) {
            await window.api.settings.set('setup_completed', 'true')
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

  if (setupComplete === null) return null // loading

  if (!setupComplete) {
    return <SetupPage onComplete={() => setSetupComplete(true)} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><HomeRoute /></RequireAuth>} />
        <Route path="/pos" element={<RequirePermission permission="can_access_pos"><POSPage /></RequirePermission>} />
        <Route path="/orders" element={<RequirePermission permission="can_access_sales"><OrdersPage /></RequirePermission>} />
        <Route path="/products" element={<RequirePermission permission="can_manage_products"><ProductsPage /></RequirePermission>} />
        <Route path="/products/add" element={<RequirePermission permission="can_manage_products"><AddProductPage /></RequirePermission>} />
        <Route path="/products/:id/edit" element={<RequirePermission permission="can_manage_products"><AddProductPage /></RequirePermission>} />
        <Route path="/products/prices" element={<RequirePermission permission="can_manage_products"><BulkEditPricesPage /></RequirePermission>} />
        <Route path="/products/categories" element={<RequirePermission permission="can_manage_products"><CategoriesPage /></RequirePermission>} />
        <Route path="/products/import" element={<RequirePermission permission="can_manage_products"><ImportProductsPage /></RequirePermission>} />
        <Route path="/inventory" element={<RequirePermission permission="can_access_inventory"><InventoryPage /></RequirePermission>} />
        <Route path="/inventory/report" element={<RequirePermission permission="can_access_inventory"><InventoryReportPage /></RequirePermission>} />
        <Route path="/debtors" element={<RequirePermission permission="can_access_customer_credit"><DebtorsPage /></RequirePermission>} />
        <Route path="/debtors/:id" element={<RequirePermission permission="can_access_customer_credit"><DebtorDetailPage /></RequirePermission>} />
        <Route path="/analytics" element={<RequirePermission permission="can_access_analytics"><AnalyticsPage /></RequirePermission>} />
        <Route path="/reports" element={<RequirePermission permission="can_access_reports"><ReportsPage /></RequirePermission>} />
        <Route path="/pro" element={<RequireAdmin><ActivationPage onActivated={() => {}} /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="/expenses" element={<RequirePermission permission="can_access_expenses"><ExpensesPage /></RequirePermission>} />
        <Route path="/cashier-monitoring" element={<RequirePermission permission="can_access_cashier_monitoring"><CashierMonitoringPage /></RequirePermission>} />
        <Route path="/loyalty" element={<RequirePermission permission="can_access_loyalty"><LoyaltyPage /></RequirePermission>} />
        <Route path="*" element={<RequireAuth><FallbackRoute /></RequireAuth>} />
      </Routes>
    </HashRouter>
  )
}
