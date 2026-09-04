import { fromCents } from './money'

let _symbol = '$'

export function setCurrencySymbol(symbol: string) {
  _symbol = symbol || '$'
}

export function money(cents: number, symbol?: string): string {
  const s = symbol ?? _symbol
  const v = fromCents(Math.round(cents || 0))
  const neg = v < 0
  const body = `${s}${Math.abs(v).toFixed(2)}`
  return neg ? `-${body}` : body
}

export function moneyInt(cents: number, symbol?: string): string {
  return money(cents, symbol)
}

export function pct(value: number, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function num(n: number, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '0'
  return n.toLocaleString('en-AU', { maximumFractionDigits: digits })
}

export function centsFromDisplay(str: string): number {
  if (str == null || str === '') return 0
  const cleaned = str.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isNaN(n) ? 0 : Math.round(n * 100)
}

// Parse a user-typed money amount like "$12.50" or "1250" into cents.
// Australian convention: decimal point. Keep simple.
export function parseMoneyInput(str: string): number {
  return centsFromDisplay(str)
}
