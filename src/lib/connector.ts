import * as XLSX from 'xlsx'
import type { Product } from '../types'

// ---------- Generic external-sales connector (CSV / Excel / REST API) ----------
// Turns rows from any store sales feed into RetailPilot import lines, matching
// rows to products by barcode (then name). Unknown rows are reported, never guessed.

export interface ParsedTable {
  headers: string[]
  rows: Record<string, string>[]
}

export interface ConnectorFieldMap {
  date?: string
  barcode?: string
  name?: string
  qty?: string
  price?: string
  payment?: string
}

export interface ImportedRow {
  barcode: string
  name: string
  qty: number
  unitPriceCents: number | null // null => use the product's default sell price
  timestamp: string // ISO
  payment: string
  sourceRow: number
}

export interface ImportPreview {
  rows: ImportedRow[]
  unresolved: { row: number; barcode: string; name: string }[]
  missingFields: string[]
  totalRevenueCents: number
}

/** Parse CSV / TSV / delimited text (also handles .xlsx via SheetJS) into a header+rows table. */
export function parseTable(text: string): ParsedTable {
  const wb = XLSX.read(text, { type: 'string' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
  const headers = raw.length ? Object.keys(raw[0]) : []
  const rows = raw.map((r) => {
    const o: Record<string, string> = {}
    for (const h of headers) o[h] = String(r[h] ?? '').trim()
    return o
  })
  return { headers, rows }
}

/** Read a File (csv/xlsx/txt) into a ParsedTable. */
export async function parseTableFile(file: File): Promise<ParsedTable> {
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
  const headers = raw.length ? Object.keys(raw[0]) : []
  const rows = raw.map((r) => {
    const o: Record<string, string> = {}
    for (const h of headers) o[h] = String(r[h] ?? '').trim()
    return o
  })
  return { headers, rows }
}

const pick = (headers: string[], regexes: RegExp[]): string | undefined =>
  headers.find((h) => regexes.some((r) => r.test(h)))

/** Suggest which columns map to date / barcode / name / qty / price / payment. */
export function guessFields(headers: string[]): ConnectorFieldMap {
  const clean = headers.map((h) => h.toLowerCase())
  const find = (re: RegExp) => {
    const i = clean.findIndex((h) => re.test(h))
    return i >= 0 ? headers[i] : undefined
  }
  return {
    date: find(/(date|time|timestamp|day|when|created)/i) ?? undefined,
    barcode: find(/(barcode|bar.?code|upc|ean|sku|product.?code|item.?code)/i) ?? undefined,
    name: find(/(name|product|item|description|title|label)/i) ?? undefined,
    qty: find(/(qty|quantity|units|count|number of|amount.?sold)/i) ?? undefined,
    price: find(/(price|amount|total|value|sale.?amount|revenue)/i) ?? undefined,
    payment: find(/(payment|pay.?type|method|tender|how.?paid)/i) ?? undefined,
  }
}

/** Convert a human date string (AU DD/MM/YYYY, DD-MM-YYYY, or ISO) to an ISO timestamp. */
export function coerceISO(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // ISO date/datetime already
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/)
  if (iso) {
    const [, y, mo, d, hh = '00', mm = '00'] = iso
    return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm)).toISOString()
  }
  // AU style DD/MM/YYYY or DD-MM-YYYY
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (dm) {
    const [, d, mo, y, hh = '00', mm = '00'] = dm
    return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm)).toISOString()
  }
  return null
}

function moneyToCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Math.round(v * 100)
  const s = String(v).replace(/[$, ]/g, '')
  const n = parseFloat(s)
  return Number.isNaN(n) ? null : Math.round(n * 100)
}

function num(v: string | null | undefined, def: number): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isNaN(n) ? def : Math.max(0, n)
}

const g = (row: Record<string, string>, key: string | undefined) => (key ? row[key] ?? '' : '')

/** Map parsed rows into ImportedRow[], resolving each against the product catalogue. */
export function buildImportedRows(
  rows: Record<string, string>[],
  field: ConnectorFieldMap,
  products: Product[],
): { rows: ImportedRow[]; unresolved: { row: number; reason: string; name: string }[]; missing: string[] } {
  const unresolved: { row: number; reason: string; name: string }[] = []
  const missing: string[] = []
  const out: ImportedRow[] = []

  if (!field.name && !field.barcode) {
    missing.push('Neither a name nor barcode column could be mapped.')
  }

  const byBarcode = new Map<string, Product>()
  for (const p of products) if (p.barcode) byBarcode.set(p.barcode.toLowerCase(), p)

  rows.forEach((row, i) => {
    const src = i + 2 // header on row 1
    const name = g(row, field.name)
    const barcode = g(row, field.barcode).toLowerCase()
    const qty = num(g(row, field.qty), 1)
    const priceCents = moneyToCents(g(row, field.price))
    const timestamp = coerceISO(g(row, field.date)) ?? new Date().toISOString()
    const payment = g(row, field.payment) || 'Card'

    let product: Product | undefined
    if (barcode) product = byBarcode.get(barcode)
    if (!product && name) {
      const ln = name.toLowerCase()
      product = products.find((p) => p.name.toLowerCase() === ln)
    }
    if (!product) {
      unresolved.push({ row: src, reason: barcode ? `No product with barcode/name "${name || barcode}"` : `No product matching "${name}"`, name: name || barcode })
      return
    }
    out.push({ barcode: product.barcode, name: product.name, qty, unitPriceCents: priceCents, timestamp, payment, sourceRow: src })
  })

  return { rows: out, unresolved, missing }
}

// ---------- Supplier import ----------
export interface SupplierImportRow {
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  leadTimeDays: number
  minOrderAmountCents: number
  notes: string
}

export function buildSupplierRows(rows: Record<string, string>[], field: { name?: string; contact?: string; phone?: string; email?: string; address?: string; lead?: string; minOrder?: string; notes?: string }): { rows: SupplierImportRow[]; skipped: { row: number; reason: string }[] } {
  const skipped: { row: number; reason: string }[] = []
  const out: SupplierImportRow[] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const src = i + 2
    const name = (field.name ? r[field.name] : '') || ''
    if (!name.trim()) { skipped.push({ row: src, reason: 'Missing name' }); return }
    if (seen.has(name.trim().toLowerCase())) { skipped.push({ row: src, reason: 'Duplicate name' }); return }
    seen.add(name.trim().toLowerCase())
    const lead = parseInt(String((field.lead ? r[field.lead] : '') || '0').replace(/\D/g, ''), 10) || 0
    const minAmt = Math.round(parseFloat(String((field.minOrder ? r[field.minOrder] : '') || '0').replace(/[$, ]/g, '')) * 100) || 0
    out.push({
      name: name.trim(),
      contactPerson: (field.contact ? r[field.contact] : '') || '',
      phone: (field.phone ? r[field.phone] : '') || '',
      email: (field.email ? r[field.email] : '') || '',
      address: (field.address ? r[field.address] : '') || '',
      leadTimeDays: lead,
      minOrderAmountCents: minAmt,
      notes: (field.notes ? r[field.notes] : '') || '',
    })
  })
  return { rows: out, skipped }
}

/** API connectors often return JSON. Normalize common shapes into a row table. */
export function normalizeApiJson(data: unknown): { headers: string[]; rows: Record<string, string>[] } {
  let arr: any[] = []
  if (Array.isArray(data)) arr = data
  else if (data && typeof data === 'object') {
    const any = data as any
    if (Array.isArray(any.rows)) arr = any.rows
    else if (Array.isArray(any.data)) arr = any.data
    else if (Array.isArray(any.sales)) arr = any.sales
    else if (Array.isArray(any.result)) arr = any.result
    else arr = [any]
  }
  const headers = arr.length ? Object.keys(arr[0]).map(String) : []
  const rows = arr.map((r: any) => {
    const o: Record<string, string> = {}
    for (const h of headers) o[h] = r[h] === null || r[h] === undefined ? '' : String(r[h])
    return o
  })
  return { headers, rows }
}