import { useMemo, useState } from 'react'
import { Plus, Truck, PackagePlus, Send, X, Pencil, Eye } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { money, centsFromDisplay } from '../lib/format'
import { formatDate, todayISO } from '../lib/date'
import type { PurchaseOrder, PurchaseOrderStatus } from '../types'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { toast } from '../components/ui/toast'

const STATUS_TONE: Record<PurchaseOrderStatus, any> = {
  draft: 'muted', submitted: 'primary', partially_received: 'warning', received: 'success', cancelled: 'danger',
}

export default function Orders() {
  const session = useDataStore((s) => s.session)!
  const orders = useDataStore((s) => s.orders)
  const suppliers = useDataStore((s) => s.suppliers)
  const products = useDataStore((s) => s.products)
  const refresh = useDataStore((s) => s.refresh)
  const [status, setStatus] = useState<'all' | PurchaseOrderStatus>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [receiveId, setReceiveId] = useState<string | null>(null)

  const list = orders.filter((o) => status === 'all' || o.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const view = orders.find((o) => o.id === viewId)
  const receive = orders.find((o) => o.id === receiveId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Purchase Orders</h1><p className="text-sm text-textmuted">{orders.length} orders</p></div>
        <button onClick={() => setNewOpen(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Purchase Order</button>
      </div>

      <div className="flex gap-2">
        {['all', 'draft', 'submitted', 'partially_received', 'received', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setStatus(s as any)} className={`btn !py-1.5 !px-3 ${status === s ? 'bg-primary text-white' : 'bg-secondary border-border text-textsecondary'}`}>{label(s)}</button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {list.length === 0 ? <EmptyState title="No purchase orders" message="Create one to plan deliveries, or generate from the Reorder Centre." action={<button onClick={() => setNewOpen(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Purchase Order</button>} /> : (
          <table className="table-base"><thead className="bg-page"><tr><th className="th">Order</th><th className="th">Supplier</th><th className="th">Status</th><th className="th">Created</th><th className="th">Expected</th><th className="th text-right">Total</th><th className="th text-right">Actions</th></tr></thead><tbody>
            {list.map((o) => (
              <tr key={o.id} className="table-row">
                <td className="td font-semibold">{o.orderNumber}</td>
                <td className="td">{o.supplierName || '—'}</td>
                <td className="td"><Badge tone={STATUS_TONE[o.status]}>{o.status.replace('_', ' ')}</Badge></td>
                <td className="td text-xs">{formatDate(o.createdAt)}</td>
                <td className="td text-xs">{o.expectedDeliveryDate ? formatDate(o.expectedDeliveryDate) : '—'}</td>
                <td className="td text-right font-semibold">{money(o.totalCents)}</td>
                <td className="td text-right whitespace-nowrap">
                  <button onClick={() => setViewId(o.id)} className="btn-ghost !px-2" title="View"><Eye className="w-4 h-4" /></button>
                  {(o.status === 'submitted' || o.status === 'partially_received') && <button onClick={() => setReceiveId(o.id)} className="btn-ghost !px-2 text-success" title="Receive"><PackagePlus className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      {newOpen && <NewOrderModal onClose={() => setNewOpen(false)} />}
      {view && <ViewOrderModal order={view} onClose={() => setViewId(null)} />}
      {receive && <ReceiveOrderModal order={receive} onClose={() => setReceiveId(null)} />}
    </div>
  )
}

function label(s: string) { return s.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) }

function NewOrderModal({ onClose }: { onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const suppliers = useDataStore((s) => s.suppliers)
  const products = useDataStore((s) => s.products)
  const refresh = useDataStore((s) => s.refresh)
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: string; cost: string }[]>([{ productId: '', qty: '1', cost: '' }])
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1', cost: '' }])
  const setLine = (i: number, k: string, v: string) => setLines((l) => l.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
  const total = lines.reduce((a, l) => { const p = products.find((x) => x.id === l.productId); return a + (parseInt(l.qty || '0', 10) || 0) * (centsFromDisplay(l.cost) || p?.costCents || 0) }, 0)

  const persist = async (status: 'draft' | 'submitted') => {
    const valid = lines.filter((l) => l.productId && parseInt(l.qty || '0', 10) > 0)
    if (valid.length === 0 || !supplierId) { toast('warning', 'Incomplete order', 'Add a supplier and at least one product line.'); return }
    setBusy(true)
    try {
      const supp = suppliers.find((x) => x.id === supplierId)
      const po: PurchaseOrder = {
        id: 'po_' + Math.random().toString(36).slice(2, 10), storeId: session.storeId, orderNumber: 'PO-' + String(Date.now()).slice(-6),
        supplierId, supplierName: supp?.name || '', status,
        lines: valid.map((l) => { const p = products.find((x) => x.id === l.productId)!; const unit = centsFromDisplay(l.cost) || p.costCents; return { productId: p.id, productName: p.name, barcode: p.barcode, qty: parseInt(l.qty, 10), unitCostCents: unit, totalCents: unit * parseInt(l.qty, 10), receivedQty: 0 } }),
        totalCents: total, expectedDeliveryDate: expected, notes,
        createdBy: session.uid, createdByName: session.name, createdAt: new Date().toISOString(),
        submittedAt: status === 'submitted' ? new Date().toISOString() : undefined,
      }
      await backend.savePurchaseOrder(po)
      await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: status === 'draft' ? 'purchase_order.draft' : 'purchase_order.submit', entityType: 'purchaseOrder', entityId: po.id, afterState: { status } })
      toast('success', status === 'draft' ? 'Draft saved' : 'Order submitted', po.orderNumber)
      refresh()
      onClose()
    } catch (e: any) { toast('error', 'Not saved', e?.message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="New purchase order" width="max-w-3xl">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Supplier</label><select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">— select supplier —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">Expected delivery</label><input type="date" className="input" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <label className="label">Lines</label>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select className="input flex-1" value={l.productId} onChange={(e) => setLine(i, 'productId', e.target.value)}>
                <option value="">— product —</option>{products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" className="input w-20" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} placeholder="Qty" />
              <input type="number" className="input w-24" value={l.cost} onChange={(e) => setLine(i, 'cost', e.target.value)} placeholder="Cost $ (blank = product)" />
              {lines.length > 1 && <button onClick={() => setLines((x) => x.filter((_, idx) => idx !== i))} className="btn-secondary !px-2"><X className="w-4 h-4" /></button>}
            </div>
          ))}
          <button onClick={addLine} className="btn-secondary !py-1.5"><Plus className="w-4 h-4" /> Add line</button>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="flex justify-between items-center"><span className="text-sm text-textsecondary">Order total</span><span className="text-xl font-extrabold">{money(total)}</span></div>
        <div className="flex justify-end gap-2">
          <button onClick={() => persist('draft')} disabled={busy} className="btn-secondary">{busy ? 'Saving…' : 'Save Draft'}</button>
          <button onClick={() => persist('submitted')} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Submit Order'}</button>
        </div>
      </div>
    </Modal>
  )
}

function ViewOrderModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Order ${order.orderNumber}`} width="max-w-2xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between"><div className="text-sm text-textsecondary">Supplier</div><div className="font-semibold">{order.supplierName || '—'}</div></div>
        <div className="flex items-center justify-between"><div className="text-sm text-textsecondary">Status</div><Badge tone={STATUS_TONE[order.status]}>{label(order.status)}</Badge></div>
        <div className="flex items-center justify-between"><div className="text-sm text-textsecondary">Created</div><div>{formatDate(order.createdAt)}</div></div>
        {order.expectedDeliveryDate && <div className="flex items-center justify-between"><div className="text-sm text-textsecondary">Expected</div><div>{formatDate(order.expectedDeliveryDate)}</div></div>}
        <table className="w-full"><thead className="bg-page"><tr><th className="th">Product</th><th className="th text-right">Qty</th><th className="th text-right">Received</th><th className="th text-right">Unit cost</th><th className="th text-right">Total</th></tr></thead><tbody>
          {order.lines.map((l, i) => <tr key={i} className="table-row"><td className="td">{l.productName}</td><td className="td text-right">{l.qty}</td><td className="td text-right">{l.receivedQty || 0}</td><td className="td text-right">{money(l.unitCostCents)}</td><td className="td text-right">{money(l.totalCents)}</td></tr>)}
        </tbody></table>
        <div className="flex justify-between font-bold"><span>Total</span><span>{money(order.totalCents)}</span></div>
      </div>
    </Modal>
  )
}

function ReceiveOrderModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [rows, setRows] = useState<Record<string, { qty: string; expiry: string; lot: string }>>({})
  const [busy, setBusy] = useState(false)

  const setRow = (productId: string, k: string, v: string) => setRows((r) => ({ ...r, [productId]: { ...(r[productId] || { qty: '', expiry: '', lot: '' }), [k]: v } }))

  const receive = async () => {
    setBusy(true)
    try {
      const received = order.lines.filter((l) => (parseInt(rows[l.productId]?.qty || '0', 10) || 0) > 0).map((l) => ({
        productId: l.productId, productName: l.productName,
        qty: parseInt(rows[l.productId].qty, 10), unitCostCents: l.unitCostCents,
        expiryDate: rows[l.productId].expiry || null, lotNumber: rows[l.productId].lot || '',
      }))
      if (received.length === 0) { toast('warning', 'Enter quantities', 'Enter a received quantity for at least one line.'); setBusy(false); return }
      await backend.receivePurchaseOrder(session.storeId, order, received, { uid: session.uid, name: session.name })
      toast('success', 'Order received', `${received.length} line(s) added to stock.`)
      refresh()
      onClose()
    } catch (e: any) { toast('error', 'Receive failed', e?.message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Receive ${order.orderNumber}`} width="max-w-3xl">
      <div className="space-y-3">
        <p className="text-sm text-textmuted">Enter the actual received quantity and expiry date per line. Each line creates an independent stock batch.</p>
        {order.lines.map((l) => (
          <div key={l.productId} className="grid grid-cols-[1fr_80px_150px_120px] gap-2 items-center">
            <div><div className="text-sm font-medium">{l.productName}</div><div className="text-xs text-textmuted">ordered {l.qty} · received {l.receivedQty || 0}</div></div>
            <input type="number" className="input" placeholder="Qty" value={rows[l.productId]?.qty || ''} onChange={(e) => setRow(l.productId, 'qty', e.target.value)} />
            <input type="date" className="input" value={rows[l.productId]?.expiry || ''} onChange={(e) => setRow(l.productId, 'expiry', e.target.value)} />
            <input className="input" placeholder="Lot" value={rows[l.productId]?.lot || ''} onChange={(e) => setRow(l.productId, 'lot', e.target.value)} />
          </div>
        ))}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={receive} disabled={busy} className="btn-primary">{busy ? 'Receiving…' : 'Receive into stock'}</button></div>
      </div>
    </Modal>
  )
}

function centsFor(str: string) { return centsFromDisplay(str) }