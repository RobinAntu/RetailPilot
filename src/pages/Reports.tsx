import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useDataStore } from '../store/appStore'
import { money, num, pct } from '../lib/format'
import { daysAgoISO, formatDate, lastNDates, todayISO, addDaysISO } from '../lib/date'
import { downloadCsv, downloadXlsx } from '../lib/xlsx'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/toast'

type RangeKey = 'today' | 'yesterday' | '7' | '30' | 'custom'
type ReportKey = 'profit' | 'sales' | 'inventory' | 'expiry' | 'waste' | 'reorder' | 'category' | 'product' | 'supplier' | 'transactions'

export default function Reports() {
  const { sales, products, batches, waste, suppliers, orders, session } = useDataStore()
  const refresh = useDataStore((s) => s.refresh)
  const [range, setRange] = useState<RangeKey>('7')
  const [report, setReport] = useState<ReportKey>('profit')
  const [from, setFrom] = useState(daysAgoISO(7))
  const [to, setTo] = useState(daysAgoISO(0))

  const { fromISO, rangeTo } = useMemo(() => {
    if (range === 'custom') return { fromISO: from, rangeTo: to }
    const today = daysAgoISO(0)
    if (range === 'today') return { fromISO: today, rangeTo: today }
    if (range === 'yesterday') { const y = daysAgoISO(1); return { fromISO: y, rangeTo: y } }
    return { fromISO: daysAgoISO(Number(range)), rangeTo: today }
  }, [range, from, to])

  const s = (iso: string) => iso.slice(0, 10) >= fromISO && iso.slice(0, 10) <= rangeTo

  const data = useMemo(() => {
    const validSales = sales.filter((x) => x.status !== 'voided' && s(x.timestamp))
    const revenue = validSales.reduce((a, x) => a + x.totalCents, 0)
    const cogs = validSales.reduce((a, x) => a + x.cogsCents, 0)
    const grossProfit = revenue - cogs
    const wasteCost = waste.filter((w) => s(w.createdAt)).reduce((a, w) => a + w.costCents, 0)
    const unitsSold = validSales.reduce((a, x) => a + x.lines.reduce((q, l) => q + l.qty, 0), 0)
    // product performance
    const pmap: Record<string, any> = {}
    validSales.forEach((sale) => sale.lines.forEach((l) => {
      const e = pmap[l.productId] || (pmap[l.productId] = { id: l.productId, name: l.name, units: 0, revenue: 0, cogs: 0 })
      e.units += l.qty; e.revenue += l.lineTotalCents; e.cogs += (l.cogsCents || 0)
    }))
    waste.forEach((w) => { const e = pmap[w.productId]; if (e) e.wasteCost = (e.wasteCost || 0) + w.costCents })
    const productPerf = Object.values(pmap).map((p) => ({ ...p, profit: p.revenue - p.cogs }))
    // category
    const cmap: Record<string, any> = {}
    productPerf.forEach((p) => { const prod = products.find((x) => x.id === p.id); const c = prod?.category || 'Other'; const e = cmap[c] || (cmap[c] = { name: c, revenue: 0, cogs: 0, waste: 0 }); e.revenue += p.revenue; e.cogs += p.cogs; e.waste += (p.wasteCost || 0) })
    const category = Object.values(cmap).map((c) => ({ ...c, profit: c.revenue - c.cogs }))
    // supplier performance
    const smap: Record<string, any> = {}
    productPerf.forEach((p) => { const prod = products.find((x) => x.id === p.id); const sn = prod?.supplierName || 'No supplier'; const e = smap[sn] || (smap[sn] = { name: sn, revenue: 0, cogs: 0 }); e.revenue += p.revenue; e.cogs += p.cogs })
    const supplier = Object.values(smap).map((x) => ({ ...x, profit: x.revenue - x.cogs }))
    // expiry
    const expiring = batches.filter((b) => b.qtyRemaining > 0 && b.expiryDate)
    const expired = expiring.filter((b) => (b.expiryDate as string) < todayISO()).reduce((a, b) => a + b.qtyRemaining, 0)
    const expiringSoon = expiring.filter((b) => (b.expiryDate as string) >= todayISO() && (b.expiryDate as string) <= addDaysISO(todayISO(), 7)).reduce((a, b) => a + b.qtyRemaining, 0)
    // reorder count
    const lowStock = products.filter((p) => p.active && p.totalStock <= (p.minStock || 0)).length
    const outOfStock = products.filter((p) => p.active && p.totalStock <= 0).length

    const byDay = lastNDates(7).map((d) => {
      const daySales = sales.filter((x) => x.status !== 'voided' && x.timestamp.slice(0, 10) === d)
      return { day: d.slice(5), Revenue: Math.round(daySales.reduce((a, x) => a + x.totalCents, 0) / 100), Profit: Math.round((daySales.reduce((a, x) => a + x.totalCents, 0) - daySales.reduce((a, x) => a + x.cogsCents, 0)) / 100) }
    })

    return { revenue, cogs, grossProfit, wasteCost, salesUnits: unitsSold, salesCount: validSales.length, expired, expiringSoon, lowStock, outOfStock, productPerf, category, supplier, byDay }
  }, [sales, waste, batches, products, suppliers, orders, fromISO, rangeTo])

  const transactions = useDataStore((s) => s.sales).filter((x) => x.status !== 'voided' && s(x.timestamp))

  const margin = data.revenue > 0 ? (data.grossProfit / data.revenue) * 100 : 0
  const mostProfitable = [...data.productPerf].sort((a, b) => b.profit - a.profit).slice(0, 5)
  const lowestMargin = [...data.productPerf].filter((p) => p.revenue > 0).sort((a, b) => ((a.revenue - a.cogs) / a.revenue) - ((b.revenue - b.cogs) / b.revenue)).slice(0, 5)
  const topCategories = [...data.category].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const topWasteCategories = [...data.category].sort((a, b) => b.waste - a.waste).filter((c) => c.waste > 0).slice(0, 5)

  const exportReport = () => {
    downloadXlsx([
      { name: 'Profit', rows: [{ Revenue: money(data.revenue), COGS: money(data.cogs), 'Gross Profit': money(data.grossProfit), 'Gross Margin %': margin.toFixed(1), 'Waste Cost': money(data.wasteCost), 'Sales Count': data.salesCount, Range: `${fromISO} → ${rangeTo}` }] },
      { name: 'Inventory', rows: products.filter((p) => p.active).map((p) => ({ Name: p.name, Barcode: p.barcode, Stock: p.totalStock, Cost: money(p.costCents), Sell: money(p.sellCents), Value: money(p.stockValueCents || 0) })) },
      { name: 'Sales', rows: transactions.map((t) => ({ Sale: t.saleNumber, Date: t.timestamp, Total: money(t.totalCents), COGS: money(t.cogsCents), Profit: money(t.totalCents - t.cogsCents), Payment: t.paymentMethod })) },
      { name: 'Expiry', rows: batches.filter((b) => b.qtyRemaining > 0 && b.expiryDate).map((b) => ({ Product: products.find((p) => p.id === b.productId)?.name, Expiry: b.expiryDate, Qty: b.qtyRemaining, Value: money(b.qtyRemaining * b.unitCostCents) })) },
      { name: 'Waste', rows: waste.map((w) => ({ Date: w.createdAt, Product: w.productName, Reason: w.reason, Qty: w.qty, Cost: money(w.costCents) })) },
      { name: 'Reorder', rows: products.filter((p) => p.active && p.totalStock <= (p.minStock || 0)).map((p) => ({ Name: p.name, Stock: p.totalStock, Min: p.minStock, Suggested: Math.max(0, (p.targetStock || 0) - (p.totalStock || 0)) })) },
      { name: 'Suppliers', rows: suppliers.map((s) => ({ Name: s.name, Contact: s.contactPerson, Phone: s.phone, Email: s.email, LeadTime: s.leadTimeDays, Active: s.active })) },
    ], `retailpilot-full-workbook-${fromISO}-to-${rangeTo}`)
    toast('success', 'Workbook exported', 'Full Excel workbook downloaded.')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Reports</h1><p className="text-sm text-textmuted">{formatDate(fromISO)} → {formatDate(rangeTo)}</p></div>
        <div className="flex gap-2">
          <button onClick={() => exportReport()} className="btn-primary"><FileSpreadsheet className="w-4 h-4" /> Full Workbook</button>
          <button onClick={() => exportCsvFor(report, data, products, batches, waste, suppliers, transactions, fromISO, rangeTo)} className="btn-secondary"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-page rounded-lg p-1">
          {(['today', 'yesterday', '7', '30', 'custom'] as RangeKey[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-sm rounded-md ${range === r ? 'bg-white shadow-card font-semibold text-primary' : 'text-textsecondary'}`}>{labelRange(r)}</button>
          ))}
        </div>
        {range === 'custom' && <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-auto" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-auto" />
        </>}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {(['profit', 'sales', 'inventory', 'expiry', 'waste', 'reorder', 'category', 'product', 'supplier', 'transactions'] as ReportKey[]).map((r) => (
          <button key={r} onClick={() => setReport(r)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${report === r ? 'border-primary text-primary' : 'border-transparent text-textmuted'}`}>{reportLabel(r)}</button>
        ))}
      </div>

      {report === 'profit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPI label="Revenue" value={money(data.revenue)} /><KPI label="COGS" value={money(data.cogs)} />
            <KPI label="Gross Profit" value={money(data.grossProfit)} tone={data.grossProfit >= 0 ? 'text-success' : 'text-danger'} />
            <KPI label="Gross Margin" value={pct(margin)} /><KPI label="Waste Cost" value={money(data.wasteCost)} tone="text-danger" />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-3">Revenue & Profit — last 7 days</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.byDay}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} /><Tooltip formatter={(v) => `$${v}`} />
                <Area type="monotone" dataKey="Revenue" stroke="#2563EB" fill="#2563EB" fillOpacity={0.15} /><Area type="monotone" dataKey="Profit" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} /></AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <MiniTable title="Most profitable products" head={['Product', 'Profit']} rows={mostProfitable.map((p) => [p.name, money(p.profit)])} tone="text-success" />
            <MiniTable title="Lowest-margin products" head={['Product', 'Margin']} rows={lowestMargin.map((p) => [p.name, pct(((p.revenue - p.cogs) / p.revenue) * 100)])} tone="text-danger" />
          </div>
        </div>
      )}

      {report === 'category' && <div className="grid md:grid-cols-2 gap-4">
        <MiniTable title="Highest-revenue categories" head={['Category', 'Revenue', 'Profit']} rows={topCategories.map((c) => [c.name, money(c.revenue), money(c.profit)])} />
        <MiniTable title="Highest-waste categories" head={['Category', 'Waste']} rows={topWasteCategories.map((c) => [c.name, money(c.waste)])} tone="text-danger" />
      </div>}

      {report === 'product' && (
        <div className="card overflow-x-auto">
          {data.productPerf.length === 0 ? <EmptyState title="No sales in this range" /> : (
            <table className="table-base"><thead className="bg-page"><tr><th className="th">Product</th><th className="th text-right">Units</th><th className="th text-right">Revenue</th><th className="th text-right">COGS</th><th className="th text-right">Profit</th><th className="th text-right">Margin</th><th className="th text-right">Waste</th></tr></thead><tbody>
              {data.productPerf.map((p) => <tr key={p.id} className="table-row"><td className="td font-medium">{p.name}</td><td className="td text-right">{p.units}</td><td className="td text-right">{money(p.revenue)}</td><td className="td text-right">{money(p.cogs)}</td><td className="td text-right">{money(p.profit)}</td><td className="td text-right">{p.revenue > 0 ? pct(((p.revenue - p.cogs) / p.revenue) * 100) : '—'}</td><td className="td text-right text-danger">{p.wasteCost ? money(p.wasteCost) : '—'}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}

      {report === 'supplier' && <MiniTable title="Supplier performance" head={['Supplier', 'Revenue', 'COGS', 'Profit']} rows={data.supplier.map((x) => [x.name, money(x.revenue), money(x.cogs), money(x.profit)])} />}

      {report === 'sales' && <KpiGrid items={[['Sales count', num(data.salesCount)], ['Units sold', num(data.salesUnits)], ['Revenue', money(data.revenue)], ['Profit', money(data.grossProfit)]]} />}

      {report === 'inventory' && <KpiGrid items={[['Active products', num(products.filter((p) => p.active).length)], ['Stock value', money(products.reduce((a, p) => a + (p.stockValueCents || 0), 0))], ['Low stock', num(data.lowStock)], ['Out of stock', num(data.outOfStock)]]} />}

      {report === 'expiry' && <KpiGrid items={[['Expired units', num(data.expired)], ['Expiring soon (7d)', num(data.expiringSoon)], ['Active batches', num(batches.filter((b) => b.qtyRemaining > 0).length)]]} />}

      {report === 'waste' && <KpiGrid items={[['Waste cost', money(data.wasteCost)], ['Waste records', num(waste.length)]]} />}

      {report === 'reorder' && <KpiGrid items={[['Low stock', num(data.lowStock)], ['Out of stock', num(data.outOfStock)], ['Open orders', num(orders.filter((o) => o.status === 'submitted' || o.status === 'draft').length)]]} />}

      {report === 'transactions' && (
        <div className="card overflow-x-auto">
          {transactions.length === 0 ? <EmptyState title="No transactions in range" /> : (
            <table className="table-base"><thead className="bg-page"><tr><th className="th">Receipt</th><th className="th">Date</th><th className="th">Cashier</th><th className="th">Payment</th><th className="th text-right">Items</th><th className="th text-right">Total</th><th className="th text-right">Profit</th><th className="th">Status</th></tr></thead><tbody>
              {transactions.map((t) => <tr key={t.id} className="table-row"><td className="td">#{t.saleNumber}</td><td className="td text-xs">{formatDate(t.timestamp)}</td><td className="td text-xs">{t.createdByName}</td><td className="td"><Badge tone="muted">{t.paymentMethod}</Badge></td><td className="td text-right">{t.lines.reduce((a, l) => a + l.qty, 0)}</td><td className="td text-right font-semibold">{money(t.totalCents)}</td><td className="td text-right">{money(t.totalCents - t.cogsCents)}</td><td className="td"><Badge tone={t.status === 'voided' ? 'danger' : 'success'}>{t.status}</Badge></td></tr>)}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  )
}
function labelRange(r: string) {
  return { today: 'Today', yesterday: 'Yesterday', '7': '7 days', '30': '30 days', custom: 'Custom' }[r] || r
}
function reportLabel(r: string): string {
  return { profit: 'Profit', sales: 'Sales', inventory: 'Inventory', expiry: 'Expiry', waste: 'Waste', reorder: 'Reorder', category: 'Category Performance', product: 'Product Performance', supplier: 'Supplier Performance', transactions: 'Transactions' }[r] || r
}
function KPI({ label, value, tone }: any) {
  return <div className="card p-4"><div className="text-xs text-textmuted">{label}</div><div className={`text-2xl font-extrabold ${tone || 'text-textprimary'}`}>{value}</div></div>
}
function KpiGrid({ items }: { items: [string, string][] }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{items.map(([l, v]) => <KPI key={l} label={l} value={v} />)}</div>
}
function MiniTable({ title, head, rows, tone }: any) {
  return <div className="card overflow-x-auto"><div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-bold">{title}</h3></div>
    <table className="w-full"><thead className="bg-page"><tr>{head.map((h: string) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>
      {rows.map((r: any, i: number) => <tr key={i} className="table-row">{r.map((c: any, j: number) => <td key={j} className={`td ${j > 0 && tone ? tone : ''} ${j > 0 ? 'text-right' : ''}`}>{c}</td>)}</tr>)}
    </tbody></table></div>
}

function exportCsvFor(report: string, data: any, products: any, batches: any, waste: any, suppliers: any, transactions: any, fromISO: string, rangeTo: string) {
  const name = `report-${report}-${fromISO}-to-${rangeTo}`
  let rows: Record<string, unknown>[] = []
  if (report === 'profit') rows = [{ Revenue: money(data.revenue), COGS: money(data.cogs), 'Gross Profit': money(data.grossProfit), 'Gross Margin %': (data.revenue ? ((data.grossProfit / data.revenue) * 100).toFixed(1) : '0') + '%', 'Waste Cost': money(data.wasteCost), 'Sales Count': data.salesCount }]
  else if (report === 'sales') rows = transactions.map((t: any) => ({ Sale: t.saleNumber, Date: t.timestamp, Total: money(t.totalCents), Profit: money(t.totalCents - t.cogsCents), Payment: t.paymentMethod }))
  else if (report === 'inventory') rows = products.filter((p: any) => p.active).map((p: any) => ({ Name: p.name, Stock: p.totalStock, Value: money(p.stockValueCents || 0), Cost: money(p.costCents), Sell: money(p.sellCents) }))
  else if (report === 'expiry') rows = batches.filter((b: any) => b.qtyRemaining > 0 && b.expiryDate).map((b: any) => ({ Product: products.find((p: any) => p.id === b.productId)?.name, Expiry: b.expiryDate, Qty: b.qtyRemaining, Value: money(b.qtyRemaining * b.unitCostCents) }))
  else if (report === 'waste') rows = waste.map((w: any) => ({ Date: w.createdAt, Product: w.productName, Reason: w.reason, Qty: w.qty, Cost: money(w.costCents) }))
  else if (report === 'reorder') rows = products.filter((p: any) => p.active && p.totalStock <= (p.minStock || 0)).map((p: any) => ({ Name: p.name, Stock: p.totalStock, Min: p.minStock }))
  else if (report === 'product') rows = data.productPerf.map((p: any) => ({ Product: p.name, Units: p.units, Revenue: money(p.revenue), COGS: money(p.cogs), Profit: money(p.profit), Waste: p.wasteCost ? money(p.wasteCost) : '' }))
  else if (report === 'supplier') rows = data.supplier.map((x: any) => ({ Supplier: x.name, Revenue: money(x.revenue), COGS: money(x.cogs), Profit: money(x.profit) }))
  else if (report === 'transactions') rows = transactions.map((t: any) => ({ Sale: t.saleNumber, Date: t.timestamp, Cashier: t.createdByName, Total: money(t.totalCents), Payment: t.paymentMethod }))
  downloadCsv(rows, name)
  toast('success', 'CSV exported', `${name}.csv downloaded.`)
}
