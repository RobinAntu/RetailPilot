import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, ScanLine, Boxes, Package, Truck, BarChart3, Database, Bell, Settings, Users, LogOut, PackagePlus, Trash2 } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'

const ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'Scan / POS', icon: ScanLine },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/receive', label: 'Receive Stock', icon: PackagePlus },
  { to: '/expiry', label: 'Expiry', icon: Package },
  { to: '/waste', label: 'Waste', icon: Trash2 },
  { to: '/reorder', label: 'Reorder', icon: Boxes },
  { to: '/orders', label: 'Orders', icon: Truck },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/users', label: 'Users', icon: Users },
]

export default function More() {
  const session = useDataStore((s) => s.session)!
  const navigate = useNavigate()
  const items = ITEMS.filter((i) => !(i.to === '/users' && session.role !== 'owner'))
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-textprimary">More</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((i) => (
          <button key={i.to} onClick={() => navigate(i.to)} className="card p-4 flex flex-col items-start gap-2 hover:shadow-lift"><i.icon className="w-6 h-6 text-primary" /><span className="text-sm font-medium text-textprimary">{i.label}</span></button>
        ))}
      </div>
      <button onClick={async () => { await backend.signOut(); navigate('/login', { replace: true }) }} className="btn-danger w-full"><LogOut className="w-4 h-4" /> Logout</button>
    </div>
  )
}