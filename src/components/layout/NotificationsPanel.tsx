import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useDataStore } from '../../store/appStore'
import { backend } from '../../store/appStore'
import { formatDateTime } from '../../lib/date'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'

const tone: Record<string, any> = {
  expired: 'danger', expiring_soon: 'warning', low_stock: 'warning', out_of_stock: 'danger',
  purchase_order_received: 'success', purchase_order_submitted: 'info', waste: 'warning', system: 'muted',
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const notifications = useDataStore((s) => s.notifications)
  const session = useDataStore((s) => s.session)
  const refresh = useDataStore((s) => s.refresh)
  const navigate = useNavigate()

  const markAll = async () => {
    if (!session) return
    await backend.markNotificationsRead(session.storeId)
    refresh()
  }

  const open = (n: any) => {
    navigate(n.linkPath || '/notifications')
    onClose()
  }

  return (
    <div className="absolute right-4 top-14 z-40 w-[360px] max-w-[92vw] bg-white border border-border rounded-card shadow-lift overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold text-textprimary flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</h3>
        {notifications.some((n) => !n.read) && (
          <button onClick={markAll} className="flex items-center gap-1 text-xs text-primary hover:underline"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
        )}
        <button onClick={onClose} className="text-textmuted hover:text-textprimary"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {notifications.length === 0 && <EmptyState title="No notifications" message="You're all caught up." />}
        {notifications.map((n) => (
          <button key={n.id} onClick={() => open(n)} className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-page ${n.read ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2">
              <Badge tone={tone[n.type] || 'muted'}>{label(n.type)}</Badge>
              <span className="text-[11px] text-textmuted ml-auto">{formatDateTime(n.createdAt)}</span>
            </div>
            <div className="text-sm font-semibold text-textprimary mt-1">{n.title}</div>
            <div className="text-xs text-textsecondary mt-0.5">{n.message}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function label(t: string) {
  return (t || 'system').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}