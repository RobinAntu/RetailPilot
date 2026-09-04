import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { parseProductImport, downloadCsv, importHeaders } from '../lib/xlsx'
import { generateSampleCatalogue } from '../lib/sampleCatalogue'
import { money } from '../lib/format'
import type { Product } from '../types'
import { Modal } from './ui/Modal'
import { toast } from './ui/toast'
import { Badge } from './ui/Badge'

type DuplicatePolicy = 'update' | 'skip' | 'review'

export function ImportModal({ onClose }: { onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const refresh = useDataStore((s) => s.refresh)
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<any>(null)
  const [policy, setPolicy] = useState<DuplicatePolicy>('update')
  const [busy, setBusy] = useState(false)

  const loadSample = () => {
    const rows = generateSampleCatalogue()
    // mark as valid list for preview
    setResult({ validRows: rows, warnings: [], errors: [], preview: rows.map((p) => ({ name: p.name, barcode: p.barcode, category: p.category, costCents: p.costCents, sellCents: p.sellCents })) })
  }

  const handleFile = async (f: File) => {
    try {
      const r = await parseProductImport(f)
      setResult({ fileName: f.name, ...r })
    } catch (e: any) {
      toast('error', 'Import failed', e?.message)
    }
  }

  const doImport = async () => {
    if (!result) return
    setBusy(true)
    try {
      const existingByBarcode = new Map(products.map((p) => [p.barcode, p]))
      let added = 0, updated = 0, skipped = 0
      const list: Product[] = []
      for (const p of result.validRows) {
        const existing = existingByBarcode.get(p.barcode)
        if (existing) {
          if (policy === 'skip') { skipped++; continue }
          if (policy === 'update') { list.push({ ...p, id: existing.id, storeId: session.storeId }); updated++ }
          else { /* review: treat as new but flag */ list.push({ ...p, storeId: session.storeId }); added++ }
        } else {
          list.push({ ...p, storeId: session.storeId })
          added++
        }
      }
      if (list.length) {
        await backend.upsertManyProducts(session.storeId, list)
        await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'product.import', entityType: 'product', entityId: 'batch', afterState: { added, updated, skipped } })
        toast('success', 'Import complete', `${added} added, ${updated} updated, ${skipped} skipped.`)
        refresh()
        onClose()
      } else {
        toast('info', 'Nothing imported', 'All rows were skipped by your duplicate policy.')
      }
    } catch (e: any) {
      toast('error', 'Import failed', 'No data was written. ' + e?.message)
    } finally { setBusy(false) }
  }

  const template = () => {
    downloadCsv([
      { 'Product Name': 'Example Product', Barcode: '9300000000000', SKU: 'SKU1', Category: 'Pantry', Brand: 'Brand', Supplier: 'Supplier', Unit: 'each', 'Cost Price': 1.50, 'Selling Price': 2.20, 'Required Quantity': 10, Aisle: 'A1', Shelf: '1', Notes: '' },
    ], 'retailpilot-product-import-template')
  }

  return (
    <Modal open onClose={onClose} title="Import products" width="max-w-3xl">
      {!result ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-card p-8 text-center cursor-pointer hover:border-primary/50" onClick={() => fileRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-textmuted mb-2" />
            <p className="text-sm font-medium text-textprimary">Click to choose an Excel (.xlsx) or CSV file</p>
            <p className="text-xs text-textmuted mt-1">Your catalogue (~150 products) with name, barcode, cost & selling price.</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <div className="flex items-center justify-between bg-page rounded-card p-3">
            <div className="flex items-center gap-2 text-sm"><FileSpreadsheet className="w-4 h-4 text-info2" /> Don't have a file yet?</div>
            <div className="flex gap-2">
              <button onClick={template} className="btn-secondary !py-1.5">Download template</button>
              <button onClick={loadSample} className="btn-primary !py-1.5">Load 150-item sample</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <StatCard icon={<CheckCircle2 className="w-4 h-4 text-success" />} label="Valid" value={result.validRows.length} />
            <StatCard icon={<AlertTriangle className="w-4 h-4 text-warning" />} label="Warnings" value={result.warnings.length} />
            <StatCard icon={<XCircle className="w-4 h-4 text-danger" />} label="Errors" value={result.errors.length} />
          </div>

          {result.errors.length > 0 && (
            <div className="bg-danger-light rounded-lg p-3 max-h-32 overflow-y-auto text-sm text-danger">
              {result.errors.slice(0, 10).map((e: any, i: number) => <div key={i}>Row {e.row}: {e.message}</div>)}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
            <table className="table-base">
              <thead className="bg-page"><tr><th className="th">#</th><th className="th">Product</th><th className="th">Barcode</th><th className="th">Category</th><th className="th text-right">Cost</th><th className="th text-right">Sell</th></tr></thead>
              <tbody>
                {result.preview.slice(0, 20).map((p: any, i: number) => (
                  <tr key={i} className="table-row"><td className="td text-xs text-textmuted">{i + 1}</td><td className="td">{p.name}</td><td className="td text-xs">{p.barcode}</td><td className="td"><Badge tone="muted">{p.category}</Badge></td><td className="td text-right">{money(p.costCents)}</td><td className="td text-right">{money(p.sellCents)}</td></tr>
                ))}
                {result.preview.length > 20 && <tr><td className="td text-xs text-textmuted" colSpan={6}>… {result.preview.length - 20} more</td></tr>}
              </tbody>
            </table>
          </div>

          <div>
            <label className="label">Duplicate barcode policy</label>
            <div className="grid grid-cols-3 gap-2">
              {(['update', 'skip', 'review'] as DuplicatePolicy[]).map((p) => (
                <button key={p} onClick={() => setPolicy(p)} className={`btn ${policy === p ? 'bg-primary text-white border-primary' : 'bg-secondary border-border text-textsecondary'}`}>{policyLabel[p]}</button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={doImport} disabled={busy || result.validRows.length === 0} className="btn-primary">{busy ? 'Importing…' : `Import ${result.validRows.length} products`}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function StatCard({ icon, label, value }: any) {
  return <div className="card p-3"><div className="flex items-center justify-center gap-1 text-2xl font-extrabold text-textprimary">{value}{icon}</div><div className="text-xs text-textmuted">{label}</div></div>
}

const policyLabel: Record<DuplicatePolicy, string> = { update: 'Update Existing', skip: 'Skip Existing', review: 'Review Individually' }