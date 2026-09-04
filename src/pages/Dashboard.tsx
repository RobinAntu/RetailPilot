import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  DollarSign, TrendingUp, Boxes, AlertTriangle, Layers, Trash2, ScanLine,
  PackagePlus, CalendarClock, ArrowRight,
} from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { money, num } from '../lib/format'
import { todayISO, lastNDates, daysUntil, daysAgoISO, formatDate } from '../lib/date'
import InsightsPanel from '../components/ai/InsightsPanel'

export default function Dashboard() {
  const sales = useDataStore((s) => s.sales)
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const waste = useDataStore((s) => s.waste)
  const settings = useDataStore((s) => s.settings)
  const navigate = useNavigate()

  const today = todayISO()
  const soonDays = settings?.expiryWarningDays ?? 7

  const stats = useMemo(() => {
    const ts = sales.filter((s) => s.status !== 'voided')
    const todaySales = ts.filter((s) => s.timestamp.slice(0, 10) === today)
    const todayRevenue = todaySales.reduce((a, s) => a + s.totalCents, 0)
    const todayCogs = todaySales.reduce((a, s) => a + s.cogsCents, 0)
    const todayWaste = waste.filter((w) => w.createdAt.slice(0, 10) === today)
    const todayWasteCost = todayWaste.reduce((a, w) => a + w.costCents, 0)
    const stockValue = products.reduce((a, p) => a + (p.stockValueCents || 0), 0)
    const active = products.filter((p) => p.active)
    const lowStock = active.filter((p) => p.totalStock > 0 && p.totalStock <= (p.minStock || 0)).length
    const outOfStock = active.filter((p) => p.totalStock <= 0).length
    const withExpiry = batches.filter((b) => b.qtyRemaining > 0 && b.expiryDate)
    const expiringRisk = withExpiry.filter((b) => { const d = daysUntil(b.expiryDate!); return d != null && d <= soonDays })
    const riskQty = expiringRisk.reduce((a, b) => a + b.qtyRemaining, 0)
    const riskValue = expiringRisk.reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)
    return {
      todayRevenue, todayProfit: todayRevenue - todayCogs, todayWasteCost,
      stockValue, lowStock, outOfStock, riskQty, riskValue, activeCount: active.length,
    }
  }, [sales, waste, products, batches, today, soonDays])

  const sales7 = useMemo(() => lastNDates(7).map((d) => {
    const rev = sales.filter((s) => s.status !== 'voided' && s.timestamp.slice(0, 10) === d).reduce((a, s) => a + s.totalCents, 0)
    const profit = sales.filter((s) => s.status !== 'voided' && s.timestamp.slice(0, 10) === d).reduce((a, s) => a + (s.totalCents - s.cogsCents), 0)
    return { day: d.slice(5), Revenue: Math.round(rev / 100), Profit: Math.round(profit / 100) }
  }), [sales])

  const sales30 = useMemo(() => lastNDates(30).map((d) => {
    const rev = sales.filter((s) => s.status !== 'voided' && s.timestamp.slice(0, 10) === d).reduce((a, s) => a + s.totalCents, 0)
    const wast = waste.filter((w) => w.createdAt.slice(0, 10) === d).reduce((a, w) => a + w.costCents, 0)
    return { day: d.slice(5), Revenue: Math.round(rev / 100), Waste: Math.round(wast / 100) }
  }), [sales, waste])

  const stockByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    products.forEach((p) => { if (p.active) m[p.category] = (m[p.category] || 0) + (p.stockValueCents || 0) })
    return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value / 100) })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [products])

  const topSellers = useMemo(() => {
    const map: Record<string, { name: string; units: number }> = {}
    sales.filter((s) => s.status !== 'voided').forEach((s) => s.lines.forEach((l) => {
      const e = map[l.productId] || (map[l.productId] = { name: l.name, units: 0 })
      e.units += l.qty
    }))
    return Object.values(map).sort((a, b) => b.units - a.units).slice(0, 5)
      .map((r) => ({ name: r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name, units: r.units }))
  }, [sales])

  const priorities = useMemo(() => {
    const list: { type: string; title: string; detail: string; to: string; state?: any }[] = []
    for (const b of batches.filter((b) => { const d = daysUntil(b.expiryDate!); return d != null && d >= 0 && d <= soonDays && b.qtyRemaining > 0 })) {
      const p = products.find((x) => x.id === b.productId)
      if (p) list.push({ type: 'warning', title: `Expiring soon: ${p.name}`, detail: `${b.qtyRemaining} units · ${formatDate(b.expiryDate)}`, to: '/expiry', state: { filter: 'soon' } })
    }
    for (const p of products.filter((p) => p.active && p.totalStock <= 0)) {
      list.push({ type: 'danger', title: `Out of stock: ${p.name}`, detail: 'No inventory on hand', to: '/inventory', state: { filter: 'out' } })
    }
    for (const p of products.filter((p) => p.active && p.totalStock > 0 && p.totalStock <= (p.minStock || 0))) {
      list.push({ type: 'info', title: `Low stock: ${p.name}`, detail: `${p.totalStock} of min ${p.minStock}`, to: '/reorder' })
    }
    if (stats.todayWasteCost > 0) list.push({ type: 'warning', title: 'Waste recorded today', detail: `${money(stats.todayWasteCost)} in recorded loss`, to: '/waste' })
    products.filter((p) => p.active && p.totalStock > 0 && !(p.salesHistory || []).some((d) => d.date >= daysAgoISO(14) && d.units > 0)).slice(0, 3)
      .forEach((p) => list.push({ type: 'info', title: `Slow-moving: ${p.name}`, detail: `No sales in 14 days · ${p.totalStock} in stock`, to: '/reports' }))
    return list.slice(0, 6)
  }, [batches, products, stats.todayWasteCost, soonDays])

  const card = (label: string, value: string, sub: string, to: string, icon: React.ReactNode, chip: string) => (
    <button onClick={() => navigate(to)} className="group relative card card-hover overflow-hidden p-4 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-textsecondary">{label}</span>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 ${chip}`}>{icon}</span>
      </div>
      <div className="text-2xl font-extrabold text-textprimary mt-3 tracking-tight">{value}</div>
      <div className="text-xs text-textmuted mt-1 flex items-center gap-1 group-hover:text-primary transition-colors">{sub}<ArrowRight className="w-3 h-3" /></div>
    </button>
  )

  return (
    <div className="space-y-6 animate-fadeIn">
      <InsightsPanel />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-textprimary tracking-tight">Dashboard</h1>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Command Centre</span>
          </div>
          <p className="text-sm text-textmuted mt-0.5">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="hidden md:flex gap-2">
          <button onClick={() => navigate('/pos')} className="btn-gradient"><ScanLine className="w-4 h-4" /> Scan / POS</button>
          <button onClick={() => navigate('/products/new')} className="btn-secondary"><PackagePlus className="w-4 h-4" /> Add Product</button>
          <button onClick={() => navigate('/receive')} className="btn-secondary"><Boxes className="w-4 h-4" /> Receive</button>
          <button onClick={() => navigate('/expiry')} className="btn-secondary"><CalendarClock className="w-4 h-4" /> Expiry Check</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {card('Today’s Sales', money(stats.todayRevenue), 'for today', '/reports', <DollarSign className="w-5 h-5 text-primary" />, 'bg-blue-50')}
        {card('Gross Profit', money(stats.todayProfit), 'today', '/reports', <TrendingUp className="w-5 h-5 text-success" />, 'bg-success-light')}
        {card('Stock Value', money(stats.stockValue), `${num(stats.activeCount)} products`, '/inventory', <Boxes className="w-5 h-5 text-info2" />, 'bg-blue-50')}
        {card('Expiry Risk', `${num(stats.riskQty)} units`, `${money(stats.riskValue)} at risk`, '/expiry', <AlertTriangle className="w-5 h-5 text-warning" />, 'bg-warning-light')}
        {card('Low Stock', `${num(stats.outOfStock)} out · ${num(stats.lowStock)} low`, 'needs attention', '/reorder', <Layers className="w-5 h-5 text-warning" />, 'bg-warning-light')}
        {card('Waste Today', money(stats.todayWasteCost), 'recorded loss', '/waste', <Trash2 className="w-5 h-5 text-danger" />, 'bg-danger-light')}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h2 className="text-base font-bold text-textprimary tracking-tight">Priority Actions</h2>
          <span className="text-xs text-textmuted">Based on live data</span>
        </div>
        {priorities.length === 0 ? (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-success-soft flex items-center justify-center mb-3"><TrendingUp className="w-6 h-6 text-success" /></div>
            <p className="text-sm font-semibold text-textprimary">All systems nominal</p>
            <p className="text-sm text-textmuted mt-1">No urgent stock issues right now. ✓</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-2 p-4 pt-1">
            {priorities.map((p, i) => (
              <button key={i} onClick={() => navigate(p.to, p.state)}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:border-primary/30 hover:bg-slate-50 hover:shadow-soft transition-all text-left">
                <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ring-4 ${p.type === 'danger' ? 'bg-danger ring-danger/15' : p.type === 'warning' ? 'bg-warning ring-warning/15' : 'bg-info2 ring-info2/10'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-textprimary truncate">{p.title}</div>
                  <div className="text-xs text-textsecondary mt-0.5">{p.detail}</div>
                </div>
                <ArrowRight className="w-4 h-4 ml-auto mt-1 text-textmuted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-4 rounded-full bg-brand-gradient" />
            <h3 className="text-sm font-bold text-textprimary">Sales & Profit — last 7 days</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sales7}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/></linearGradient>
                <linearGradient id="pro" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16A34A" stopOpacity={0.2}/><stop offset="95%" stopColor="#16A34A" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any) => `$${v}`} />
              <Area type="monotone" dataKey="Revenue" stroke="#2563EB" fill="url(#rev)" />
              <Area type="monotone" dataKey="Profit" stroke="#16A34A" fill="url(#pro)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-4 rounded-full bg-cyan2" />
            <h3 className="text-sm font-bold text-textprimary">Top-selling products</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topSellers} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="units" name="Units sold" fill="#06B6D4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-4 rounded-full bg-danger" />
            <h3 className="text-sm font-bold text-textprimary">Waste trend — last 30 days</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={sales30}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any) => `$${v}`} />
              <Area type="monotone" dataKey="Waste" stroke="#DC2626" fill="#DC2626" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-4 rounded-full bg-info2" />
            <h3 className="text-sm font-bold text-textprimary">Stock value by category</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stockByCategory} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => `$${v}`} />
              <Bar dataKey="value" name="Stock value" fill="#0284C7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}