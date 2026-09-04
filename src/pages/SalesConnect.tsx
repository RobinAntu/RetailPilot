import { useMemo, useRef, useState } from 'react'
import { Upload, RefreshCw, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Table2, PlugZap } from 'lucide-react'
import { useDataStore, backend } from '../store/appStore'
import { money } from '../lib/format'
import { toast } from '../components/ui/toast'
import { Badge } from '../components/ui/Badge'
import {
  parseTableFile, parseTable, normalizeApiJson, guessFields, buildImportedRows,
  type ConnectorFieldMap, type ParsedTable, type ImportedRow,
} from '../lib/connector'
import type { ImportSaleLine } from '../lib/backend/types'

type Tab = 'file' | 'api'
const FIELDS: { key: keyof ConnectorFieldMap; label: string }[] = [
  { key: 'date', label: 'Date / time' },
  { key: 'barcode', label: 'Barcode / SKU' },
  { key: 'name', label: 'Product name' },
  { key: 'qty', label: 'Quantity' },
  { key: 'price', label: 'Price / amount' },
  { key: 'payment', label: 'Payment method' },
]

export default function SalesConnect() {
  const session = useDataStore((s) => s.session)!
  const products = useDataStore((s) => s.products)
  const refresh = useDataStore((s) => s.refresh)
  const [tab, setTab] = useState<Tab>('file')
  const fileRef = useRef<HTMLInputElement>(null)

  // file
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [fileName, setFileName] = useState('')
  const [map, setMap] = useState<ConnectorFieldMap>({})
  const [busy, setBusy] = useState(false)

  // api
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [token, setToken] = useState('')
  const [body, setBody] = useState('')
  const [apiMap, setApiMap] = useState<ConnectorFieldMap>({})
  const [apiTable, setApiTable] = useState<ParsedTable | null>(null)
  const [apiError, setApiError] = useState('')
  const [fetching, setFetching] = useState(false)

  const preview = useMemo(() => (table ? buildImportedRows(table.rows, map, products) : null), [table, map, products])
  const apiPreview = useMemo(() => (apiTable ? buildImportedRows(apiTable.rows, apiMap, products) : null), [apiTable, apiMap, products])

  async function parseAndMap(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const t = await parseTableFile(file)
      setTable(t)
      setFileName(file.name)
      setMap(guessFields(t.headers))
      toast('success', 'File read', `${t.rows.length} rows, ${t.headers.length} columns.`)
    } catch {
      toast('error', 'Could not read file', 'Use a .csv, .tsv or .xlsx export.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function fetchApi() {
    setApiError(''); setApiTable(null)
    if (!url.trim()) { setApiError('Enter an endpoint URL.'); return }
    setFetching(true)
    try {
      const headers: Record<string, string> = {}
      if (token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`
      if (body.trim()) headers['Content-Type'] = 'application/json'
      const res = await fetch(url.trim(), { method, headers, body: method === 'POST' && body.trim() ? body : undefined })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const ctype = (res.headers.get('content-type') || '').toLowerCase()
      const t: ParsedTable = ctype.includes('json') ? normalizeApiJson(await res.json()) : parseTable(await res.text())
      setApiTable(t); setApiMap(guessFields(t.headers))
      toast('success', 'Connected', `${t.rows.length} rows fetched.`)
    } catch (err: any) {
      setApiError(err?.message || 'Connection failed')
      toast('error', 'Connection failed', err?.message || 'Could not reach that endpoint.')
    } finally {
      setFetching(false)
    }
  }

  async function doImport(fieldMap: ConnectorFieldMap, tbl: ParsedTable) {
    const built = buildImportedRows(tbl.rows, fieldMap, products)
    if (built.rows.length === 0) {
      toast('error', 'Nothing to import', 'No rows matched products. Check your column mapping.')
      return
    }
    setBusy(true)
    try {
      const lines: ImportSaleLine[] = built.rows.map((r) => ({
        barcode: r.barcode, name: r.name, qty: r.qty, unitPriceCents: r.unitPriceCents, timestamp: r.timestamp, payment: r.payment,
      }))
      const summary = await backend.importSales(session.storeId, lines, { uid: session.uid, name: session.name })
      await refresh()
      toast('success', `${summary.imported} sales imported`, `${money(summary.totalRevenueCents)} revenue recorded${summary.skipped ? `, ${summary.skipped} skipped` : ''}.`)
    } catch (err: any) {
      toast('error', 'Import failed', err?.message || 'Could not import sales.')
    } finally {
      setBusy(false)
    }
  }

  function Fields({ m, onChange }: { m: ConnectorFieldMap; onChange: (m: ConnectorFieldMap) => void }) {
    const headers = (tab === 'file' ? table?.headers : apiTable?.headers) ?? []
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <select className="input" value={m[f.key] ?? ''} onChange={(e) => onChange({ ...m, [f.key]: e.target.value || undefined })}>
              <option value="">— ignore —</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
        ))}
      </div>
    )
  }

  function Preview({ p, doIt }: { p: ReturnType<typeof buildImportedRows>; doIt: () => void }) {
    return (
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="success">{p.rows.length} will import</Badge>
          {p.unresolved.length > 0 && <Badge tone="warning">{p.unresolved.length} unresolved</Badge>}
          {p.missing.length > 0 && <Badge tone="danger">{p.missing.length} mapping issue</Badge>}
        </div>
        {p.missing.length > 0 && (
          <p className="text-sm text-danger flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{p.missing.join(' ')}</span></p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-textmuted border-b">
                <th className="p-2">Row</th><th className="p-2">Product</th><th className="p-2">Qty</th>
                <th className="p-2">Unit price</th><th className="p-2">Date</th><th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="p-2 text-textmuted">#{r.sourceRow}</td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2">{r.qty}</td>
                  <td className="p-2">{money(r.unitPriceCents ?? 0)}</td>
                  <td className="p-2 text-textmuted">{r.timestamp.slice(0, 10)}</td>
                  <td className="p-2"><CheckCircle2 className="w-4 h-4 text-success" /></td>
                </tr>
              ))}
              {p.unresolved.slice(0, 5).map((u, i) => (
                <tr key={'u' + i} className="border-b border-slate-100">
                  <td className="p-2 text-textmuted">#{u.row}</td>
                  <td className="p-2" colSpan={4}>{u.reason}</td>
                  <td className="p-2"><XCircle className="w-4 h-4 text-danger" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-primary" onClick={doIt} disabled={busy || p.rows.length === 0}>
          <Upload className="w-4 h-4" /> Import {p.rows.length} sales
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-extrabold text-textprimary">Sales Connect</h1>
        <p className="text-sm text-textmuted max-w-3xl">Bring today's sales in from your store's register — via file export or a live API. Rows match to products by barcode (then name); unmatched rows are skipped, never guessed.</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('file')} className={tab === 'file' ? 'btn-primary' : 'btn-secondary'}>
          <FileSpreadsheet className="w-4 h-4" /> Import file
        </button>
        <button onClick={() => setTab('api')} className={tab === 'api' ? 'btn-primary' : 'btn-secondary'}>
          <PlugZap className="w-4 h-4" /> API connector
        </button>
      </div>

      {tab === 'file' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => fileRef.current?.click()} className="btn-secondary"><Upload className="w-4 h-4" /> Choose CSV / Excel</button>
              {fileName && <span className="text-sm text-textmuted">{fileName}</span>}
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={parseAndMap} />
            </div>
            {!table && (
              <p className="text-sm text-textmuted">Upload any sales export from your register, e.g. <code className="text-primary">sales_export.csv</code> or an XLSX report. Columns are auto-detected — check the mapping below.</p>
            )}
          </div>
          {table && preview && (
            <>
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-primary" /><h2 className="font-semibold text-textprimary">Column mapping</h2></div>
                <Fields m={map} onChange={setMap} />
              </div>
              <Preview p={preview} doIt={() => doImport(map, table)} />
            </>
          )}
        </div>
      )}

      {tab === 'api' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2"><PlugZap className="w-4 h-4 text-primary" /><h2 className="font-semibold text-textprimary">Generic REST endpoint</h2></div>
            <p className="text-sm text-textmuted">Point at any sales system's API (GET returns JSON/CSV; POST sends a JSON body). We map the response to products and pull sales in. <b>No credentials are stored</b> — the token is sent per request.</p>
            <div className="flex gap-2">
              <select className="input !w-28" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="GET">GET</option><option value="POST">POST</option>
              </select>
              <input className="input flex-1" placeholder="https://api.store.com/today-sales" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <input className="input" placeholder="Bearer token (optional)" value={token} onChange={(e) => setToken(e.target.value)} />
            {method === 'POST' && <textarea className="input" rows={3} placeholder={'JSON body, e.g. {"date":"2026-09-03"}'} value={body} onChange={(e) => setBody(e.target.value)} />}
            {apiError && <p className="text-sm text-danger flex items-center gap-1.5"><XCircle className="w-4 h-4" /> {apiError}</p>}
            <button className="btn-primary" onClick={fetchApi} disabled={fetching}>
              {fetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} Test &amp; fetch
            </button>
          </div>
          {apiTable && apiPreview && (
            <>
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2"><Table2 className="w-4 h-4 text-primary" /><h2 className="font-semibold text-textprimary">Column mapping</h2></div>
                <Fields m={apiMap} onChange={setApiMap} />
              </div>
              <Preview p={apiPreview} doIt={() => doImport(apiMap, apiTable)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}