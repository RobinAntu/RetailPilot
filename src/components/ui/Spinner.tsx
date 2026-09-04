import { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-primary`} />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Spinner className="w-8 h-8" />
      <p className="text-sm text-textmuted">{label}</p>
    </div>
  )
}

export function ButtonLoading() {
  return <Loader2 className="w-4 h-4 animate-spin" />
}

export function StatefulButton({ loading, children, ...props }: any) {
  return (
    <button {...props} disabled={loading || props.disabled}>
      {loading && <ButtonLoading />}
      {children}
    </button>
  )
}