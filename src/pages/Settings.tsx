import { useState } from 'react'
import { useDataStore } from '../store/appStore'
import { backend } from '../store/appStore'
import { setCurrencySymbol } from '../lib/format'
import { CURRENCIES, LOCALES, TIMEZONES } from '../types'
import { toast } from '../components/ui/toast'

type Tab = 'store' | 'inventory' | 'pos' | 'security' | 'appearance'

export default function Settings() {
  const session = useDataStore((s) => s.session)!
  const settings = useDataStore((s) => s.settings)
  const refresh = useDataStore((s) => s.refresh)
  const [tab, setTab] = useState<Tab>('store')
  const [f, setF] = useState<any>({ ...(settings || {}) })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const data = { ...settings, ...f, storeId: session.storeId }
      await backend.saveSettings(data)
      setCurrencySymbol(data.currencySymbol)
      await backend.createAuditLog(session.storeId, { uid: session.uid, userName: session.name, action: 'settings.update', entityType: 'settings', entityId: 'store', afterState: { tab } })
      toast('success', 'Settings saved', 'Your changes were written.')
      refresh()
    } catch (e: any) { toast('error', 'Not saved', e?.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div><h1 className="text-2xl font-extrabold text-textprimary">Settings</h1><p className="text-sm text-textmuted">Store-wide configuration. Applies to all devices.</p></div>

      <div className="flex gap-1 bg-page rounded-lg p-1 w-fit">
        {(['store', 'inventory', 'pos', 'security', 'appearance'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t ? 'bg-white shadow-card font-semibold text-primary' : 'text-textsecondary'}`}>{cap(t)}</button>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        {tab === 'store' && (
          <>
            <h2 className="font-bold">Store</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Store name"><input className="input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></F>
              <F label="Phone"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></F>
              <F label="Address" full><input className="input" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></F>
              <F label="ABN (optional)"><input className="input" value={f.abn || ''} onChange={(e) => set('abn', e.target.value)} /></F>
              <F label="Currency">
                <select className="input" value={f.currency} onChange={(e) => { const c = CURRENCIES.find((x) => x.code === e.target.value); set('currency', e.target.value); set('currencySymbol', c?.symbol || '$') }}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                </select>
              </F>
              <F label="Locale"><select className="input" value={f.locale || 'en-AU'} onChange={(e) => set('locale', e.target.value)}>{LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></F>
              <F label="Timezone"><select className="input" value={f.timezone || 'Australia/Sydney'} onChange={(e) => set('timezone', e.target.value)}>{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
            </div>
          </>
        )}
        {tab === 'inventory' && (
          <>
            <h2 className="font-bold">Inventory</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <F label="Default minimum stock"><input type="number" className="input" value={f.defaultMinimumStock ?? 5} onChange={(e) => set('defaultMinimumStock', parseInt(e.target.value) || 0)} /></F>
              <F label="Safety stock days"><input type="number" className="input" value={f.safetyStockDays ?? 2} onChange={(e) => set('safetyStockDays', parseInt(e.target.value) || 0)} /></F>
              <F label="Expiry warning (days)"><input type="number" className="input" value={f.expiryWarningDays ?? 7} onChange={(e) => set('expiryWarningDays', parseInt(e.target.value) || 0)} /></F>
            </div>
          </>
        )}
        {tab === 'pos' && (
          <>
            <h2 className="font-bold">Point of Sale</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Tax rate (%) — not hardcoded"><input type="number" step="0.1" className="input" value={f.taxRatePercent ?? 10} onChange={(e) => set('taxRatePercent', parseFloat(e.target.value) || 0)} /></F>
              <F label="Receipt footer"><input className="input" value={f.receiptFooter || ''} onChange={(e) => set('receiptFooter', e.target.value)} /></F>
              <Toggle label="Allow staff to apply discounts" checked={!!f.allowStaffDiscount} onChange={(v) => set('allowStaffDiscount', v)} />
              <Toggle label="Allow staff to void sales" checked={!!f.allowStaffVoid} onChange={(v) => set('allowStaffVoid', v)} />
            </div>
          </>
        )}
        {tab === 'security' && (
          <>
            <h2 className="font-bold">Security</h2>
            <p className="text-sm text-textsecondary">Roles: <b>Owner</b> has full access. <b>Manager</b> has operational access. <b>Staff</b> use POS, scanning, receiving and expiry checks. Staff cannot promote themselves or change roles.</p>
            <p className="text-sm text-textsecondary">Permissions are enforced by both the user interface and the production Firestore security rules (store-isolated, no test mode).</p>
          </>
        )}
        {tab === 'appearance' && (
          <>
            <h2 className="font-bold">Appearance</h2>
            <p className="text-sm text-textsecondary">RetailPilot uses the RetailPilot design system — navy sidebar, Inter font, rounded cards and touch-friendly controls, automatically across desktop and mobile.</p>
          </>
        )}
      </div>

      <div className="flex justify-end"><button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save settings'}</button></div>
    </div>
  )
}

function F({ label, children, full }: any) { return <div className={full ? 'sm:col-span-2' : ''}><label className="label">{label}</label>{children}</div> }
function Toggle({ value, onChange, label }: any) {
  return <div className="flex items-center justify-between bg-page rounded-lg p-3"><span className="text-sm">{label}</span><button onClick={() => onChange(!value)} className={`w-11 h-6 rounded-full relative transition ${value ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} /></button></div>
}
function cap(s: string) { return s[0].toUpperCase() + s.slice(1) }