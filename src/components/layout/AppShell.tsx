import { useState, useEffect, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ScanLine, Boxes, PackagePlus, Package, RefreshCcw,
  ShoppingCart, Truck, Trash2, BarChart3, Barcode, Bell, Database, Settings,
  Users, LogOut, Search, Wifi, WifiOff, Store, Menu, Link2,
} from 'lucide-react'
import { useDataStore } from '../../store/appStore'
import { backend } from '../../store/appStore'
import { getBackend } from '../../lib/backend'
import { toast } from '../ui/toast'
import { GlobalSearchModal } from './GlobalSearch'
import { NotificationsPanel } from './NotificationsPanel'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'staff'] },
  { to: '/pos', label: 'Scan / POS', icon: ScanLine, roles: ['owner', 'manager', 'staff'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: ['owner', 'manager', 'staff'] },
  { to: '/receive', label: 'Receive Stock', icon: PackagePlus, roles: ['owner', 'manager', 'staff'] },
  { to: '/expiry', label: 'Expiry', icon: Package, roles: ['owner', 'manager', 'staff'] },
  { to: '/reorder', label: 'Reorder', icon: RefreshCcw, roles: ['owner', 'manager'] },
  { to: '/orders', label: 'Orders', icon: Truck, roles: ['owner', 'manager'] },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: ['owner', 'manager'] },
  { to: '/waste', label: 'Waste', icon: Trash2, roles: ['owner', 'manager', 'staff'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { to: '/sales-connect', label: 'Sales Connect', icon: Link2, roles: ['owner', 'manager'] },
  { to: '/barcode', label: 'Barcode Centre', icon: Barcode, roles: ['owner', 'manager'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['owner', 'manager', 'staff'] },
  { to: '/data', label: 'Data & Backup', icon: Database, roles: ['owner'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['owner', 'manager'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['owner'] },
]

const MOBILE_NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/pos', label: 'Scan', icon: ScanLine },
  { to: '/inventory', label: 'Stock', icon: Boxes },
  { to: '/expiry', label: 'Expiry', icon: Package },
  { to: '/more', label: 'More', icon: Menu },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const session = useDataStore((s) => s.session)
  const online = useDataStore((s) => s.online)
  const settings = useDataStore((s) => s.settings)
  const notifications = useDataStore((s) => s.notifications)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const visibleNav = useMemo(() => NAV.filter((n) => n.roles.includes(session?.role || '')), [session?.role])
  const unread = notifications.filter((n) => !n.read).length

  const logout = async () => {
    await backend.signOut()
    navigate('/login', { replace: true })
  }

  // Keyboard: Ctrl/Cmd+K opens search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="min-h-screen bg-page flex relative">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col text-sidebar-text fixed top-0 bottom-0 left-0 z-30 bg-navy-grad border-r border-white/5">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(6,182,212,0.8)]">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-extrabold leading-none tracking-tight text-[17px]">RetailPilot</div>
            <div className="text-[10.5px] text-sidebar-text/70 mt-1 truncate max-w-[150px]">{settings?.name || 'Store'}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-sidebar-text hover:bg-white/5 hover:text-white'
                }`}
            >
              {({ isActive }) => (
                <>
                  <span className={`relative flex items-center justify-center w-5 ${isActive ? 'text-cyan2' : 'text-sidebar-text/70 group-hover:text-white'}`}>
                    <n.icon className="w-[18px] h-[18px]" />
                    {isActive && <span className="absolute -left-3 w-[3px] h-5 rounded-full bg-brand-gradient" />}
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-sidebar-text/40 font-semibold">Account</div>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 hover:text-white text-sidebar-text transition-colors">
            <LogOut className="w-[18px] h-[18px] text-sidebar-text/70" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top bar */}
        <header className="h-16 bg-white/85 backdrop-blur-md border-b border-border flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2.5 flex-1 max-w-lg px-3.5 py-2.5 rounded-xl bg-slate-50 text-sm text-textmuted border border-border hover:border-primary/40 hover:bg-white hover:shadow-soft transition-all duration-150">
            <Search className="w-4 h-4 text-textmuted" />
            <span>Search products, barcodes, SKU…</span>
            <kbd className="ml-auto hidden sm:inline-flex text-[10px] bg-white border border-border rounded-md px-1.5 py-0.5 text-textmuted">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-1.5 ml-auto">
            <ConnectionPill online={online} />
            <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2.5 rounded-xl hover:bg-slate-100 text-textsecondary transition-colors">
              <Bell className="w-[19px] h-[19px]" />
              {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{unread}</span>}
            </button>
            <button onClick={() => setSearchOpen(true)} className="lg:hidden p-2.5 rounded-xl hover:bg-slate-100 text-textsecondary">
              <Search className="w-5 h-5" />
            </button>
          </div>
          <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-border">
            <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-sm shadow-soft ring-2 ring-white">{session?.name?.charAt(0) || '?'}</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-textprimary">{session?.name}</div>
              <div className="text-xs text-textmuted capitalize">{session?.role}</div>
            </div>
          </div>
        </header>

        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}

        <main className="flex-1 px-4 py-6 max-w-[1400px] w-full mx-auto pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-border flex px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.12)]">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)}
            className={({ isActive }) => `flex-1 flex flex-col items-center py-2 text-[10px] font-semibold transition-colors ${isActive ? 'text-primary' : 'text-textmuted'}`}>
            {({ isActive }) => (
              <>
                <span className={`flex items-center justify-center rounded-xl transition-all ${isActive ? 'bg-primary/10 w-10 h-7' : 'w-8 h-7'}`}>
                  <n.icon className="w-5 h-5" />
                </span>
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {searchOpen && <GlobalSearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

function ConnectionPill({ online }: { online: boolean }) {
  return (
    <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${online ? 'bg-success-soft text-success ring-1 ring-success/20' : 'bg-warning-soft text-warning ring-1 ring-warning/20'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-success' : 'bg-warning'} ${online ? '' : 'animate-pulse'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}