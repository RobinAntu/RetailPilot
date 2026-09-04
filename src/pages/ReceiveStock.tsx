import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ScanLine, PackagePlus, Check, Plus, CalendarPlus } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { money, centsFromDisplay } from '../lib/format'
import { todayISO, addDaysISO } from '../lib/date'
import { normalizeBarcode } from '../lib/barcode'
import { toast } from '../components/ui/toast'
import { EmptyState } from '../components/ui/EmptyState'

type ExpiryState = 'tracked' | 'none' | 'unknown'

export default function ReceiveStock() {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const suppliers = useDataStore((s) => s.suppliers)
  const refresh = useDataStore((s) => s.refresh)
  const location = useLocation()
  const navigate = useNavigate()

  const preseed = (location.state as any)?.productId
  const [productId, setProductId] = useState(preseed || '')
  const [scan, setScan] = useState('')
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [expiryState, setExpiryState] = useState<ExpiryState>('unknown')
  const [expiryDate, setExpiryDate] = useState('')
  const [lot, setLot] = useState('')
  const [busy, setBusy] = useState(false)

  const product = products.find((p) => p.id === productId)

  const handleScan = (code: string) => {
    const c = normalizeBarcode(code)
    const p = products.find((x) => x.barcode === c || normalizeBarcode(x.barcode) === c)
    if (p) { setProductId(p.id); setScan('') } else { toast('warning', 'Barcode not found', 'Add the product first, then receive stock.') }
  }

  const quickExpiry = (days: number) => { setExpiryDate(addDaysISO(todayISO(), days)); setExpiryState('tracked') }
  const setNoExpiry = () => { setExpiryDate(''); setExpiryState('none') }

  const submit = async () => {
    if (!productId || !product) { toast('warning', 'Select a product', 'Scan or search for a product first.'); return }
    const n = parseInt(qty || '0', 10)
    if (n <= 0) { toast('warning', 'Invalid quantity', 'Enter a quantity greater than zero.'); return }
    const costCents = centsFromDisplay(cost)
    if (expiryState === 'tracked' && !expiryDate) { toast('warning', 'Expiry date required', 'Expiry tracking requires a date.'); return }
    setBusy(true)
    try {
      const supp = suppliers.find((s) => s.id === supplierId)
      await backend.addBatches(session.storeId, [{
        id: 'b_' + Math.random().toString(36).slice(2, 10), storeId: session.storeId,
        productId: product.id, qtyReceived: n, qtyRemaining: n,
        expiryDate: expiryState === 'tracked' ? expiryDate : null,
        receivedDate: todayISO(), unitCostCents: cost,
        supplierId, supplierName: supp?.name || '', lotNumber: lot,
        createdBy: session.uid, createdByName: session.name, createdAt: new Date().toISOString(),
      }])
      const updated = { ...product, totalStock: (product.totalStock || 0) + n, stockValueCents: (product.stockValueCents || 0) + n * costCents }
      await backend.saveProduct(updated)
      await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'stock.receive', entityType: 'batch', entityId: product.id, afterState: { qty: n, costCents, expiryDate } })
      toast('success', 'Stock received', `${n} × ${product.name} added to inventory.`)
      refresh()
      setQty(''); setCost(''); setExpiryDate(''); setExpiryState('unknown'); setLot('')
    } catch (e: any) {
      toast('error', 'Not received', e?.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-extrabold text-textprimary">Receive Stock</h1>
        <p className="text-sm text-textmuted">Scan a product and record the delivered quantity and expiry.</p>
      </div>

      <div className="card p-4">
        <label className="label">Scan or search product</label>
        <div className="relative">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textmuted" />
          <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && scan.trim()) handleScan(scan.trim()) }}
            placeholder="Scan barcode or type name and press Enter…" className="input pl-9" />
        </div>
        {product ? (
          <div className="mt-3 flex items-center justify-between bg-page rounded-lg p-3">
            <div>
              <div className="font-semibold text-textprimary">{product.name}</div>
              <div className="text-xs text-textmuted">{product.barcode} · {product.category} · {(product.totalStock || 0)} in stock</div>
            </div>
            <button onClick={() => setProductId('')} className="text-sm text-textmuted hover:text-primary">Change</button>
          </div>
        ) : (
          <div className="mt-3">
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— search a product or pick from the list —</option>
              {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.barcode || 'no barcode'})</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quantity received"><input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></Field>
          <Field label="Cost per unit ($)"><input type="number" step="0.01" className="input" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <Field label="Supplier">
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">No supplier</option>
            {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <div>
          <label className="label">Expiry tracking</label>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setExpiryState('tracked')} className={`btn ${expiryState === 'tracked' ? 'bg-primary text-white border-primary' : 'bg-secondary border-border text-textsecondary'}`}><CalendarPlus className="w-4 h-4" /> Tracked</button>
            <button onClick={setNoExpiry} className={`btn ${expiryState === 'none' ? 'bg-success text-white border-success' : 'bg-secondary border-border text-textsecondary'}`}><Check className="w-4 h-4" /> No Expiry</button>
            <button onClick={() => setExpiryState('unknown')} className={`btn ${expiryState === 'unknown' ? 'bg-warning text-white border-warning' : 'bg-secondary border-border text-textsecondary'}`}>Not Yet Recorded</button>
          </div>
          {expiryState === 'tracked' && (
            <div className="mt-3">
              <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              <div className="flex gap-2 mt-2">
                {[3, 7, 14, 30].map((d) => <button key={d} onClick={() => quickExpiry(d)} className="btn-secondary !py-1.5 !px-2 text-xs">+{d} days</button>)}
              </div>
            </div>
          )}
          {expiryState === 'unknown' && <p className="text-xs text-textmuted mt-2">Marked “not yet recorded”. You can add expiry management gradually.</p>}
        </div>

        <Field label="Lot number (optional)"><input className="input" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="LOT-0001" /></Field>

        <div className="flex items-center justify-end gap-3">
          {cost && <div className="text-sm text-textsecondary">Line cost: <span className="font-semibold text-textprimary">{money(centsFromDisplay(cost) * (parseInt(qty || '0', 10) || 0))}</span></div>}
          <button onClick={submit} disabled={busy} className="btn-primary"><PackagePlus className="w-4 h-4" /> {busy ? 'Receiving…' : 'Receive into stock'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: any) { return <div><label className="label">{label}</label>{children}</div> }