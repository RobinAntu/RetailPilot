import { useState } from 'react'
import { Plus, Pencil, Truck, Phone, Mail, MapPin } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { money } from '../lib/format'
import { formatDate } from '../lib/date'
import type { Supplier } from '../types'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { toast } from '../components/ui/toast'

export default function Suppliers() {
  const suppliers = useDataStore((s) => s.suppliers)
  const products = useDataStore((s) => s.products)
  const orders = useDataStore((s) => s.orders)
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [creating, setCreating] = useState(false)

  const openPos = (supplierId: string) => orders.filter((o) => o.supplierId === supplierId && (o.status === 'submitted' || o.status === 'partially_received'))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Suppliers</h1><p className="text-sm text-textmuted">{suppliers.filter((s) => s.active).length} active suppliers</p></div>
        <button onClick={() => setCreating(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add supplier</button>
      </div>

      {suppliers.length === 0 ? <EmptyState title="No suppliers yet" message="Add your suppliers so receiving and reorder can use their lead times." action={<button onClick={() => setCreating(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add supplier</button>} /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map((s) => {
            const supplied = products.filter((p) => p.supplierId === s.id)
            const open = openPos(s.id)
            const last = orders.filter((o) => o.supplierId === s.id && o.receivedAt).sort((a, b) => (a.receivedAt! < b.receivedAt! ? 1 : -1))[0]
            return (
              <div key={s.id} className={`card p-5 space-y-3 ${!s.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-textprimary flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> {s.name}</div>
                    {s.contactPerson && <div className="text-xs text-textsecondary mt-0.5">{s.contactPerson}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(s)} className="p-1.5 rounded-md hover:bg-page text-textmuted hover:text-primary"><Pencil className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="text-xs text-textmuted space-y-1">
                  {s.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{s.phone}</div>}
                  {s.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{s.email}</div>}
                  {s.address && <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{s.address}</div>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-page rounded-lg p-2"><div className="text-xs text-textmuted">Lead time</div><div className="font-semibold">{s.leadTimeDays}d</div></div>
                  <div className="bg-page rounded-lg p-2"><div className="text-xs text-textmuted">Products</div><div className="font-semibold">{supplied.length}</div></div>
                  <div className="bg-page rounded-lg p-2"><div className="text-xs text-textmuted">Open orders</div><div className="font-semibold">{open.length}</div></div>
                  <div className="bg-page rounded-lg p-2"><div className="text-xs text-textmuted">Last delivery</div><div className="font-semibold">{last ? formatDate(last.receivedAt!) : '—'}</div></div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && <SupplierModal supplier={editing} onClose={() => { setCreating(false); setEditing(null) }} />}
    </div>
  )
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [f, setF] = useState<Partial<Supplier>>(supplier || { active: true, leadTimeDays: 2, minOrderAmountCents: 0 })
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!f.name?.trim()) { toast('warning', 'Enter a name', 'Supplier name is required.'); return }
    setBusy(true)
    try {
      const data: Supplier = { ...(supplier as Supplier), ...f, id: supplier?.id || 's_' + Math.random().toString(36).slice(2, 10), storeId: session.storeId, name: f.name.trim() } as Supplier
      await backend.saveSupplier(data)
      await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: supplier ? 'supplier.edit' : 'supplier.create', entityType: 'supplier', entityId: data.id, afterState: { name: data.name } })
      toast('success', supplier ? 'Supplier updated' : 'Supplier added', data.name)
      refresh()
      onClose()
    } catch (e: any) { toast('error', 'Not saved', e?.message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={supplier ? 'Edit supplier' : 'Add supplier'} width="max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Supplier name *"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Contact person"><input className="input" value={f.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input type="email" className="input" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address" full><input className="input" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Lead time (days)"><input type="number" className="input" value={f.leadTimeDays || 0} onChange={(e) => set('leadTimeDays', parseInt(e.target.value || '0', 10))} /></Field>
        <Field label="Minimum order ($)"><input type="number" step="0.01" className="input" value={f.minOrderAmountCents ? (f.minOrderAmountCents / 100).toFixed(2) : ''} onChange={(e) => set('minOrderAmountCents', Math.round(parseFloat(e.target.value || '0') * 100))} /></Field>
        <Field label="Active"><select className="input" value={f.active ? 'true' : 'false'} onChange={(e) => set('active', e.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save supplier'}</button></div>
    </Modal>
  )
}

function Field({ label, children, full }: any) { return <div className={full ? 'sm:col-span-2' : ''}><label className="label">{label}</label>{children}</div> }