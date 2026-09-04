import { useState } from 'react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { WASTE_REASONS } from '../types'
import type { StockBatch } from '../types'
import { money } from '../lib/format'
import { Modal } from './ui/Modal'
import { toast } from './ui/toast'
import { ConfirmDialog } from './ui/Badge'

export function WasteRecordModal({ batch, presetProductId, onClose }: {
  batch?: StockBatch | null
  presetProductId?: string
  onClose: () => void
}) {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const batches = useDataStore((s) => s.batches)
  const refresh = useDataStore((s) => s.refresh)

  const [productId, setProductId] = useState(presetProductId || batch?.productId || '')
  const [batchId, setBatchId] = useState(batch?.id || '')
  const [qty, setQty] = useState(batch ? String(batch.qtyRemaining) : '')
  const [reason, setReason] = useState(WASTE_REASONS[0])
  const [notes, setNotes] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const product = products.find((p) => p.id === productId)
  const productBatches = batches.filter((b) => b.productId === productId && b.qtyRemaining > 0)
  const available = batches.filter((b) => b.productId === productId && b.qtyRemaining > 0)
  const selectedBatch = batches.find((b) => b.id === batchId)
  const n = parseInt(qty || '0', 10) || 0
  const cost = n * (selectedBatch?.unitCostCents || 0)

  const submit = async () => {
    if (!product || !selectedBatch || n <= 0) { toast('warning', 'Select batch & quantity', 'Choose a batch and enter a positive quantity.'); return }
    setBusy(true)
    try {
      await backend.recordWaste(session.storeId, {
        product, batchId: selectedBatch.id, qty: n, reason, notes,
        user: { uid: session.uid, name: session.name },
      })
      toast('success', 'Waste recorded', `${n} × ${product.name} — estimated loss ${money(cost)}`)
      refresh()
      onClose()
    } catch (e: any) {
      toast('error', 'Waste not recorded', e?.message)
    } finally { setBusy(false) }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Record waste" width="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="label">Product</label>
            <select className="input" value={productId} onChange={(e) => { setProductId(e.target.value); setBatchId('') }}>
              <option value="">— select product —</option>
              {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {product && (
            <div>
              <label className="label">Batch (expiry)</label>
              <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">— select batch —</option>
                {productBatches.map((b) => <option key={b.id} value={b.id}>Batch {b.id.slice(0, 6)} · {b.expiryDate || 'no expiry'} · {b.qtyRemaining} left</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Quantity</label>
            <input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">Reason</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as any)}>{WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-between bg-danger-light rounded-lg p-3 text-sm">
            <span className="text-danger">Estimated cost loss</span><span className="font-bold text-danger">{money(cost)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={() => setConfirm(true)} disabled={!batchId || n <= 0} className="btn-danger">Record waste</button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={submit} busy={busy}
        title="Confirm waste" danger message={<>Recording <b>{n}</b> × <b>{product?.name}</b> as waste for reason <b>{reason}</b>. This removes it from stock and reduces profitability. Estimated loss <b>{money(cost)}</b>.</>}
        confirmLabel={busy ? 'Saving…' : 'Confirm waste'} />
    </>
  )
}