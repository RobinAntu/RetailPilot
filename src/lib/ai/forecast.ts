// =====================================================================
// RetailPilot AI — Forecasting engine
// Pure, deterministic forecasts built from real store data. Values are
// clearly labelled as estimates, never guarantees.
// =====================================================================
import type { Product, Sale, StockBatch, WasteRecord } from '../../types'

export interface ForecastPoint {
  date: string
  value: number // predicted units (or currency units) for that day
}

export interface ProductVelocity {
  productId: string
  name: string
  avgDailyUnits: number // over the trailing window
  recent: number
  days: number
}

/** Weighted moving average forecast for the next N days. */
export function forecastSeries(
  history: { date: string; value: number }[],
  days = 7,
  window = 7,
): ForecastPoint[] {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1))
  const recent = sorted.slice(-window).map((p) => p.value)
  const n = recent.length
  if (n === 0) {
    const last = sorted[sorted.length - 1]?.value || 0
    const base = new Date()
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(base)
      d.setDate(d.getDate() + i + 1)
      return { date: d.toISOString().slice(0, 10), value: Math.max(0, last) }
    })
  }
  // weighted average: more weight to recent days
  let total = 0
  let weightSum = 0
  recent.forEach((v, i) => {
    const w = i + 1
    total += v * w
    weightSum += w
  })
  const level = total / weightSum
  // simple linear trend over the window
  let slope = 0
  if (n >= 3) {
    const y = recent
    const xMean = (n - 1) / 2
    const yMean = y.reduce((a, b) => a + b, 0) / n
    let num = 0
    let den = 0
    y.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) * (i - xMean) })
    slope = den > 0 ? num / den : 0
  }
  const base = new Date()
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i + 1)
    const value = Math.max(0, Math.round(level + slope * (n + i)))
    return { date: d.toISOString().slice(0, 10), value }
  })
}

/** Per-product sales velocity (avg daily units) over the trailing window. */
export function productVelocities(sales: Sale[], windowDays = 14): ProductVelocity[] {
  const start = new Date()
  start.setDate(start.getDate() - windowDays)
  const startIso = start.toISOString().slice(0, 10)
  const units: Record<string, { name: string; recent: number; days: number }> = {}
  const seen: Record<string, Set<string>> = {}
  sales
    .filter((s) => s.status !== 'voided' && s.timestamp.slice(0, 10) >= startIso)
    .forEach((s) => {
      const d = s.timestamp.slice(0, 10)
      s.lines.forEach((l) => {
        const e = (units[l.productId] ||= { name: l.name, recent: 0, days: 0 })
        e.recent += l.qty
        if (!seen[l.productId]) seen[l.productId] = new Set()
        seen[l.productId].add(d)
      })
    })
  return Object.entries(units).map(([productId, e]) => ({
    productId,
    name: e.name,
    days: e.days || Math.min(windowDays, seen[productId]?.size || 1),
    recent: e.recent,
    avgDailyUnits: e.recent / Math.max(1, Math.min(windowDays, e.days || 1)),
  }))
}

export interface ExpiryRiskProjection {
  productId: string
  productName: string
  batchId: string
  qtyRemaining: number
  daysToExpiry: number
  avgDailyUnits: number
  expectedSalesBeforeExpiry: number
  excessUnits: number
  costAtRiskCents: number
  projected: 'sell_through' | 'watch' | 'excess'
  advice: string
}

/** Project each expiring batch against its sales velocity. */
export function projectExpiryRisk(
  batches: StockBatch[],
  products: Product[],
  velocities: ProductVelocity[],
): ExpiryRiskProjection[] {
  const vel = new Map(velocities.map((v) => [v.productId, v.avgDailyUnits]))
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const out: ExpiryRiskProjection[] = []
  for (const b of batches) {
    if (!b.expiryDate || b.qtyRemaining <= 0) continue
    const d = new Date(b.expiryDate + 'T23:59:59')
    if (d < today) continue
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    const avg = vel.get(b.productId) || 0
    const expected = Math.floor(avg * days)
    const excess = Math.max(0, b.qtyRemaining - expected)
    const cost = excess * b.unitCostCents
    const p = products.find((x) => x.id === b.productId)
    let projected: ExpiryRiskProjection['projected'] = 'sell_through'
    let advice = `On current pace (~${avg.toFixed(1)}/day), ${b.qtyRemaining} units should clear before expiry in ${days} days.`
    if (excess > 0 && days <= 7) {
      projected = 'excess'
      advice = `~${excess} units (${moneyS(cost)}) risk expiry in ${days} days. Promote or mark down now — forecast is an estimate, not a guarantee.`
    } else if (excess > 0) {
      projected = 'watch'
      advice = `~${excess} units may be left over (${moneyS(cost)}). Watch and promote within ${days} days.`
    }
    out.push({
      productId: b.productId,
      productName: p?.name || b.productId,
      batchId: b.id,
      qtyRemaining: b.qtyRemaining,
      daysToExpiry: days,
      avgDailyUnits: avg,
      expectedSalesBeforeExpiry: expected,
      excessUnits: excess,
      costAtRiskCents: cost,
      projected,
      advice,
    })
  }
  return out.sort((a, b) => b.costAtRiskCents - a.costAtRiskCents)
}

function moneyS(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

/** Waste trend: average daily waste cost over the trailing window. */
export function wasteVelocity(waste: WasteRecord[], days = 30): { avgDailyCents: number; totalCents: number; topProducts: { name: string; costCents: number }[] } {
  const start = new Date()
  start.setDate(start.getDate() - days)
  const startIso = start.toISOString().slice(0, 10)
  const inWin = waste.filter((w) => w.createdAt.slice(0, 10) >= startIso)
  const total = inWin.reduce((a, w) => a + w.costCents, 0)
  const byProduct: Record<string, number> = {}
  inWin.forEach((w) => { byProduct[w.productName] = (byProduct[w.productName] || 0) + w.costCents })
  const top = Object.entries(byProduct).map(([name, costCents]) => ({ productId: name, name, costCents })).sort((a, b) => b.costCents - a.costCents).slice(0, 5)
  return { avgDailyCents: total / days, totalCents: total, topProducts: top }
}

/** Slow-moving products: low or zero sales over the window. */
export function slowMovers(products: Product[], velocities: ProductVelocity[], windowDays = 14): Product[] {
  const vel = new Map(velocities.map((v) => [v.productId, v.avgDailyUnits]))
  return products
    .filter((p) => p.active && p.totalStock > 0 && (vel.get(p.id) || 0) <= 0.2)
    .sort((a, b) => (b.stockValueCents || 0) - (a.stockValueCents || 0))
}

type Velocity = ProductVelocity