import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, PackageOpen, ScanLine } from 'lucide-react'
import { useDataStore } from '../../store/appStore'
import { money } from '../../lib/format'
import { Badge } from '../ui/Badge'

export function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const products = useDataStore((s) => s.products)
  const suppliers = useDataStore((s) => s.suppliers)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    const supplierNames = new Set(suppliers.map((s) => s.name.toLowerCase()))
    const matched: any[] = []
    for (const p of products) {
      const name = p.name.toLowerCase()
      const sku = (p.sku || '').toLowerCase()
      const barcode = (p.barcode || '').toLowerCase()
      const exact = barcode === term
      const match = exact || name.includes(term) || sku.includes(term)
      if (match) matched.push({ p, exact })
    }
    // exact barcode matches first
    return matched.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, 15).map((m) => m.p)
  }, [q, products, suppliers])

  const goto = (p: any) => {
    navigate(`/products/${p.id}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-navy/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-card shadow-lift animate-slideUp max-h-[70vh] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-textmuted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, barcode, SKU…" className="flex-1 outline-none text-sm" />
        </div>
        <div className="overflow-y-auto">
          {q && results.length === 0 && (
            <div className="p-6 text-center text-sm text-textmuted">
              <PackageOpen className="w-8 h-8 mx-auto mb-2 text-textmuted/60" />
              No products match “{q}”.
            </div>
          )}
          {results.map((p) => (
            <button key={p.id} onClick={() => goto(p)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-page border-b border-border last:border-0 text-left">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-textprimary truncate">{p.name}</div>
                <div className="text-xs text-textmuted">Barcode {p.barcode || '—'} · SKU {p.sku || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-textprimary">{money(p.sellCents)}</div>
                <Badge tone={p.totalStock <= 0 ? 'danger' : p.totalStock <= (p.minStock || 0) ? 'warning' : 'success'}>{p.totalStock || 0} in stock</Badge>
              </div>
            </button>
          ))}
          {!q && (
            <div className="p-8 text-center text-sm text-textmuted">
              <ScanLine className="w-8 h-8 mx-auto mb-2 text-textmuted/60" />
              Type a product name, barcode or SKU to search across your store.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}