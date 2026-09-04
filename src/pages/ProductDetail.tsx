import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, PackagePlus, SlidersHorizontal, Archive, Boxes, Barcode,
  CircleDollarSign, History, Trash2,
} from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { money, pct } from '../lib/format'
import { formatDate, formatDateTime, daysUntil } from '../lib/date'
import { barcodeType } from '../lib/barcode'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { AdjustStockModal } from '../components/AdjustStockModal'
import { toast } from '../components/ui/toast'

type Tab = 'overview' | 'batches' | 'sales' | 'receiving' | 'waste' | 'prices' | 'audit'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const sales = useDataStore((s) => s.sales)
  const waste = useDataStore((s) => s.waste)
  const auditLogs = useDataStore((s) => s.auditLogs)
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [tab, setTab] = useState<Tab>('overview')
  const [adjust, setAdjust] = useState(false)

  const product = products.find((p) => p.id === id)
  const productBatches = useMemo(() => batches.filter((b) => b.productId === id).sort((a, b) => (a.expiryDate || '9999') < (b.expiryDate || '9999') ? -1 : 1), [batches, id])
  const productSales = useMemo(() => sales.filter((s) => s.status !== 'voided' && s.lines.some((l) => l.productId === id)), [sales, id])
  const productWaste = waste.filter((w) => w.productId === id)
  const priceLog = auditLogs.filter((a) => a.entityType === 'product' && a.entityId === id && (a.action === 'product.edit' || a.action === 'product.create'))

  if (!product) {
    return <EmptyState title="Product not found" message="This product may have been removed." action={<button onClick={() => navigate('/inventory')} className="btn-primary">Back to Inventory</button>} />
  }

  const marginPct = product.sellCents > 0 ? ((product.sellCents - product.costCents) / product.sellCents) * 100 : 0
  const nearest = productBatches.find((b) => b.qtyRemaining > 0 && b.expiryDate)
  const statusTone = product.totalStock <= 0 ? 'danger' : product.totalStock <= (product.minStock || 0) ? 'warning' : 'success'

  const archive = async () => {
    await backend.saveProduct({ ...product, active: false })
    await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'product.archive', entityType: 'product', entityId: product.id })
    toast('success', 'Product archived', product.name)
    refresh()
    navigate('/inventory')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/inventory')} className="btn-secondary !p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-textprimary truncate">{product.name}</h1>
          <p className="text-sm text-textmuted">{product.barcode || 'No barcode'} · {barcodeType(product.barcode)} · {product.sku}</p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={() => navigate('/products/new', { state: { product } })} className="btn-secondary"><Pencil className="w-4 h-4" /> Edit</button>
          <button onClick={() => navigate('/receive', { state: { productId: product.id } })} className="btn-primary"><PackagePlus className="w-4 h-4" /> Receive</button>
          <button onClick={() => setAdjust(true)} className="btn-secondary"><SlidersHorizontal className="w-4 h-4" /> Adjust</button>
          {product.active && <button onClick={archive} className="btn-secondary"><Archive className="w-4 h-4" /> Archive</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {(['overview', 'batches', 'sales', 'receiving', 'waste', 'prices', 'audit'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t ? 'border-primary text-primary' : 'border-transparent text-textmuted hover:text-textsecondary'}`}>{label(t)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5 space-y-3 text-sm">
            <Row label="Category" value={product.category} /><Row label="Brand" value={product.brand || '—'} />
            <Row label="Supplier" value={product.supplierName || '—'} /><Row label="Unit" value={product.unit} />
            <Row label="Aisle / Shelf" value={`${product.aisle || '—'} / ${product.shelf || '—'}`} />
            <Row label="Expiry tracking" value={product.expiryTracking} /><Row label="Status" value={product.active ? 'Active' : 'Inactive'} />
          </div>
          <div className="card p-5 space-y-3 text-sm">
            <Stat label="Current stock" value={`${product.totalStock ?? 0} ${product.unit}`} tone={statusTone} />
            <Stat label="Stock value" value={money(product.stockValueCents || 0)} />
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <Stat label="Cost price" value={money(product.costCents)} /><Stat label="Selling price" value={money(product.sellCents)} />
              <Stat label="Profit per unit" value={money(product.sellCents - product.costCents)} tone={marginPct >= 0 ? 'text-success' : 'text-danger'} />
              <Stat label="Gross margin" value={pct(marginPct)} tone="text-primary" />
            </div>
            <Row label="Nearest expiry" value={nearest ? formatDate(nearest.expiryDate) : '—'} />
          </div>
        </div>
      )}

      {tab === 'batches' && (
        <div className="card overflow-x-auto">
          {productBatches.length === 0 ? <EmptyState title="No stock batches" message="Receive stock to create batches with expiry tracking." action={<button onClick={() => navigate('/receive', { state: { productId: product.id } })} className="btn-primary"><PackagePlus className="w-4 h-4" /> Receive stock</button>} />
            : (
              <table className="table-base"><thead className="bg-page"><tr><th className="th">Received</th><th className="th">Expiry</th><th className="th text-right">Received</th><th className="th text-right">Remaining</th><th className="th text-right">Unit cost</th><th className="th">Lot</th><th className="th">Supplier</th><th className="th">Status</th></tr></thead><tbody>
                {productBatches.map((b) => {
                  const d = b.expiryDate ? daysUntil(b.expiryDate) : null
                  const tone = !b.expiryDate ? 'muted' : d == null || d < 0 ? 'danger' : d <= 7 ? 'warning' : 'success'
                  return <tr key={b.id} className="table-row">
                    <td className="td text-xs">{formatDate(b.receivedDate)}</td>
                    <td className="td text-xs">{b.expiryDate ? formatDate(b.expiryDate) : 'No expiry'}</td>
                    <td className="td text-right">{b.qtyReceived}</td>
                    <td className="td text-right font-semibold">{b.qtyRemaining}</td>
                    <td className="td text-right">{money(b.unitCostCents)}</td>
                    <td className="td text-xs">{b.lotNumber || '—'}</td>
                    <td className="td text-xs">{b.supplierName || '—'}</td>
                    <td className="td"><Badge tone={tone as any}>{b.qtyRemaining <= 0 ? 'Depleted' : tone === 'muted' ? 'No expiry' : `${d}d left`}</Badge></td>
                  </tr>
                })}
              </tbody></table>
            )
          }
        </div>
      )}

      {tab === 'sales' && (
        <div className="card overflow-x-auto">
          <SaleTable sales={productSales} />
        </div>
      )}

      {tab === 'receiving' && (
        <div className="card overflow-x-auto">
          {productBatches.length === 0 ? <EmptyState title="No receiving records" /> : (
            <table className="w-full"><thead className="bg-page"><tr><th className="th">Received date</th><th className="th text-right">Qty</th><th className="th">Expiry</th><th className="th">Lot</th><th className="th">Supplier</th><th className="th">Received by</th></tr></thead><tbody>
              {productBatches.map((b) => <tr key={b.id} className="table-row"><td className="td text-xs">{formatDate(b.receivedDate)}</td><td className="td text-right">{b.qtyReceived}</td><td className="td text-xs">{b.expiryDate ? formatDate(b.expiryDate) : '—'}</td><td className="td text-xs">{b.lotNumber || '—'}</td><td className="td text-xs">{b.supplierName || '—'}</td><td className="td text-xs">{b.createdByName}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}

      {tab === 'waste' && (
        <div className="card overflow-x-auto">
          {productWaste.length === 0 ? <EmptyState title="No waste recorded" message="When stock is wasted it appears here." /> : (
            <table className="w-full"><thead className="bg-page"><tr><th className="th">Date</th><th className="th">Reason</th><th className="th text-right">Qty</th><th className="th text-right">Cost</th><th className="th">By</th><th className="th">Notes</th></tr></thead><tbody>
              {productWaste.map((w) => <tr key={w.id} className="table-row"><td className="td text-xs">{formatDateTime(w.createdAt)}</td><td className="td"><Badge tone="warning">{w.reason}</Badge></td><td className="td text-right">{w.qty}</td><td className="td text-right text-danger">{money(w.costCents)}</td><td className="td text-xs">{w.createdByName}</td><td className="td text-xs">{w.notes || '—'}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}

      {tab === 'prices' && (
        <div className="card overflow-x-auto">
          {priceLog.length === 0 ? <EmptyState title="No price history yet" message="Price changes are recorded here automatically." /> : (
            <table className="w-full"><thead className="bg-page"><tr><th className="th">When</th><th className="th">Action</th><th className="th text-right">Cost before</th><th className="th text-right">Cost after</th><th className="th text-right">Sell before</th><th className="th text-right">Sell after</th><th className="th">By</th></tr></thead><tbody>
              {priceLog.map((a) => {
                const b = (a.beforeState || {}) as any; const aft = (a.afterState || {}) as any
                return <tr key={a.id} className="table-row"><td className="td text-xs">{formatDateTime(a.timestamp)}</td><td className="td"><Badge tone={a.action === 'product.create' ? 'success' : 'primary'}>{a.action}</Badge></td><td className="td text-right">{b.cost != null ? money(b.cost) : '—'}</td><td className="td text-right">{aft.cost != null ? money(aft.cost) : '—'}</td><td className="td text-right">{b.sell != null ? money(b.sell) : '—'}</td><td className="td text-right">{aft.sell != null ? money(aft.sell) : '—'}</td><td className="td text-xs">{a.userName}</td></tr>
              })}
            </tbody></table>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card overflow-x-auto">
          <AuditTable log={auditLogs.filter((a) => a.entityId === id)} />
        </div>
      )}

      {adjust && <AdjustStockModal product={product} onClose={() => setAdjust(false)} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b border-border pb-2"><span className="text-textsecondary">{label}</span><span className="font-medium text-textprimary">{value}</span></div>
}
function Stat({ label, value, tone }: any) { return <div><div className="text-xs text-textmuted">{label}</div><div className={`text-lg font-extrabold ${tone || 'text-textprimary'}`}>{value}</div></div> }
function label(t: Tab) { return { overview: 'Overview', batches: 'Stock Batches', sales: 'Sales History', receiving: 'Receiving History', waste: 'Waste', prices: 'Price History', audit: 'Audit History' }[t] }
function SaleTable({ sales }: { sales: any[] }) {
  return sales.length === 0 ? <EmptyState title="No sales yet" message="Sales of this product appear here." /> : (
    <table className="w-full"><thead className="bg-page"><tr><th className="th">Receipt #</th><th className="th">Date</th><th className="th text-right">Qty</th><th className="th text-right">Revenue</th><th className="th text-right">COGS</th><th className="th text-right">Profit</th></tr></thead><tbody>
      {sales.map((s) => {
        const line = (s.lines && s.lines[0]) || {}
        return (
          <tr key={s.id} className="table-row">
            <td className="td">#{s.saleNumber}</td>
            <td className="td text-xs">{formatDateTime(s.timestamp)}</td>
            <td className="td text-right">{line.qty || 0}</td>
            <td className="td text-right">{money(line.lineTotalCents || 0)}</td>
            <td className="td text-right">{money(line.cogsCents || 0)}</td>
            <td className="td text-right text-success">{money((line.lineTotalCents || 0) - (line.cogsCents || 0))}</td>
          </tr>
        )
      })}
    </tbody></table>
  )
}
function AuditTable({ log }: { log: any[] }) {
  return log.length === 0 ? <EmptyState title="No audit records" /> : (
    <table className="w-full"><thead className="bg-page"><tr><th className="th">When</th><th className="th">Action</th><th className="th">By</th><th className="th">Reason</th></tr></thead><tbody>
      {log.map((a) => <tr key={a.id} className="table-row"><td className="td text-xs">{formatDateTime(a.timestamp)}</td><td className="td"><Badge tone="muted">{a.action}</Badge></td><td className="td text-xs">{a.userName}</td><td className="td text-xs">{a.reason || '—'}</td></tr>)}
    </tbody></table>
  )
}