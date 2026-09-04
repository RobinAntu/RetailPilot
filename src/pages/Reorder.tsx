import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCcw, ShoppingCart, Truck } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { buildReorderRecommendations } from '../lib/reorder'
import type { PurchaseOrder } from '../types'
import type { ReorderRecommendation } from '../lib/reorder'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/toast'

export default function Reorder() {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const suppliers = useDataStore((s) => s.suppliers)
  const orders = useDataStore((s) => s.orders)
  const sales = useDataStore((s) => s.sales)
  const settings = useDataStore((s) => s.settings)
  const refresh = useDataStore((s) => s.refresh)
  const navigate = useNavigate()

  const [selected, setSelected] = useState<Record<string, number>>({})

  const recs = useMemo(() => {
    // avg daily sales per product (last 30 days)
    const avg: Record<string, number> = {}
    products.forEach((p) => (avg[p.id] = 0))
    sales.filter((s) => s.status !== 'voided').forEach((s) => s.lines.forEach((l) => { avg[l.productId] = (avg[l.productId] || 0) + l.qty }))
    Object.keys(avg).forEach((k) => (avg[k] = avg[k] / 30))
    // incoming qty from open purchase orders
    const incoming: Record<string, number> = {}
    orders.filter((o) => o.status === 'submitted').forEach((o) => o.lines.forEach((l) => { incoming[l.productId] = (incoming[l.productId] || 0) + (l.qty - (l.receivedQty || 0)) }))
    const list = buildReorderRecommendations(products, { avgDailySalesByProduct: avg, incomingByProduct: incoming }, settings?.safetyStockDays ?? 2)
    // attach real supplier lead time
    return list.map((r) => {
      const p = products.find((x) => x.id === r.productId)
      const sup = suppliers.find((x) => x.id === p?.supplierId)
      const lead = sup?.leadTimeDays || 2
      const reorderPoint = Math.round(r.avgDailySales * lead + r.safetyStock)
      const target = Math.max(reorderPoint + Math.round(r.avgDailySales * 2), p?.targetStock || 0)
      return { ...r, leadTimeDays: lead, reorderPoint, targetStock: target, suggestedQty: Math.max(0, target - r.currentStock - r.incomingQty), reason: r.urgency === 'out_of_stock' ? 'Out of stock — order to target stock.' : `Stock ${r.currentStock} at/below reorder point (${reorderPoint}) from ${r.avgDailySales.toFixed(1)}/day × ${lead}-day lead + ${r.safetyStock} safety.` }
    })
  }, [products, sales, orders, suppliers, settings])

  const groups = {
    out_of_stock: recs.filter((r) => r.urgency === 'out_of_stock'),
    order_now: recs.filter((r) => r.urgency === 'order_now'),
    watch: recs.filter((r) => r.urgency === 'watch'),
  }

  const totalSelected = Object.values(selected).reduce((a, b) => a + (b || 0), 0)

  const toggle = (id: string, suggested: number) => setSelected((s) => {
    const n = { ...s }
    if (n[id] !== undefined) delete n[id]
    else n[id] = suggested
    return n
  })
  const setQty = (id: string, q: number) => setSelected((s) => ({ ...s, [id]: Math.max(0, q) }))

  const createOrder = async () => {
    const items = recs.filter((r) => selected[r.productId] !== undefined)
    if (items.length === 0) return
    const supplierId = products.find((x) => x.id === items[0].productId)?.supplierId || ''
    const orderNumber = 'PO-' + String(Date.now()).slice(-6)
    const po: PurchaseOrder = {
      id: 'po_' + Math.random().toString(36).slice(2, 10), storeId: session.storeId, orderNumber,
      supplierId, supplierName: supplierId ? suppliers.find((x) => x.id === supplierId)?.name || '' : '',
      status: 'draft',
      lines: items.map((r) => {
        const p = products.find((x) => x.id === r.productId)!
        return { productId: p.id, productName: p.name, barcode: p.barcode, qty: selected[r.productId] || 0, unitCostCents: p.costCents, totalCents: (selected[r.productId] || 0) * p.costCents, receivedQty: 0 }
      }),
      totalCents: items.reduce((a, r) => a + (selected[r.productId] || 0) * (products.find((x) => x.id === r.productId)?.costCents || 0), 0),
      expectedDeliveryDate: '', notes: 'Generated from reorder recommendations', createdBy: session.uid, createdByName: session.name, createdAt: new Date().toISOString(),
    }
    await backend.savePurchaseOrder(po)
    toast('success', 'Purchase order created', `${orderNumber} is saved as a draft.`)
    refresh()
    setSelected({})
  }

  const renderGroup = (title: string, tone: any, list: any[], emptyMsg: string) => (
    <div className="card overflow-x-auto">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2"><h3 className={`text-sm font-bold ${tone}`}>{title}</h3><span className="text-xs text-textmuted">{list.length}</span></div>
      {list.length === 0 ? <EmptyState title={emptyMsg} /> : (
        <table className="table-base"><thead className="bg-page"><tr><th className="th">Product</th><th className="th text-right">Stock</th><th className="th text-right">Avg/day</th><th className="th text-right">Lead</th><th className="th text-right">Reorder pt</th><th className="th text-right">Target</th><th className="th">Why</th><th className="th text-center">Order</th></tr></thead><tbody>
          {list.map((r: ReorderRecommendation) => (
            <tr key={r.productId} className="table-row">
              <td className="td"><button onClick={() => navigate(`/products/${r.productId}`)} className="font-medium text-primary hover:underline">{r.productName}</button></td>
              <td className="td text-right font-semibold">{r.currentStock}</td>
              <td className="td text-right">{r.avgDailySales.toFixed(1)}</td>
              <td className="td text-right">{r.leadTimeDays}d</td>
              <td className="td text-right">{r.reorderPoint}</td>
              <td className="td text-right">{r.targetStock}</td>
              <td className="td text-xs text-textsecondary max-w-[240px]">{r.reason}</td>
              <td className="td text-center">
                <div className="inline-flex items-center gap-2">
                  {selected[r.productId] !== undefined && (
                    <input type="number" className="w-16 input !py-1 !px-2 text-center" value={selected[r.productId] || 0} onChange={(e) => setQty(r.productId, parseInt(e.target.value || '0', 10) || 0)} />
                  )}
                  <button onClick={() => toggle(r.productId, r.suggestedQty)} className={`btn !py-1.5 !px-3 ${selected[r.productId] !== undefined ? 'bg-primary text-white' : 'bg-secondary text-textsecondary border-border'}`}>{selected[r.productId] !== undefined ? 'Remove' : 'Order'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Reorder Centre</h1><p className="text-sm text-textmuted">Recommendations driven by real sales, stock, lead times and incoming orders.</p></div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/orders')} className="btn-secondary"><Truck className="w-4 h-4" /> Purchase orders</button>
          <button onClick={createOrder} disabled={totalSelected === 0} className="btn-primary"><ShoppingCart className="w-4 h-4" /> Create purchase order ({totalSelected})</button>
        </div>
      </div>
      <div className="space-y-4">
        {renderGroup('Out of stock', 'text-danger', groups.out_of_stock, 'Nothing is out of stock.')}
        {renderGroup('Order now', 'text-warning', groups.order_now, 'No items at their reorder point.')}
        {renderGroup('Watch', 'text-primary', groups.watch, 'Nothing is close to reordering.')}
      </div>
      <p className="text-xs text-textmuted">Recommendations use average daily sales, supplier lead time, safety stock and incoming purchase orders. Forecasts are estimates, not guarantees.</p>
    </div>
  )
}