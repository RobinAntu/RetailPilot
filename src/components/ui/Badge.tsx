import { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary'

const toneClasses: Record<Tone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  info: 'bg-blue-50 text-info2',
  muted: 'bg-slate-100 text-textsecondary',
  primary: 'bg-blue-50 text-primary',
}

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${toneClasses[tone]}`}>{children}</span>
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel, busy }: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-md">
      <div className="flex gap-3">
        <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${danger ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'}`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="text-sm text-textsecondary">{message}</div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}