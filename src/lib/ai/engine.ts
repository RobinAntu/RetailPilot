// =====================================================================
// RetailPilot AI — Assistant engine
// A deterministic, data-driven copilot. It reads the store's real records
// (sales, inventory, expiry, waste, orders) and answers questions + surfaces
// actionable insights. No external API or key required — it runs offline.
// =====================================================================
import type { Product, Sale, StockBatch, StoreSettings, Supplier, WasteRecord, PurchaseOrder } from '../../types'
import { todayISO, daysAgoISO, lastNDates, daysUntil } from '../date'
import { money, num, pct } from '../format'
import {
  productVelocities, projectExpiryRisk, wasteVelocity, slowMovers, forecastSeries,
  type ProductVelocity,
} from './forecast'

export interface AIData {
  products: Product[]
  batches: StockBatch[]
  sales: Sale[]
  waste: WasteRecord[]
  orders: PurchaseOrder[]
  suppliers: Supplier[]
  settings: StoreSettings | null
}

export interface Insight {
  title: string
  detail: string
  tone: 'danger' | 'warning' | 'info' | 'success'
  to: string
}

interface Snapshot {
  today: string
  salesToday: number
  revenueTodayCents: number
  profitTodayCents: number
  revenue7Cents: number
  profit7Cents: number
  marginPct: number
  sales7Count: number
  stockValueCents: number
  activeCount: number
  outOfStock: number
  lowStock: number
  expiringQty: number
  expiringValueCents: number
  expiredQty: number
  wasteTodayCents: number
  waste30Cents: number
  expiryProjects: ReturnType<typeof projectExpiryRisk>
  slow: Product[]
}

function snapshot(d: AIData): Snapshot {
  const today = todayISO()
  const valid = d.sales.filter((s) => s.status !== 'voided')
  const todaySales = valid.filter((s) => s.timestamp.slice(0, 10) === today)
  const revenueToday = todaySales.reduce((a, s) => a + s.totalCents, 0)
  const profitToday = todaySales.reduce((a, s) => a + s.grossProfitCents, 0)

  const week = valid.filter((s) => s.timestamp.slice(0, 10) >= daysAgoISO(7))
  const revenue7 = week.reduce((a, s) => a + s.totalCents, 0)
  const profit7 = week.reduce((a, s) => a + s.grossProfitCents, 0)

  const active = d.products.filter((p) => p.active)
  const lowStock = active.filter((p) => p.totalStock > 0 && p.totalStock <= (p.minStock || 0)).length
  const outOfStock = active.filter((p) => p.totalStock <= 0).length
  const stockValueCents = active.reduce((a, p) => a + (p.stockValueCents || 0), 0)

  const todayWaste = d.waste.filter((w) => w.createdAt.slice(0, 10) === today)
  const velocities = productVelocities(d.sales, 14)
  const expiryProjects = projectExpiryRisk(d.batches, d.products, velocities)
  const atRisk = expiryProjects.filter((r) => r.excessUnits > 0)
  const expiringQty = atRisk.reduce((a, r) => a + r.qtyRemaining, 0)
  const expiringValue = expiryProjects.reduce((a, r) => a + r.costAtRiskCents, 0)
  const expiredQty = d.batches.filter((b) => {
    const du = daysUntil(b.expiryDate)
    return b.expiryDate && du != null && du < 0 && b.qtyRemaining > 0
  }).reduce((a, b) => a + b.qtyRemaining, 0)

  return {
    today,
    salesToday: todaySales.length,
    revenueTodayCents: revenueToday,
    profitTodayCents: profitToday,
    revenue7Cents: revenue7,
    profit7Cents: profit7,
    marginPct: revenue7 > 0 ? (profit7 / revenue7) * 100 : 0,
    sales7Count: week.length,
    stockValueCents,
    activeCount: active.length,
    outOfStock,
    lowStock,
    expiringQty,
    expiringValueCents: expiringValue,
    expiredQty,
    wasteTodayCents: todayWaste.reduce((a, w) => a + w.costCents, 0),
    waste30Cents: wasteVelocity(d.waste, 30).totalCents,
    expiryProjects: expiryProjects,
    slow: slowMovers(d.products, velocities, 14),
  }
}

/** Convert a user question into an answer drawn from real data. */
export function chatAnswer(question: string, data: AIData): { text: string; chips: string[] } {
  const q = question.toLowerCase()
  const s = snapshot(data)

  if (/^(hi|hello|hey|help|what can you do|who are you)\b/.test(q)) {
    return {
      text: `I'm RetailPilot Copilot — your store's assistant. I read your live data to help you. Try:\n• “How are things today?”\n• “What should I reorder?”\n• “Any expiry risk?”\n• “What is wasting money?”\n• “Forecast next week's sales.”`,
      chips: ['How are things today?', 'What should I reorder?', 'Any expiry risk?', 'What is wasting money?'],
    }
  }

  if (/(how are things|overview|summary|health|status|today)/.test(q) && !/(reorder|expiry|waste|forecast|focus)/.test(q)) {
    return {
      text: `Here's today, from your live data:\n• Sales: ${money(s.revenueTodayCents)} across ${num(s.salesToday)} sales (7-day: ${money(s.revenue7Cents)})\n• Gross profit today: ${money(s.profitTodayCents)} · 7-day margin ${pct(s.marginPct)}\n• Stock value: ${money(s.stockValueCents)}\n• Out of stock: ${num(s.outOfStock)} · Low stock: ${num(s.lowStock)}\n• Expiry at risk: ${num(s.expiringQty)} units (${money(s.expiringValueCents)})\n• Waste today: ${money(s.wasteTodayCents)}`,
      chips: ['What should I focus on?', 'What should I reorder?', 'Any expiry risk?'],
    }
  }

  if (/(focus|priority|today.*should|should.*(do|focus|look)|what.*important|action)/.test(q)) {
    const lines: string[] = []
    if (s.expiredQty > 0) lines.push(`⚠️ ${num(s.expiredQty)} units are already expired — review the Expiry Centre.`)
    if (s.expiringValueCents > 0) lines.push(`📉 ${money(s.expiringValueCents)} of stock may not sell before expiry — promote the flagged items.`)
    if (s.outOfStock > 0) lines.push(`🚫 ${num(s.outOfStock)} products are out of stock — check the Reorder Centre.`)
    if (s.lowStock > 0) lines.push(`📦 ${num(s.lowStock)} products are low — plan a reorder.`)
    if (s.waste30Cents > 5000) lines.push(`🗑️ Waste cost ${money(s.waste30Cents)} over 30 days — investigate top items.`)
    if (lines.length === 0) lines.push('Nothing urgent right now. Stock levels look healthy — keep up the cadence.')
    return { text: lines.join('\n'), chips: ['Tell me about expiry risk', 'Suggest a reorder'] }
  }

  if (/(expiry|expir|expired|expiring|best.?before|sell.?by|markdown)/.test(q)) {
    const atRisk = s.expiryProjects.filter((r) => r.excessUnits > 0).slice(0, 5)
    if (atRisk.length === 0) {
      return { text: `On current sales pace, nothing expiring is projected to exceed its demand. Estimated at-risk value: ${money(s.expiringValueCents)}.`, chips: ['Forecast next week'] }
    }
    const bullets = atRisk.map((r) => `• ${r.productName} — ${r.excessUnits} units (~${money(r.costAtRiskCents)}) expire in ${r.daysToExpiry}d. ${r.advice}`).join('\n')
    return {
      text: `I checked ${num(s.expiryProjects.length)} batches with expiry dates. Highest risk:\n${bullets}\n\nForecasts are estimates, not guarantees.`,
      chips: ['What should I reorder?', 'How are things today?'],
    }
  }

  if (/(reorder|order|restock|buy|purchase|supplier)/.test(q)) {
    const act = data.products.filter((p) => p.active && p.totalStock <= (p.minStock || 0))
    if (act.length === 0) return { text: 'No product is currently at or below its reorder point — stock is above minimums.', chips: ['Any expiry risk?', 'How are things today?'] }
    const bySupplier: Record<string, number> = {}
    act.forEach((p) => { const s2 = data.suppliers.find((x) => x.id === p.supplierId); const key = s2?.name || 'Unknown supplier'; bySupplier[key] = (bySupplier[key] || 0) + 1 })
    const sup = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 3)
    const list = act.slice(0, 8).map((p) => `• ${p.name} — ${p.totalStock} on hand, min ${p.minStock}`).join('\n')
    return {
      text: `${num(act.length)} items are at or below their reorder point:\n${list}\n\nSuggested suppliers:\n${sup.map(([k, n]) => `• ${k} (${n} items)`).join('\n')}\n\nOpen the Reorder Centre to build a purchase order.`,
      chips: ['Show slow movers', 'Any expiry risk?'],
    }
  }

  if (/(waste|loss|shrink|throw|damag|spoil)/.test(q)) {
    const wv = wasteVelocity(data.waste, 30)
    const top = wv.topProducts.slice(0, 5).map((x) => `• ${x.name} — ${money(x.costCents)}`).join('\n')
    return {
      text: `Waste in the last 30 days: ${money(wv.totalCents)} (≈${money(wv.avgDailyCents)}/day).\nTop waste items:\n${top || '• No waste recorded yet.'}\n\nTightening receiving and expiry checks typically cuts the biggest share.`,
      chips: ['Show slow movers', 'Any expiry risk?'],
    }
  }

  if (/(slow|dead|not sell|no sales|stagnant|idle|dormant)/.test(q)) {
    const slow = s.slow.slice(0, 8)
    if (slow.length === 0) return { text: 'No slow-moving products with stock on hand — everything is turning over.', chips: ['What should I focus on?'] }
    const value = slow.reduce((a, p) => a + (p.stockValueCents || 0), 0)
    return {
      text: `${num(slow.length)} product${slow.length === 1 ? '' : 's'} have near-zero sales over 14 days while holding ${money(value)}:\n${slow.map((p) => `• ${p.name} — ${p.totalStock} units (${money(p.stockValueCents || 0)})`).join('\n')}\n\nConsider promotions or supplier returns.`,
      chips: ['How are things today?', 'Suggest a reorder'],
    }
  }

  if (/(top|best|most|popular|star|bestseller)/.test(q)) {
    const byUnits: Record<string, { name: string; units: number; rev: number }> = {}
    data.sales.filter((s2) => s2.status !== 'voided' && s2.timestamp.slice(0, 10) >= daysAgoISO(30)).forEach((s2) => s2.lines.forEach((l) => {
      const e = (byUnits[l.productId] ||= { name: l.name, units: 0, rev: 0 })
      e.units += l.qty
      e.rev += l.lineTotalCents
    }))
    const top = Object.values(byUnits).sort((a, b) => b.units - a.units).slice(0, 5)
    return {
      text: `Top sellers (last 30 days):\n${top.map((x) => `• ${x.name} — ${x.units} units, ${money(x.rev)}`).join('\n') || '• No sales yet this period.'}`,
      chips: ['How are things today?', 'Any expiry risk?'],
    }
  }

  if (/(forecast|predict|project|next week|expect)/.test(q)) {
    const byDay: Record<string, number> = {}
    data.sales.filter((s2) => s2.status !== 'voided').forEach((s2) => { const d = s2.timestamp.slice(0, 10); byDay[d] = (byDay[d] || 0) + s2.lines.reduce((a, l) => a + l.qty, 0) })
    const hist = lastNDates(30).map((d) => ({ date: d, value: byDay[d] || 0 }))
    const f = forecastSeries(hist, 7)
    const total = f.reduce((a, p) => a + p.value, 0)
    const peak = [...f].sort((a, b) => b.value - a.value)[0]
    return {
      text: `Based on your last 30 days, I forecast ~${num(total)} units of next week (≈${num(Math.round(total / 7))}/day).\nHighest forecast day: ${peak?.date} (~${peak?.value} units).\nThis is an estimate from historical volume, not a guarantee.`,
      chips: ['What should I reorder?', 'Any expiry risk?'],
    }
  }

  if (/(stock|inventory|value|holding)/.test(q)) {
    return {
      text: `Inventory snapshot:\n• ${num(s.activeCount)} active products worth ${money(s.stockValueCents)}\n• Out of stock: ${num(s.outOfStock)} · Low stock: ${num(s.lowStock)}\n• Expiring soon: ${num(s.expiringQty)} units (${money(s.expiringValueCents)})\n\nStock value reconciles exactly with your batches and product cards.`,
      chips: ['What should I reorder?', 'Show slow movers'],
    }
  }

  return {
    text: "I couldn't match that to a metric I can compute from your data. Try asking about: how things are today, expiry risk, reorder, waste, slow movers, top sellers, or a forecast.",
    chips: ['How are things today?', 'Any expiry risk?', 'Forecast next week'],
  }
}

/** Proactive insights for the Dashboard. */
export function buildInsights(data: AIData): Insight[] {
  const s = snapshot(data)
  const out: Insight[] = []
  if (s.expiredQty > 0) out.push({ title: `${num(s.expiredQty)} units past expiry`, detail: 'Still on the shelf — record as waste or review the batch.', tone: 'danger', to: '/expiry' })
  const topRisk = s.expiryProjects.filter((r) => r.excessUnits > 0).slice(0, 1)[0]
  if (topRisk) out.push({ title: `${money(s.expiringValueCents)} expiry risk`, detail: `${topRisk.productName} may not sell through before expiry. Promote now.`, tone: 'warning', to: '/expiry' })
  if (s.outOfStock > 0) out.push({ title: `${num(s.outOfStock)} products out of stock`, detail: 'Replenish the biggest sellers first to protect revenue.', tone: 'danger', to: '/reorder' })
  if (s.lowStock > 0) out.push({ title: `${num(s.lowStock)} products low on stock`, detail: 'Several items sit at or below minimum — build a purchase order.', tone: 'warning', to: '/reorder' })
  const wv = wasteVelocity(data.waste, 30)
  if (wv.totalCents > 5000) out.push({ title: `${money(wv.totalCents)} waste in 30 days`, detail: `Top: ${wv.topProducts[0]?.name || '—'}. Review receiving and expiry.`, tone: 'warning', to: '/waste' })
  const slowTop = s.slow[0]
  if (slowTop) out.push({ title: `Slow mover: ${slowTop.name}`, detail: `${slowTop.totalStock} units held with little recent sales — consider a promotion or return.`, tone: 'info', to: '/reports' })
  return out.slice(0, 4)
}