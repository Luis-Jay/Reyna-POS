import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/auth.store'
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
  if (user.role !== 'admin') return <Navigate to="/pos" replace />
  return <>{children}</>
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

  if (setupComplete === null) return null // loading

  if (!setupComplete) {
    return <SetupPage onComplete={() => setSetupComplete(true)} />
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
        <Route path="/pos" element={<RequireAuth><POSPage /></RequireAuth>} />
        <Route path="/orders" element={<RequireAdmin><OrdersPage /></RequireAdmin>} />
        <Route path="/products" element={<RequireAdmin><ProductsPage /></RequireAdmin>} />
        <Route path="/products/add" element={<RequireAdmin><AddProductPage /></RequireAdmin>} />
        <Route path="/products/:id/edit" element={<RequireAdmin><AddProductPage /></RequireAdmin>} />
        <Route path="/products/prices" element={<RequireAdmin><BulkEditPricesPage /></RequireAdmin>} />
        <Route path="/products/categories" element={<RequireAdmin><CategoriesPage /></RequireAdmin>} />
        <Route path="/products/import" element={<RequireAdmin><ImportProductsPage /></RequireAdmin>} />
        <Route path="/inventory" element={<RequireAdmin><InventoryPage /></RequireAdmin>} />
        <Route path="/inventory/report" element={<RequireAdmin><InventoryReportPage /></RequireAdmin>} />
        <Route path="/debtors" element={<RequireAuth><DebtorsPage /></RequireAuth>} />
        <Route path="/debtors/:id" element={<RequireAuth><DebtorDetailPage /></RequireAuth>} />
        <Route path="/analytics" element={<RequireAdmin><AnalyticsPage /></RequireAdmin>} />
        <Route path="/reports" element={<RequireAdmin><ReportsPage /></RequireAdmin>} />
        <Route path="/pro" element={<RequireAdmin><ActivationPage onActivated={() => {}} /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="/expenses" element={<RequireAdmin><ExpensesPage /></RequireAdmin>} />
        <Route path="/cashier-monitoring" element={<RequireAdmin><CashierMonitoringPage /></RequireAdmin>} />
        <Route path="/loyalty" element={<RequireAuth><LoyaltyPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
