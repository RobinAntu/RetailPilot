import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Trash2, Eye, Tag, Boxes, ArrowRight } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { money, num } from '../lib/format'
import { daysUntil, formatDate } from '../lib/date'
import { forecastExpiry } from '../lib/reorder'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { WasteRecordModal } from '../components/WasteRecordModal'

export default function Expiry() {
  const batches = useDataStore((s) => s.batches)
  const products = useDataStore((s) => s.products)
  const sales = useDataStore((s) => s.sales)
  const navigate = useNavigate()
  const [wasteFor, setWasteFor] = useState<any>(null)

  const avgSales = useMemo(() => {
    const map: Record<string, number> = {}
    products.forEach((p) => (map[p.id] = 0))
    sales.filter((s) => s.status !== 'voided').forEach((s) =>
      s.lines.forEach((l) => { map[l.productId] = (map[l.productId] || 0) + l.qty })
    )
    const out: Record<string, number> = {}
    Object.keys(map).forEach((id) => (out[id] = map[id] / 30))
    return out
  }, [sales, products])

  const active = batches.filter((b) => b.qtyRemaining > 0)
  const withExpiry = active.filter((b) => b.expiryDate)
  const untracked = active.filter((b) => !b.expiryDate)

  const groups = [
    { key: 'expired', label: 'Expired', tone: 'danger', list: withExpiry.filter((b) => (daysUntil(b.expiryDate!) ?? 0) < 0) },
    { key: 'critical', label: 'Zero–Two Days', tone: 'danger', list: withExpiry.filter((b) => { const d = daysUntil(b.expiryDate!); return d != null && d >= 0 && d <= 2 }) },
    { key: 'warning', label: 'Three–Seven Days', tone: 'warning', list: withExpiry.filter((b) => { const d = daysUntil(b.expiryDate!); return d != null && d >= 3 && d <= 7 }) },
    { key: 'watch', label: 'Eight–Fourteen Days', tone: 'primary', list: withExpiry.filter((b) => { const d = daysUntil(b.expiryDate!); return d != null && d >= 8 && d <= 14 }) },
  ]
  const totalAtRiskCents = groups[0].list.concat(groups[1].list).reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-textprimary">Expiry Command Centre</h1>
          <p className="text-sm text-textmuted">Financial exposure at risk: <span className="font-semibold text-danger">{money(totalAtRiskCents)}</span></p>
        </div>
        <button onClick={() => navigate('/receive')} className="btn-secondary"><Boxes className="w-4 h-4" /> Receive stock</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GroupStat label="Expired" qty={groups[0].list.reduce((a, b) => a + b.qtyRemaining, 0)} value={groups[0].list.reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)} tone="danger" />
        <GroupStat label="Critical (0–2d)" qty={groups[1].list.reduce((a, b) => a + b.qtyRemaining, 0)} value={groups[1].list.reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)} tone="danger" />
        <GroupStat label="Warning (3–7d)" qty={groups[2].list.reduce((a, b) => a + b.qtyRemaining, 0)} value={groups[2].list.reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)} tone="warning" />
        <GroupStat label="Watch (8–14d)" qty={groups[3].list.reduce((a, b) => a + b.qtyRemaining, 0)} value={groups[3].list.reduce((a, b) => a + b.qtyRemaining * b.unitCostCents, 0)} tone="primary" />
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key} className="card overflow-x-auto">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className={`text-sm font-bold ${g.tone === 'danger' ? 'text-danger' : g.tone === 'warning' ? 'text-warning' : 'text-primary'}`}>{g.label}</h3>
              <span className="text-xs text-textmuted">{g.list.length} batches</span>
            </div>
            {g.list.length === 0 ? (
              <EmptyState title={`Nothing ${g.label.toLowerCase()}`} message={`No ${g.label.toLowerCase()} stock. This is the desired state.`} />
            ) : (
              <table className="table-base"><thead className="bg-page"><tr>
                <th className="th">Product</th><th className="th">Batch</th><th className="th text-right">Qty</th>
                <th className="th">Expiry</th><th className="th text-right">Days left</th><th className="th text-right">Cost value</th>
                <th className="th">Risk</th><th className="th">Forecast</th><th className="th text-right">Actions</th>
              </tr></thead><tbody>
                {g.list.map((b) => {
                  const p = products.find((x) => x.id === b.productId)
                  const d = daysUntil(b.expiryDate!)
                  const f = forecastExpiry(b, avgSales[b.productId] || 0)
                  return (
                    <tr key={b.id} className="table-row">
                      <td className="td"><button onClick={() => navigate(`/products/${b.productId}`)} className="text-primary font-medium hover:underline">{p?.name || '—'}</button></td>
                      <td className="td text-xs text-textmuted">{b.id.slice(0, 8)}</td>
                      <td className="td text-right font-semibold">{b.qtyRemaining}</td>
                      <td className="td">{formatDate(b.expiryDate)}</td>
                      <td className="td text-right"><Badge tone={g.tone as any}>{d} days</Badge></td>
                      <td className="td text-right">{money(b.qtyRemaining * b.unitCostCents)}</td>
                      <td className="td"><RiskBadge d={d} /></td>
                      <td className="td text-xs text-textsecondary max-w-[220px]">{f && f.excessUnits > 0 ? `${f.excessUnits} excess (~${money(f.costAtRiskCents)}) — ${f.note}` : 'On track'}</td>
                      <td className="td text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          <button title="Mark down" onClick={() => navigate('/reorder')} className="p-1.5 rounded-md hover:bg-page text-textmuted hover:text-primary"><Tag className="w-4 h-4" /></button>
                          <button title="Record waste" onClick={() => setWasteFor(b)} className="p-1.5 rounded-md hover:bg-page text-textmuted hover:text-danger"><Trash2 className="w-4 h-4" /></button>
                          <button title="View product" onClick={() => navigate(`/products/${b.productId}`)} className="p-1.5 rounded-md hover:bg-page text-textmuted hover:text-primary"><Eye className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody></table>
            )}
          </div>
        ))}
      </div>

      {/* Untracked */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-textprimary mb-2">Untracked batches</h3>
        {untracked.length === 0 ? <p className="text-sm text-textmuted">All active batches have an expiry recorded.</p> :
          <p className="text-sm text-textmuted">{untracked.length} batches have no expiry date. These won't appear in expiry forecasts until you record one.</p>}
      </div>

      {wasteFor && <WasteRecordModal batch={wasteFor} onClose={() => setWasteFor(null)} />}
    </div>
  )
}

function GroupStat({ label, qty, value, tone }: any) {
  const c = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary'
  return <div className="card p-4"><div className="text-xs text-textmuted">{label}</div><div className={`text-2xl font-extrabold ${c}`}>{num(qty)}</div><div className="text-sm text-textsecondary">{money(value)}</div></div>
}
function RiskBadge({ d }: any) {
  const t = d < 0 ? 'danger' : d <= 2 ? 'danger' : d <= 7 ? 'warning' : 'success'
  return <Badge tone={t}>{d < 0 ? 'Expired' : d <= 2 ? 'Critical' : d <= 7 ? 'High' : 'Medium'}</Badge>
}