import { useRef, useState } from 'react'
import { Download, Database, Upload, ShieldAlert } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { downloadCsv, downloadXlsx } from '../lib/xlsx'
import { Modal } from '../components/ui/Modal'
import { toast } from '../components/ui/toast'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/Badge'
import { formatDate } from '../lib/date'

export default function DataBackup() {
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const exportJson = async () => {
    const b = await backend.exportBackup(session.storeId)
    downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), `retailpilot-backup-${new Date().toISOString().slice(0, 10)}.json`)
    toast('success', 'Backup exported', 'Full JSON backup downloaded.')
  }

  const exportExcel = async () => {
    const b = await backend.exportBackup(session.storeId)
    downloadXlsx([
      { name: 'Inventory', rows: b.products.map((p) => ({ Name: p.name, Barcode: p.barcode, Category: p.category, Stock: p.totalStock, Cost: (p.costCents / 100).toFixed(2), Sell: (p.sellCents / 100).toFixed(2) })) },
      { name: 'Batches', rows: b.batches.map((x) => ({ Product: x.productId, Expiry: x.expiryDate, Received: x.qtyReceived, Remaining: x.qtyRemaining, Cost: (x.unitCostCents / 100).toFixed(2), Lot: x.lotNumber })) },
      { name: 'Sales', rows: b.sales.map((s) => ({ Receipt: s.saleNumber, Date: s.timestamp, Total: (s.totalCents / 100).toFixed(2), Status: s.status })) },
      { name: 'Suppliers', rows: b.suppliers.map((s) => ({ Name: s.name, Phone: s.phone, LeadTime: s.leadTimeDays })) },
      { name: 'Waste', rows: b.waste.map((w) => ({ Date: w.createdAt, Product: w.productName, Reason: w.reason, Qty: w.qty, Cost: (w.costCents / 100).toFixed(2) })) },
      { name: 'PurchaseOrders', rows: b.purchaseOrders.map((o) => ({ Order: o.orderNumber, Supplier: o.supplierName, Status: o.status, Total: (o.totalCents / 100).toFixed(2) })) },
    ], `retailpilot-backup-excel-${new Date().toISOString().slice(0, 10)}`)
    toast('success', 'Excel backup exported')
  }

  const handleFile = async (f: File) => {
    try {
      const text = await f.text()
      const json = JSON.parse(text)
      const v = backend.validateBackup(json)
      if (!v.ok) { toast('error', 'Invalid backup', v.errors.join(' ')); return }
      setPreview(v)
      setPending(json)
    } catch { toast('error', 'Invalid backup file', 'Could not parse as a RetailPilot JSON backup.') }
  }

  const [pending, setPending] = useState<any>(null)

  const restore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const summary = await backend.restoreBackup(session.storeId, pending, { uid: session.uid, name: session.name })
      toast('success', 'Backup restored', `Imported ${summary.products} products, ${summary.sales} sales.`)
      setPreview(null); setPending(null); setConfirm(false)
      refresh()
    } catch (e: any) {
      toast('error', 'Restore failed', e?.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-extrabold text-textprimary">Data & Backup</h1><p className="text-sm text-textmuted">Owner-only. Export and safely restore your store data.</p></div>

      <div className="card p-5 space-y-4">
        <h2 className="text-base font-bold flex items-center gap-2"><Database className="w-5 h-5 text-primary" /> Export</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <button onClick={exportJson} className="btn-secondary justify-start !py-3"><Download className="w-5 h-5" /><span className="text-left"><div className="font-semibold">JSON backup</div><div className="text-xs text-textmuted">Everything — use for full restore</div></span></button>
          <button onClick={exportExcel} className="btn-secondary justify-start !py-3"><Download className="w-5 h-5" /><span className="text-left"><div className="font-semibold">Excel export</div><div className="text-xs text-textmuted">Inventory, batches, sales, suppliers, waste, orders</div></span></button>
        </div>
      </div>

      <div className="card p-5 space-y-4 border-danger/30">
        <h2 className="text-base font-bold flex items-center gap-2"><Upload className="w-5 h-5 text-danger" /> Restore</h2>
        <p className="text-sm text-textmuted">Restoring replaces your store's data. This is destructive and irreversible — you must confirm as Owner.</p>
        <button onClick={() => fileRef.current?.click()} className="btn-danger"><Upload className="w-4 h-4" /> Choose backup file…</button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Restore preview" width="max-w-md">
        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Sum label="Products" value={preview.summary.products} /><Sum label="Batches" value={preview.summary.batches} />
              <Sum label="Sales" value={preview.summary.sales} /><Sum label="Suppliers" value={preview.summary.suppliers} />
              <Sum label="Waste" value={preview.summary.waste} /><Sum label="Purchase orders" value={preview.summary.purchaseOrders} />
              <Sum label="Users" value={preview.summary.users} /><Sum label="Settings" value={preview.summary.settings ? '✓' : '—'} />
            </div>
            <div className="bg-warning-light rounded-lg p-3 text-sm text-warning flex gap-2"><ShieldAlert className="w-5 h-5 shrink-0" /> Restoring requires explicit Owner confirmation and refuses to overwrite a store that already contains data.</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => { setConfirm(true); setPreview(null) }} className="btn-danger">Continue to confirm</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={restore} busy={busy}
        title="Confirm restore"
        message="This will restore the selected backup into your store. This permanently changes store data. Continue?" />
    </div>
  )
}

function Sum({ label, value }: any) { return <div className="bg-page rounded-lg p-2"><div className="text-xs text-textmuted">{label}</div><div className="font-bold">{value}</div></div> }
function downloadBlob(blob: Blob, name: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href as string), 1000) }