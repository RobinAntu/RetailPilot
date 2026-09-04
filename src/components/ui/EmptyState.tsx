import { ReactNode } from 'react'
import { PackageOpen } from 'lucide-react'

export function EmptyState({ icon, title, message, action }: {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-5 shadow-inner">
        {icon ?? <PackageOpen className="w-8 h-8 text-textmuted" />}
      </div>
      <h3 className="text-base font-semibold text-textprimary tracking-tight">{title}</h3>
      {message && <p className="text-sm text-textsecondary mt-1.5 max-w-md">{message}</p>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  )
}