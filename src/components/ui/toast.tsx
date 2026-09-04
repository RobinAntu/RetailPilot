import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export interface Toast { id: string; kind: ToastKind; title: string; message?: string }

interface ToastState {
  toasts: Toast[]
  push: (kind: ToastKind, title: string, message?: string) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, title, message) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, kind, title, message }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(kind: ToastKind, title: string, message?: string) {
  useToastStore.getState().push(kind, title, message)
}

const ICONS: Record<ToastKind, any> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
}
const COLORS: Record<ToastKind, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  info: 'text-info2',
}
const BG: Record<ToastKind, string> = {
  success: 'bg-success-light',
  warning: 'bg-warning-light',
  error: 'bg-danger-light',
  info: 'bg-blue-50',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={`${BG[t.kind]} border border-border rounded-card shadow-lift p-3 pr-9 flex items-start gap-3 animate-slideUp`}>
            <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${COLORS[t.kind]}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-textprimary">{t.title}</p>
              {t.message && <p className="text-sm text-textsecondary mt-0.5">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="absolute top-3 right-3 text-textmuted hover:text-textprimary">
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}