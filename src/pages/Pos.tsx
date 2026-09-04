import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ScanLine, Minus, Plus, Trash2, Camera, DollarSign, Banknote, Wallet,
  PauseCircle, PlayCircle, XCircle, Printer, SearchX, Store,
} from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { useKeyboardWedgeScanner } from '../hooks/useScanner'
import { useCameraScanner } from '../hooks/useCameraScanner'
import { money, parseMoneyInput } from '../lib/format'
import { normalizeBarcode } from '../lib/barcode'
import { formatDate } from '../lib/date'
import type { CartLine, PaymentMethod } from '../types'
import { toast } from '../components/ui/toast'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'

export default function Pos() {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const settings = useDataStore((s) => s.settings)
  const refresh = useDataStore((s) => s.refresh)
  const navigate = useNavigate()

  const [cart, setCart] = useState<CartLine[]>([])
  const [manual, setManual] = useState('')
  const [notFound, setNotFound] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [receipt, setReceipt] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<any[]>([])
  const [showResume, setShowResume] = useState(false)
  const cam = useCameraScanner(handleScan)

  const canDiscount = session.role === 'owner' || session.role === 'manager' || !!settings?.allowStaffDiscount
  const taxRate = settings?.taxRatePercent ?? 10

  function handleScan(raw: string) {
    const code = normalizeBarcode(raw)
    if (!code) return
    const product = products.find((p) => p.barcode === code || normalizeBarcode(p.barcode) === code)
    if (!product) { setNotFound(code); return }
    if (!product.active) { toast('warning', 'Inactive product', `${product.name} is archived.`); return }
    addToCart(product)
    flash()
  }

  function flash() {
    const el = document.getElementById('scan-flash')
    if (!el) return
    el.classList.remove('scan-flash')
    // force reflow so the animation restarts each scan
    void el.offsetWidth
    el.classList.add('scan-flash')
  }

  function addToCart(product: any) {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === product.id)
      const available = batches.filter((b) => b.productId === product.id && b.qtyRemaining > 0).reduce((a, b) => a + b.qtyRemaining, 0)
      if (i >= 0) return prev.map((l, idx) => idx === i ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, {
        productId: product.id, barcode: product.barcode, name: product.name, qty: 1,
        unitPriceCents: product.sellCents, discountCents: 0, availableStock: available,
      }]
    })
  }

  const { subtotal, discountTotal, taxTotal, total } = useMemo(() => {
    const sub = cart.reduce((a, l) => a + l.unitPriceCents * l.qty, 0)
    const disc = cart.reduce((a, l) => a + l.discountCents, 0)
    const net = Math.max(0, sub - disc)
    const tax = Math.round(net * taxRate / 100)
    return { subtotal: sub, discountTotal: disc, taxTotal: tax, total: net + tax }
  }, [cart, taxRate])

  const changeQty = (id: string, delta: number) =>
    setCart((prev) => prev.map((l) => l.productId === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l).filter((l) => l.qty > 0))

  const setDiscount = (id: string, cents: number) =>
    setCart((prev) => prev.map((l) => l.productId === id ? { ...l, discountCents: Math.min(cents, l.unitPriceCents * l.qty) } : l))

  const loadHeld = async () => {
    if (!session) return
    const h = await backend.getHeldSales(session.storeId)
    setHeld(h)
  }
  const refreshHeld = () => { setShowResume(true); loadHeld() }

  const holdSale = async () => {
    if (cart.length === 0) { toast('info', 'Nothing to hold', 'Add items first.'); return }
    await backend.saveHeldSale(session.storeId, {
      id: 'h_' + Date.now().toString(36), storeId: session.storeId, createdBy: session.uid, createdByName: session.name,
      createdAt: new Date().toISOString(), label: `Held ${new Date().toLocaleString('en-AU')}`, lines: cart,
    })
    setCart([])
    toast('success', 'Transaction held')
  }

  const resumeHeld = async (h: any) => {
    setCart(h.lines)
    await backend.deleteHeldSale(session.storeId, h.id)
    setShowResume(false)
  }

  const doComplete = async () => {
    if (cart.length === 0) return
    if (cart.some((l) => l.qty > l.availableStock)) { toast('warning', 'Insufficient stock', 'One or more items exceed available stock.'); setPaymentOpen(false); return }
    setBusy(true)
    try {
      const saleNumber = (await backend.getSaleNumber(session.storeId)) + 1
      const cashCents = payMethod === 'cash' ? parseMoneyInput(cashReceived) : null
      const res = await backend.createSale(session.storeId, {
        saleNumber,
        createdBy: session.uid, createdByName: session.name,
        lines: cart.map((l) => ({
          productId: l.productId, name: l.name, barcode: l.barcode, qty: l.qty,
          unitPriceCents: l.unitPriceCents, discountCents: l.discountCents,
          lineTotalCents: l.unitPriceCents * l.qty - l.discountCents,
        })),
        subtotalCents: subtotal, discountCents: discountTotal, taxCents: taxTotal, totalCents: total,
        paymentMethod: payMethod, cashReceivedCents: cashCents,
        changeCents: payMethod === 'cash' && cashCents != null ? Math.max(0, cashCents - total) : null,
      })
      setReceipt({ ...res.sale, change: payMethod === 'cash' ? Math.max(0, (cashCents ?? 0) - total) : null })
      setCart([])
      setPaymentOpen(false)
      toast('success', 'Sale saved', `Receipt #${res.sale.saleNumber} — ${money(res.sale.totalCents)}`)
      refresh()
    } catch (e: any) {
      toast('error', 'Sale not saved', e?.message)
    } finally { setBusy(false) }
  }

  useKeyboardWedgeScanner(handleScan)

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textmuted" />
              <input value={manual} onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { handleScan(manual.trim()); setManual('') } }}
                placeholder="Scan barcode or search, then Enter…" className="input pl-9" />
            </div>
            <button onClick={() => cam.active ? cam.stop() : cam.start()} className="btn-secondary">
              {cam.active ? <Camera className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              {cam.active ? 'Stop Camera' : 'Camera'}
            </button>
            <button onClick={() => navigate('/products/new')} className="btn-secondary"><Plus className="w-4 h-4" /> Add Product</button>
          </div>
          {cam.active && (
            <div className="mt-3">
              <video ref={cam.videoRef} className="w-full max-w-sm rounded-lg bg-navy object-cover aspect-video" />
              {cam.error && <p className="text-sm text-danger mt-2">Camera: {cam.error}</p>}
            </div>
          )}
          <p className="text-xs text-textmuted mt-2">USB/Bluetooth scanners work as keyboard input. Scanning the same item increases its quantity.</p>
        </div>

        {notFound && (
          <div className="card border-danger p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger-light flex items-center justify-center text-danger"><SearchX className="w-5 h-5" /></div>
              <div>
                <div className="text-sm font-bold text-textprimary">Product Not Found</div>
                <div className="text-xs text-textsecondary">No product matches “{notFound}”.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNotFound(null)} className="btn-secondary">Try Again</button>
              <button onClick={() => navigate('/products/new', { state: { barcode: notFound } })} className="btn-primary">Add New Product</button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-bold text-textprimary">Current Sale</h2>
            <span className="text-sm text-textmuted">{cart.reduce((a, l) => a + l.qty, 0)} items</span>
          </div>
          {cart.length === 0 ? (
            <EmptyState icon={<ScanLine className="w-7 h-7 text-textmuted" />} title="Scan to begin"
              message="Scan a product, use the camera, or type a barcode to add items." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead className="bg-page"><tr>
                  <th className="th">Product</th><th className="th text-center">Qty</th>
                  <th className="th text-right">Unit</th><th className="th text-right">Discount</th>
                  <th className="th text-right">Subtotal</th><th className="th" />
                </tr></thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.productId} className="table-row">
                      <td className="td">
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-xs text-textmuted">{l.barcode || '—'} · {l.availableStock} in stock</div>
                      </td>
                      <td className="td text-center">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => changeQty(l.productId, -1)} className="btn-ghost p-1"><Minus className="w-4 h-4" /></button>
                          <span className="w-8 text-center font-semibold">{l.qty}</span>
                          <button onClick={() => changeQty(l.productId, 1)} className="btn-ghost p-1"><Plus className="w-4 h-4" /></button>
                        </div>
                      </td>
                      <td className="td text-right">{money(l.unitPriceCents)}</td>
                      <td className="td text-right">
                        {canDiscount ? (
                          <input type="number" min={0} step={0.5} className="w-20 input !py-1 !px-2 text-right"
                            value={l.discountCents ? (l.discountCents / 100).toFixed(2) : ''}
                            onChange={(e) => setDiscount(l.productId, Math.round(parseFloat(e.target.value || '0') * 100))} placeholder="$0" />
                        ) : <span className="text-textmuted">—</span>}
                      </td>
                      <td className="td text-right font-semibold">{money(l.unitPriceCents * l.qty - l.discountCents)}</td>
                      <td className="td text-right"><button onClick={() => changeQty(l.productId, -l.qty)} className="text-textmuted hover:text-danger"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="card p-5 space-y-4 lg:sticky lg:top-20">
        <h2 className="text-base font-bold text-textprimary">Sale Summary</h2>
        <div className="space-y-2 text-sm">
          <Row label="Subtotal" value={money(subtotal)} />
          <Row label="Discount" value={`− ${money(discountTotal)}`} muted />
          <Row label={`Tax (${taxRate}%)`} value={money(taxTotal)} />
          <div className="border-t border-border pt-2 flex justify-between items-center text-textprimary">
            <span className="font-bold">Total</span><span className="text-xl font-extrabold">{money(total)}</span>
          </div>
        </div>
        <button onClick={() => setPaymentOpen(true)} disabled={cart.length === 0} className="btn-primary w-full"><DollarSign className="w-4 h-4" /> Complete Sale</button>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={holdSale} className="btn-secondary !px-2 !py-2.5"><PauseCircle className="w-4 h-4" /> Hold</button>
          <button onClick={() => setConfirmCancel(true)} disabled={cart.length === 0} className="btn-secondary !px-2 !py-2.5"><XCircle className="w-4 h-4" /> Cancel</button>
          <button onClick={refreshHeld} className="btn-secondary !px-2 !py-2.5"><PlayCircle className="w-4 h-4" /> Resume</button>
        </div>
        {showResume && (
          <div className="border-t border-border pt-3 space-y-1 max-h-44 overflow-y-auto">
            {held.length === 0 && <p className="text-xs text-textmuted">No held transactions.</p>}
            {held.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-page">
                <span className="text-xs">{h.label}</span>
                <button onClick={() => resumeHeld(h)} className="text-xs text-primary font-medium">Resume</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment modal */}
      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Complete Sale" width="max-w-md">
        <div className="grid grid-cols-3 gap-2">
          {(['cash', 'card', 'other'] as PaymentMethod[]).map((m) => (
            <button key={m} onClick={() => setPayMethod(m)}
              className={`btn py-2.5 ${payMethod === m ? 'bg-primary text-white border-primary' : 'bg-card border-border text-textsecondary'}`}>
              {m === 'cash' ? <Banknote className="w-4 h-4" /> : m === 'card' ? <DollarSign className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
              <span className="capitalize">{m}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xl font-extrabold text-textprimary mt-4"><span>Total</span><span>{money(total)}</span></div>
        {payMethod === 'cash' && (
          <div className="mt-3">
            <label className="label">Cash received</label>
            <input type="text" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="$0.00" className="input" />
            <div className="mt-2 text-sm font-semibold">Change due: <span className="text-success">{money(Math.max(0, parseMoneyInput(cashReceived) - total))}</span></div>
          </div>
        )}
        <button onClick={doComplete} disabled={busy} className="btn-primary w-full mt-4">{busy ? 'Processing…' : `Confirm ${money(total)}`}</button>
      </Modal>

      <ConfirmDialog open={confirmCancel} onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { setCart([]); setConfirmCancel(false) }}
        title="Cancel transaction" message="This clears the current cart and cannot be undone." confirmLabel="Clear cart" />

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Sale complete" width="max-w-sm">
        {receipt && <ReceiptView receipt={receipt} taxRate={taxRate} storeName={settings?.name || 'Store'} storeAddress={settings?.address} />}
        <div className="flex gap-2 mt-4">
          <button onClick={() => window.print()} className="btn-secondary flex-1"><Printer className="w-4 h-4" /> Print</button>
          <button onClick={() => setReceipt(null)} className="btn-primary flex-1">New Sale</button>
        </div>
      </Modal>

      <div id="scan-flash" className="pointer-events-none fixed inset-0 bg-primary/20 z-[60] opacity-0" />
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? 'text-textmuted' : 'text-textsecondary'}`}><span>{label}</span><span className="font-medium text-textprimary">{value}</span></div>
}

function ReceiptView({ receipt, taxRate, storeName, storeAddress }: any) {
  return (
    <div className="text-center font-mono text-sm text-textprimary space-y-2">
      <div className="flex items-center justify-center gap-1 text-base font-bold"><Store className="w-4 h-4" /> {storeName}</div>
      <p className="text-xs text-textmuted">{storeAddress}</p>
      <p className="text-xs text-textmuted">Receipt #{receipt.saleNumber} · {formatDate(receipt.timestamp)}</p>
      <div className="border-t border-dashed border-border pt-2" />
      <div className="space-y-1 text-left">
        {receipt.lines.map((l: any, i: number) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="max-w-[60%] truncate">{l.qty}× {l.name}</span>
            <span>{money(l.lineTotalCents)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-border pt-2 space-y-1 text-xs text-left">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(receipt.subtotalCents)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>− {money(receipt.discountCents)}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{money(receipt.taxCents)}</span></div>
        <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span>{money(receipt.totalCents)}</span></div>
        <div className="flex justify-between"><span>Paid ({receipt.paymentMethod})</span><span>{money(receipt.paymentMethod === 'cash' ? receipt.totalCents + (receipt.change || 0) : receipt.totalCents)}</span></div>
        {receipt.change != null && <div className="flex justify-between"><span>Change</span><span>{money(receipt.change)}</span></div>}
      </div>
      <p className="text-xs text-textmuted pt-2">Thank you for shopping with us!</p>
    </div>
  )
}