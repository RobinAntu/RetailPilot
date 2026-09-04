import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { money, num } from '../lib/format'
import { formatDateTime, daysAgoISO, formatDate } from '../lib/date'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { WasteRecordModal } from '../components/WasteRecordModal'

export default function Waste() {
  const waste = useDataStore((s) => s.waste)
  const products = useDataStore((s) => s.products)
  const [open, setOpen] = useState(false)

  const today = daysAgoISO(0)
  const weekAgo = daysAgoISO(7)
  const monthAgo = daysAgoISO(30)

  const stats = useMemo(() => {
    const todayCost = waste.filter((w) => w.createdAt.slice(0, 10) === today).reduce((a, w) => a + w.costCents, 0)
    const weekCost = waste.filter((w) => w.createdAt.slice(0, 10) >= weekAgo).reduce((a, w) => a + w.costCents, 0)
    const monthCost = waste.filter((w) => w.createdAt.slice(0, 10) >= monthAgo).reduce((a, w) => a + w.costCents, 0)
    return { todayCost, weekCost, monthCost }
  }, [waste, today, weekAgo, monthAgo])

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {}
    waste.forEach((w) => { const p = products.find((x) => x.id === w.productId); const c = p?.category || 'Other'; m[c] = (m[c] || 0) + w.costCents })
    return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value / 100) })).sort((a, b) => b.value - a.value)
  }, [waste, products])

  const highest = useMemo(() => {
    const m: Record<string, { name: string; cost: number; qty: number }> = {}
    waste.forEach((w) => { const e = m[w.productId] || (m[w.productId] = { name: w.productName, cost: 0, qty: 0 }); e.cost += w.costCents; e.qty += w.qty })
    return Object.values(m).sort((a, b) => b.cost - a.cost).slice(0, 5)
  }, [waste])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Waste</h1><p className="text-sm text-textmuted">Record and analyse product losses.</p></div>
        <button onClick={() => setOpen(true)} className="btn-danger"><Trash2 className="w-4 h-4" /> Record Waste</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Today" value={money(stats.todayCost)} />
        <Stat label="This week" value={money(stats.weekCost)} />
        <Stat label="This month" value={money(stats.monthCost)} />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-bold">Waste records</h3></div>
        {waste.length === 0 ? <EmptyState title="No waste recorded" message="When stock is wasted it will appear here, reducing stock and profitability automatically." action={<button onClick={() => setOpen(true)} className="btn-danger"><Trash2 className="w-4 h-4" /> Record Waste</button>} /> : (
          <table className="table-base"><thead className="bg-page"><tr><th className="th">Date</th><th className="th">Product</th><th className="th">Reason</th><th className="th text-right">Qty</th><th className="th text-right">Cost loss</th><th className="th">By</th></tr></thead><tbody>
            {waste.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((w) => (
              <tr key={w.id} className="table-row"><td className="td text-xs">{formatDate(w.createdAt)}</td><td className="td font-medium">{w.productName}</td><td className="td"><Badge tone="warning">{w.reason}</Badge></td><td className="td text-right">{w.qty}</td><td className="td text-right text-danger font-semibold">{money(w.costCents)}</td><td className="td text-xs">{w.createdByName}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-bold mb-3">Waste by category</h3>
          {byCategory.length === 0 ? <p className="text-sm text-textmuted">No data yet.</p> : byCategory.map((c) => (
            <div key={c.name} className="flex items-center gap-3 py-1.5"><span className="w-32 text-sm truncate">{c.name}</span><div className="flex-1 h-2 bg-page rounded-full overflow-hidden"><div className="h-full bg-danger rounded-full" style={{ width: `${Math.max(4, (c.value / (byCategory[0]?.value || 1)) * 100)}%` }} /></div><span className="w-16 text-right text-sm font-medium">{money(c.value * 100)}</span></div>
          ))}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-bold mb-3">Highest-waste products</h3>
          {highest.length === 0 ? <p className="text-sm text-textmuted">No data yet.</p> : (
            <table className="w-full"><thead className="bg-page"><tr><th className="th">Product</th><th className="th text-right">Units</th><th className="th text-right">Cost</th></tr></thead><tbody>
              {highest.map((h) => <tr key={h.name} className="table-row"><td className="td">{h.name}</td><td className="td text-right">{h.qty}</td><td className="td text-right text-danger">{money(h.cost)}</td></tr>)}
            </tbody></table>
          )}
        </div>
      </div>

      {open && <WasteRecordModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function Stat({ label, value }: any) { return <div className="card p-4"><div className="text-xs text-textmuted">{label}</div><div className="text-2xl font-extrabold text-danger">{value}</div></div> }