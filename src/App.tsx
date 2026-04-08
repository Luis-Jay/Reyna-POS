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
import InventoryPage from './pages/Inventory/InventoryPage'
import DebtorsPage from './pages/Debtors/DebtorsPage'
import DebtorDetailPage from './pages/Debtors/DebtorDetailPage'
import AnalyticsPage from './pages/Analytics/AnalyticsPage'
import ReportsPage from './pages/Reports/ReportsPage'
import SettingsPage from './pages/Settings/SettingsPage'

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
    window.api.settings.get('setup_completed').then(setupCompleted => {
      setSetupComplete(setupCompleted === 'true')
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
        <Route path="/inventory" element={<RequireAdmin><InventoryPage /></RequireAdmin>} />
        <Route path="/debtors" element={<RequireAuth><DebtorsPage /></RequireAuth>} />
        <Route path="/debtors/:id" element={<RequireAuth><DebtorDetailPage /></RequireAuth>} />
        <Route path="/analytics" element={<RequireAdmin><AnalyticsPage /></RequireAdmin>} />
        <Route path="/reports" element={<RequireAdmin><ReportsPage /></RequireAdmin>} />
        <Route path="/pro" element={<RequireAdmin><ActivationPage onActivated={() => {}} /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
