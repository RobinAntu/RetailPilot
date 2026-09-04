import { useMemo, useState } from 'react'
import { Printer, Download, Copy, Barcode, Plus } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { barcodeSvgDataUri, barcodeType, generateInternalCode } from '../lib/barcode'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/toast'

export default function BarcodeCentre() {
  const products = useDataStore((s) => s.products)
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [q, setQ] = useState('')
  const [internal, setInternal] = useState(false)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return products.filter((p) => {
      if (internal && p.barcode && p.barcode.startsWith('RPL')) return true
      if (!term) return !internal
      return (p.name.toLowerCase() + (p.barcode || '')).includes(term)
    })
  }, [products, q, internal])

  const genFor = async (p: any) => {
    if (p.barcode && !p.barcode.startsWith('RPL')) { toast('info', 'Already has a barcode', `${p.name} uses ${p.barcode}.`); return }
    const code = generateInternalCode(Math.floor(Math.random() * 99999))
    await backend.saveProduct({ ...p, barcode: code })
    await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'barcode.generate', entityType: 'product', entityId: p.id, afterState: { barcode: code } })
    toast('success', 'Barcode generated', `${code} assigned to ${p.name}. This is an internal RetailPilot code, not a registered GS1 EAN.`)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-textprimary">Barcode Centre</h1>
        <p className="text-sm text-textmuted">View, print, download and generate barcodes for your products.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or barcode…" className="input !w-64" />
        <button onClick={() => setInternal((x) => !x)} className={`btn ${internal ? 'bg-primary text-white' : 'bg-secondary border-border text-textsecondary'}`}>Internal codes only</button>
      </div>
      <p className="text-xs text-textmuted">Internally generated RetailPilot barcodes (RPL prefix) are for in-store use only and are <b>not</b> globally registered GS1 barcodes.</p>

      {list.length === 0 ? <EmptyState title="No barcodes to display" message="Products appear here once added." /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {list.map((p) => (
            <div key={p.id} className="card p-4 text-center space-y-2">
              <img src={barcodeSvgDataUri(p.barcode || 'NO CODE')} alt={p.barcode} className="w-full" />
              <div className="text-xs text-textmuted break-all">{p.barcode || '—'}</div>
              <div className="text-sm font-semibold truncate" title={p.name}>{p.name}</div>
              <div className="flex items-center justify-center gap-1 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-page text-textsecondary">{barcodeType(p.barcode)}</span>
              </div>
              <div className="flex justify-center gap-1">
                <button onClick={() => windowOne(p)} className="btn-ghost !p-1.5" title="Print"><Printer className="w-4 h-4" /></button>
                <button onClick={() => downloadOne(p)} className="btn-ghost !p-1.5" title="Download"><Download className="w-4 h-4" /></button>
                <button onClick={() => { navigator.clipboard?.writeText(p.barcode || ''); toast('success', 'Copied', p.barcode) }} className="btn-ghost !p-1.5" title="Copy number"><Copy className="w-4 h-4" /></button>
                <button onClick={() => genFor(p)} className="btn-ghost !p-1.5" title="Generate internal code"><Barcode className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function windowOne(p: any) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:monospace;gap:6px"><img src="${barcodeSvgDataUri(p.barcode || '')}"><div>${p.barcode}</div><div>${p.name}</div><script>window.print()<\/script></body></html>`)
  w.document.close()
}
function downloadOne(p: any) {
  const a = document.createElement('a')
  a.href = barcodeSvgDataUri(p.barcode || '')
  a.download = `${p.barcode || 'barcode'}.svg`
  a.click()
}