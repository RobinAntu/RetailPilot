import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useDataStore } from './store/appStore'
import { Toaster } from './components/ui/toast'
import { PageLoader } from './components/ui/Spinner'
import LoginPage from './pages/Login'
import SignupPage from './pages/Signup'
import AppShell from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Pos from './pages/Pos'
import Inventory from './pages/Inventory'
import AddProduct from './pages/AddProduct'
import ProductDetail from './pages/ProductDetail'
import ReceiveStock from './pages/ReceiveStock'
import Expiry from './pages/Expiry'
import Waste from './pages/Waste'
import Reorder from './pages/Reorder'
import Orders from './pages/Orders'
import Suppliers from './pages/Suppliers'
import Reports from './pages/Reports'
import SalesConnect from './pages/SalesConnect'
import BarcodeCentre from './pages/BarcodeCentre'
import Notifications from './pages/Notifications'
import DataBackup from './pages/DataBackup'
import Settings from './pages/Settings'
import Users from './pages/Users'
import More from './pages/More'
import AIAssistant from './components/ai/AIAssistant'

export default function App() {
  const session = useDataStore((s) => s.session)
  const init = useDataStore((s) => s.init)
  const loaded = useDataStore((s) => s.loaded)
  const loading = useDataStore((s) => s.loading)

  useEffect(() => {
    const unsub = init()
    return unsub
  }, [init])

  if (!session) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </>
    )
  }

  return (
    <>
      <AppShell>
        {loading && !loaded ? (
          <PageLoader label="Loading your store…" />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<Pos />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/products/new" element={<AddProduct />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/receive" element={<ReceiveStock />} />
            <Route path="/expiry" element={<Expiry />} />
            <Route path="/waste" element={<Waste />} />
            <Route path="/reorder" element={<Reorder />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/sales-connect" element={<SalesConnect />} />
            <Route path="/barcode" element={<BarcodeCentre />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/data" element={<DataBackup />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/more" element={<More />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
            <AIAssistant />
    </AppShell>
      <Toaster />
    </>
  )
}