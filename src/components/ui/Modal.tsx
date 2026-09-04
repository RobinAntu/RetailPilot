import { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-[3px] animate-fadeIn" onClick={onClose} />
      <div className={`relative bg-card w-full ${width} rounded-t-2xl sm:rounded-2xl shadow-pop max-h-[92vh] flex flex-col animate-slideUp ring-1 ring-black/5`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold text-textprimary tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-textmuted hover:bg-slate-100 hover:text-textprimary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}