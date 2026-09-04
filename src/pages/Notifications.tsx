import { useNavigate } from 'react-router-dom'
import { CheckCheck, Bell } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { formatDateTime } from '../lib/date'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/toast'

const tone: Record<string, any> = {
  expired: 'danger', expiring_soon: 'warning', low_stock: 'warning', out_of_stock: 'danger',
  purchase_order_received: 'success', purchase_order_submitted: 'info', waste: 'warning', system: 'muted',
}

export default function Notifications() {
  const notifications = useDataStore((s) => s.notifications)
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const navigate = useNavigate()

  const markAll = async () => {
    await backend.markNotificationsRead(session.storeId)
    refresh()
    toast('success', 'All notifications marked read')
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Notifications</h1><p className="text-sm text-textmuted">Store events and operational alerts.</p></div>
        <button onClick={markAll} className="btn-secondary"><CheckCheck className="w-4 h-4" /> Mark all read</button>
      </div>
      <div className="card divide-y divide-border">
        {notifications.length === 0 ? <EmptyState icon={<Bell className="w-7 h-7 text-textmuted" />} title="You're all caught up" message="Notifications for expiry, low stock, and orders will appear here." /> : notifications.map((n) => (
          <button key={n.id} onClick={() => { backend.markNotificationsRead(session.storeId, [n.id]); refresh(); navigate(n.linkPath || '/notifications') }} className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-page ${n.read ? 'opacity-60' : ''}`}>
            <Badge tone={tone[n.type] || 'info'}>{label(n.type)}</Badge>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-textprimary">{n.title}</div>
              <div className="text-xs text-textsecondary mt-0.5">{n.message}</div>
            </div>
            <span className="text-xs text-textmuted shrink-0">{formatDateTime(n.createdAt)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function label(t: string) { return (t || 'system').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') }