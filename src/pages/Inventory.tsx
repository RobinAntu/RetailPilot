import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus, Download, Upload, Pencil, PackagePlus, SlidersHorizontal, Archive, Trash2, Scan,
  Boxes, Search, Barcode,
} from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { money, pct } from '../lib/format'
import { daysUntil } from '../lib/date'
import { barcodeType } from '../lib/barcode'
import type { Product } from '../types'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { toast } from '../components/ui/toast'
import { downloadCsv } from '../lib/xlsx'
import { ImportModal } from '../components/ImportModal'
import { AdjustStockModal } from '../components/AdjustStockModal'

type Filter = 'all' | 'low' | 'out' | 'expiring' | 'expired' | 'noexpiry' | 'inactive'

export default function Inventory() {
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const suppliers = useDataStore((s) => s.suppliers)
  const location = useLocation()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [filter, setFilter] = useState<Filter>(location.state?.filter || 'all')
  const [importOpen, setImportOpen] = useState(false)
  const [adjustFor, setAdjustFor] = useState<Product | null>(null)

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return products
      .filter((p) => {
        if (cat !== 'all' && p.category !== cat) return false
        const s = p.name.toLowerCase() + ' ' + (p.barcode || '') + ' ' + (p.sku || '')
        if (term && !s.includes(term)) return false
        if (filter === 'inactive') return !p.active
        if (filter === 'all') return p.active
        switch (filter) {
          case 'low': return p.active && p.totalStock > 0 && p.totalStock <= (p.minStock || 0)
          case 'out': return p.active && p.totalStock <= 0
          case 'noexpiry': return p.active && p.expiryTracking === 'none'
          case 'expiring': case 'expired': {
            if (!p.active) return false
            const b = batches.filter((x) => x.productId === p.id && x.qtyRemaining > 0 && x.expiryDate)
            if (filter === 'expiring') return b.some((x) => { const d = daysUntil(x.expiryDate!); return d != null && d >= 0 })
            return b.some((x) => (daysUntil(x.expiryDate!) ?? 0) < 0)
          }
          default: return true
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, batches, q, cat, filter])

  const exportInventory = () => {
    downloadCsv(rows.map((p) => ({
      'Product Name': p.name, Barcode: p.barcode, SKU: p.sku, Category: p.category,
      'Current Stock': p.totalStock, 'Cost Price': (p.costCents / 100).toFixed(2),
      'Selling Price': (p.sellCents / 100).toFixed(2), 'Profit Margin': pct(margin(p)).replace('%', ''),
      'Expiry Status': expiryInfo(p, batches).label, Supplier: p.supplierName || '',
    })), 'inventory')
    toast('success', 'Inventory exported', 'CSV downloaded.')
  }

  const archive = async (p: Product) => {
    await backend.saveProduct({ ...p, active: false })
    await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'product.archive', entityType: 'product', entityId: p.id, afterState: { active: false } })
    toast('success', 'Product archived', `${p.name} is now inactive.`)
    refresh()
  }
  const deleteOne = async (p: Product) => {
    if (!confirm(`Permanently delete "${p.name}" and its stock batches? This cannot be undone.`)) return
    await backend.deleteProduct(session.storeId, p.id, { uid: session.uid, name: session.name })
    toast('success', 'Product deleted', `${p.name} removed.`)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-textprimary">Inventory</h1>
          <p className="text-sm text-textmuted">{rows.length} products shown</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => navigate('/products/new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Product</button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary"><Upload className="w-4 h-4" /> Import</button>
          <button onClick={exportInventory} className="btn-secondary"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textmuted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, barcode, SKU…" className="input pl-9" />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="input !w-auto">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="input !w-auto">
            <option value="all">All</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="expiring">Expiring</option>
            <option value="expired">Expired</option>
            <option value="noexpiry">No expiry</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-textmuted">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters: {q && <Badge tone="primary">Search: {q}</Badge>}
          {cat !== 'all' && <Badge tone="primary">{cat}</Badge>}
          {filter !== 'all' && <Badge tone="primary">{filter}</Badge>}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title={products.length === 0 ? 'No products yet' : 'No matching products'}
            message={products.length === 0 ? 'Add your first product or import your catalogue.' : 'Try a different search or filter.'}
            action={products.length === 0 && <>
              <button onClick={() => navigate('/products/new')} className="btn-primary"><Plus className="w-4 h-4" /> Add Product</button>
              <button onClick={() => setImportOpen(true)} className="btn-secondary"><Upload className="w-4 h-4" /> Import Products</button>
            </>} />
        ) : (
          <table className="table-base">
            <thead className="bg-page"><tr>
              <th className="th">Product</th><th className="th">Barcode</th><th className="th">Category</th>
              <th className="th text-right">Stock</th><th className="th text-right">Cost</th><th className="th text-right">Sell</th>
              <th className="th text-right">Margin</th><th className="th">Expiry</th><th className="th">Supplier</th><th className="th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const exp = expiryInfo(p, batches)
                return (
                  <tr key={p.id} className={`table-row ${!p.active ? 'opacity-60' : ''}`}>
                    <td className="td"><button onClick={() => navigate(`/products/${p.id}`)} className="font-semibold text-primary hover:underline text-left">{p.name}</button></td>
                    <td className="td"><span className="text-xs text-textmuted">{p.barcode || '—'}</span></td>
                    <td className="td"><Badge tone="muted">{p.category}</Badge></td>
                    <td className="td text-right font-semibold">{p.totalStock ?? 0} {p.unit}</td>
                    <td className="td text-right">{money(p.costCents)}</td>
                    <td className="td text-right">{money(p.sellCents)}</td>
                    <td className="td text-right"><span className={margin(p) >= 0 ? 'text-success' : 'text-danger'}>{pct(margin(p))}</span></td>
                    <td className="td"><Badge tone={exp.tone}>{exp.label}</Badge></td>
                    <td className="td text-xs text-textsecondary">{p.supplierName || '—'}</td>
                    <td className="td text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <IconBtn title="View" onClick={() => navigate(`/products/${p.id}`)}><Scan className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Edit" onClick={() => navigate(`/products/new`, { state: { product: p } })}><Pencil className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Receive" onClick={() => navigate('/receive', { state: { productId: p.id } })}><Plus className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Adjust" onClick={() => setAdjustFor(p)}><SlidersHorizontal className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Barcode" onClick={() => navigate('/barcode')}><Barcode className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Archive" danger onClick={() => archive(p)}><Archive className="w-4 h-4" /></IconBtn>
                        <IconBtn title="Delete" danger onClick={() => deleteOne(p)}><Trash2 className="w-4 h-4" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {adjustFor && <AdjustStockModal product={adjustFor} onClose={() => setAdjustFor(null)} />}
    </div>
  )
}

function IconBtn({ children, title, onClick }: any) {
  return <button title={title} onClick={onClick} className="p-1.5 rounded-md hover:bg-page text-textmuted hover:text-primary">{children}</button>
}

function margin(p: Product) {
  if (!p.sellCents) return 0
  return ((p.sellCents - p.costCents) / p.sellCents) * 100
}

function expiryInfo(p: Product, batches: any[]) {
  const b = batches.filter((x) => x.productId === p.id && x.qtyRemaining > 0 && x.expiryDate).sort((a, c) => a.expiryDate < c.expiryDate ? -1 : 1)
  if (p.expiryTracking === 'none') return { label: 'No expiry', tone: 'muted' as any }
  if (b.length === 0) return { label: p.expiryTracking === 'required' ? 'Untracked' : 'Not recorded', tone: 'warning' as any }
  const nearest = b[0]
  const d = daysUntil(nearest.expiryDate!)
  if (d == null || d < 0) return { label: `Expired (${nearest.expiryDate})`, tone: 'danger' as any }
  if (d <= 3) return { label: `${d}d left`, tone: 'danger' as any }
  if (d <= 14) return { label: `${d}d left`, tone: 'warning' as any }
  return { label: `${d}d left`, tone: 'success' as any }
}