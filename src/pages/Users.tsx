import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { ROLE_LABELS } from '../types'
import type { Role } from '../types'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { toast } from '../components/ui/toast'
import { formatDate } from '../lib/date'

export default function Users() {
  const session = useDataStore((s) => s.session)!
  const users = useDataStore((s) => s.users)
  const refresh = useDataStore((s) => s.refresh)
  const [inviteOpen, setInviteOpen] = useState(false)

  const setRole = async (id: string, role: Role) => {
    await backend.setUserRole(session.storeId, id, role, { uid: session.uid, name: session.name })
    toast('success', 'Role updated', `${ROLE_LABELS[role]} role assigned.`)
    refresh()
  }
  const deactivate = async (id: string) => {
    try {
      await backend.deactivateUser(session.storeId, id, { uid: session.uid, name: session.name })
      toast('success', 'User deactivated')
      refresh()
    } catch (e: any) { toast('error', 'Not deactivated', e?.message) }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-textprimary">Users</h1><p className="text-sm text-textmuted">Owner-only. Invite staff and assign roles.</p></div>
        <button onClick={() => setInviteOpen(true)} className="btn-primary"><UserPlus className="w-4 h-4" /> Invite user</button>
      </div>

      <div className="card overflow-x-auto">
        {users.length === 0 ? <EmptyState title="No users" /> : (
          <table className="table-base"><thead className="bg-page"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Joined</th><th className="th text-right">Actions</th></tr></thead><tbody>
            {users.map((u) => (
              <tr key={u.id} className="table-row">
                <td className="td font-semibold">{u.name}</td>
                <td className="td text-xs">{u.email}</td>
                <td className="td">
                  {u.id === session.uid && u.role === 'owner' ? <Badge tone="primary">Owner (you)</Badge> : (
                    <select value={u.role} disabled={u.role === 'owner'} onChange={(e) => setRole(u.id, e.target.value as Role)} className="input !w-auto !py-1.5">
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r} disabled={r === 'owner'}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  )}
                </td>
                <td className="td"><Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="td text-xs">{formatDate(new Date(u.createdAt))}</td>
                <td className="td text-right">
                  {u.role !== 'owner' && u.active && <button onClick={() => deactivate(u.id)} className="btn-ghost !px-2 text-danger" title="Deactivate"><X className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const session = useDataStore((s) => s.session)!
  const refresh = useDataStore((s) => s.refresh)
  const [f, setF] = useState({ name: '', email: '', role: 'staff' as Role, password: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }))

  const invite = async () => {
    if (!f.name || !f.email || f.password.length < 6) { toast('warning', 'Complete the form', 'Password must be at least 6 characters.'); return }
    setBusy(true)
    try {
      await backend.inviteUser(session.storeId, f, { uid: session.uid, name: session.name })
      toast('success', 'User invited', `${f.email} added as ${ROLE_LABELS[f.role]}.`)
      refresh()
      onClose()
    } catch (e: any) { toast('error', 'Invite failed', e?.message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Invite user" width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-textmuted">The temporary password is set now. In production, Firebase Auth handles credentials — passwords are never stored in Firestore.</p>
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="label">Role</label><select className="input" value={f.role} onChange={(e) => set('role', e.target.value)}>{(['manager', 'staff'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <div><label className="label">Temporary password</label><input type="text" className="input" value={f.password} onChange={(e) => set('password', e.target.value)} /></div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={invite} disabled={busy} className="btn-primary">{busy ? 'Inviting…' : 'Invite user'}</button></div>
      </div>
    </Modal>
  )
}