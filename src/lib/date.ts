// Date helpers — DD/MM/YYYY default display (en-AU), ISO storage.

export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toISO(d: Date): string {
  return d.toISOString()
}

export function parseISO(iso: string): Date {
  return new Date(iso)
}

export function formatDate(iso: string | Date | null): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${m}/${d.getFullYear()}`
}

export function formatDateTime(iso: string | Date | null): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${m}/${d.getFullYear()} ${h}:${min} ${ampm}`
}

export function daysUntil(dateISO: string | null): number | null {
  if (!dateISO) return null
  const target = new Date(dateISO + 'T23:59:59')
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysAgoISO(days: number): string {
  return toISODate(new Date(Date.now() - days * 86400000))
}

export function lastNDates(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(daysAgoISO(i))
  }
  return out
}

export function isDateInRange(dateISO: string, fromISO: string, toISO: string): boolean {
  return dateISO >= fromISO && dateISO <= toISO
}

// Relative human label
export function relativeDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(todayISO() + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1) return `in ${diff} days`
  if (diff < -1) return `${Math.abs(diff)} days ago`
  return ''
}