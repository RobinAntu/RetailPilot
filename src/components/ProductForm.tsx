import { useMemo, useState } from 'react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { centsFromDisplay, money, pct } from '../lib/format'
import { todayISO } from '../lib/date'
import { generateInternalCode } from '../lib/barcode'
import type { Product, ExpiryTracking } from '../types'
import { toast } from './ui/toast'

export interface ProductFormValues {
  name: string; barcode: string; sku: string; category: string; brand: string
  supplierId: string; cost: string; sell: string; minStock: string; targetStock: string
  unit: string; aisle: string; shelf: string; notes: string; expiryTracking: ExpiryTracking
}

export function emptyProductForm(): ProductFormValues {
  return {
    name: '', barcode: '', sku: '', category: '', brand: '', supplierId: '',
    cost: '', sell: '', minStock: '5', targetStock: '15', unit: 'each',
    aisle: '', shelf: '', notes: '', expiryTracking: 'optional',
  }
}

export function ProductForm({ initial, product, onSaved, onCancel, submitLabel = 'Save Product' }: {
  initial?: ProductFormValues
  product?: Product | null
  onSaved: (p: Product) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const session = useDataStore((s) => s.session)!
  const suppliers = useDataStore((s) => s.suppliers)
  const [f, setF] = useState<ProductFormValues>(
    initial ?? (product ? {
      name: product.name, barcode: product.barcode, sku: product.sku, category: product.category,
      brand: product.brand, supplierId: product.supplierId, cost: (product.costCents / 100).toFixed(2),
      sell: (product.sellCents / 100).toFixed(2), minStock: String(product.minStock || 5),
      targetStock: String(product.targetStock || 15), unit: product.unit || 'each',
      aisle: product.aisle, shelf: product.shelf, notes: product.notes, expiryTracking: product.expiryTracking,
    } : emptyProductForm()))
  const [busy, setBusy] = useState(false)
  const set = (k: keyof ProductFormValues, v: string) => setF((x) => ({ ...x, [k]: v }))

  const cost = centsFromDisplay(f.cost)
  const sell = centsFromDisplay(f.sell)
  const profitPerUnit = sell - cost
  const marginPct = sell > 0 ? (profitPerUnit / sell) * 100 : 0

  const genCode = () => {
    set('barcode', generateInternalCode(Math.floor(Math.random() * 99999)))
    toast('info', 'Barcode generated', 'Internal RetailPilot code. Not a GS1-registered EAN.')
  }

  const save = async () => {
    if (!f.name.trim()) { toast('warning', 'Missing name', 'Enter a product name.'); return }
    if (sell <= 0) { toast('warning', 'Invalid price', 'Selling price must be greater than zero.'); return }
    setBusy(true)
    try {
      const id = product?.id || 'p_' + Math.random().toString(36).slice(2, 10)
      const now = todayISO()
      const supp = suppliers.find((x) => x.id === f.supplierId)
      const data: Product = {
        id, storeId: session.storeId, name: f.name.trim(), barcode: f.barcode.trim(),
        sku: f.sku.trim() || f.barcode, category: f.category || 'Uncategorised', brand: f.brand,
        supplierId: f.supplierId, supplierName: supp?.name || '',
        costCents: cost, sellCents: sell, minStock: parseInt(f.minStock || '0', 10) || 0,
        targetStock: parseInt(f.targetStock || '0', 10) || 0,
        unit: f.unit || 'each', aisle: f.aisle, shelf: f.shelf, notes: f.notes,
        expiryTracking: f.expiryTracking, active: true,
        createdAt: product?.createdAt || now, updatedAt: now,
        totalStock: product?.totalStock || 0, stockValueCents: product?.stockValueCents || 0,
        salesHistory: product?.salesHistory || [],
      }
      await backend.saveProduct(data)
      await backend.createAuditLog(session.storeId, {
        uid: session.uid, userName: session.name,
        action: product ? 'product.edit' : 'product.create',
        entityType: 'product', entityId: data.id,
        beforeState: product ? { name: product.name, cost: product.costCents, sell: product.sellCents } : undefined,
        afterState: { name: data.name, cost: data.costCents, sell: data.sellCents },
      })
      toast('success', product ? 'Product updated' : 'Product created', data.name)
      onSaved(data)
    } catch (e: any) {
      toast('error', 'Not saved', e?.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Product name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Barcode">
          <div className="flex gap-2">
            <input className="input" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="EAN / UPC / Code 128" />
            <button onClick={genCode} className="btn-secondary whitespace-nowrap">Generate</button>
          </div>
        </Field>
        <Field label="SKU"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Category"><input className="input" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Dairy" /></Field>
        <Field label="Brand"><input className="input" value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
        <Field label="Supplier">
          <select className="input" value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">No supplier</option>
            {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Cost price ($)"><input type="number" step="0.01" className="input" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
        <Field label="Selling price ($)"><input type="number" step="0.01" className="input" value={f.sell} onChange={(e) => set('sell', e.target.value)} /></Field>
        <Field label="Minimum stock"><input type="number" className="input" value={f.minStock} onChange={(e) => set('minStock', e.target.value)} /></Field>
        <Field label="Target stock"><input type="number" className="input" value={f.targetStock} onChange={(e) => set('targetStock', e.target.value)} /></Field>
        <Field label="Unit"><input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="each / kg / bottle" /></Field>
        <Field label="Aisle"><input className="input" value={f.aisle} onChange={(e) => set('aisle', e.target.value)} /></Field>
        <Field label="Shelf"><input className="input" value={f.shelf} onChange={(e) => set('shelf', e.target.value)} /></Field>
        <Field label="Expiry tracking">
          <select className="input" value={f.expiryTracking} onChange={(e) => set('expiryTracking', e.target.value as ExpiryTracking)}>
            <option value="required">Required</option>
            <option value="optional">Optional</option>
            <option value="none">No expiry</option>
          </select>
        </Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>

      {/* Calculated pricing */}
      <div className="grid grid-cols-3 gap-3 bg-page rounded-card p-4 text-center">
        <div><div className="text-xs text-textmuted">Profit per unit</div><div className={`text-lg font-extrabold ${profitPerUnit >= 0 ? 'text-success' : 'text-danger'}`}>{money(profitPerUnit)}</div></div>
        <div><div className="text-xs text-textmuted">Gross margin</div><div className="text-lg font-extrabold text-primary">{pct(marginPct)}</div></div>
        <div><div className="text-xs text-textmuted">Selling price</div><div className="text-lg font-extrabold text-textprimary">{money(sell)}</div></div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </div>
  )
}

function Field({ label, children, full }: any) {
  return <div className={full ? 'md:col-span-2' : ''}><label className="label">{label}</label>{children}</div>
}