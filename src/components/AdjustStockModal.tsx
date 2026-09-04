import { useState } from 'react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { ADJUSTMENT_REASONS } from '../types'
import type { Product } from '../types'
import { Modal } from './ui/Modal'
import { toast } from './ui/toast'
import { ConfirmDialog } from './ui/Badge'

export function AdjustStockModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState(ADJUSTMENT_REASONS[0])
  const [notes, setNotes] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const n = parseInt(qty || '0', 10) || 0
  const delta = mode === 'add' ? n : -n
  const newTotal = Math.max(0, (product.totalStock || 0) + delta)

  const submit = async () => {
    setBusy(true)
    try {
      await backend.adjustStock(session.storeId, {
        productId: product.id, delta, reason, notes,
        user: { uid: session.uid, name: session.name },
      })
      toast('success', 'Stock adjusted', `${product.name} now has ${newTotal} units.`)
      refresh()
      onClose()
    } catch (e: any) {
      toast('error', 'Adjustment failed', e?.message)
    } finally { setBusy(false) }
  }

  return (
    <>
      <Modal open onClose={onClose} title={`Adjust stock — ${product.name}`} width="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm bg-page rounded-lg p-3">
            <span className="text-textsecondary">Current stock</span>
            <span className="font-bold text-textprimary">{product.totalStock ?? 0} {product.unit}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('add')} className={`btn ${mode === 'add' ? 'bg-success text-white border-success' : 'bg-secondary border-border text-textsecondary'}`}>+ Add</button>
            <button onClick={() => setMode('remove')} className={`btn ${mode === 'remove' ? 'bg-danger text-white border-danger' : 'bg-secondary border-border text-textsecondary'}`}>− Remove</button>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="input">
              {ADJUSTMENT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" placeholder="e.g. found 3 damaged on the shelf" />
          </div>
          <div className="flex items-center justify-between text-sm bg-page rounded-lg p-3">
            <span className="text-textsecondary">New stock after adjustment</span>
            <span className="font-bold text-textprimary">{newTotal} {product.unit}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button disabled={n <= 0} onClick={() => setConfirm(true)} className="btn-primary">Apply adjustment</button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={submit} busy={busy}
        title="Confirm stock adjustment"
        message={`This will ${mode} ${n} unit${n !== 1 ? 's' : ''} ${mode === 'remove' ? 'from' : 'to'} "${product.name}", changing stock from ${product.totalStock ?? 0} to ${newTotal}. Reason: ${reason}. This is recorded in the audit trail.`}
        confirmLabel={busy ? 'Saving…' : 'Confirm adjustment'} danger={mode === 'remove'} />
    </>
  )
}