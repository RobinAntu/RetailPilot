import { Product, PurchaseOrder, StockBatch } from '../types'
import { daysUntil, todayISO } from './date'

// ---------------------------------------------------------------------
// Reorder intelligence
//
// reorderPoint = avgDailySales * leadTimeDays + safetyStock
// targetStock   = reorderPoint + (avgDailySales * targetDays) (configurable)
// recommendationQty = targetStock - currentStock - incomingQty
// ---------------------------------------------------------------------

export interface ReorderRecommendation {
  productId: string
  productName: string
  barcode: string
  category: string
  currentStock: number
  avgDailySales: number
  leadTimeDays: number
  safetyStock: number
  targetStock: number
  reorderPoint: number
  incomingQty: number
  suggestedQty: number
  reason: string
  urgency: 'out_of_stock' | 'order_now' | 'watch'
}

export interface ReorderContext {
  avgDailySalesByProduct: Record<string, number> // over the forecast window (days)
  incomingByProduct: Record<string, number> // qty on submitted purchase orders
}

export function buildReorderRecommendations(
  products: Product[],
  context: ReorderContext,
  safetyStockDays: number,
): ReorderRecommendation[] {
  const out: ReorderRecommendation[] = []
  for (const p of products) {
    if (!p.active) continue
    const currentStock = p.totalStock || 0
    const avgDailySales = context.avgDailySalesByProduct[p.id] ?? 0
    const safetyStock = Math.round(avgDailySales * safetyStockDays)
    const leadTimeDays = Math.max(0, 0) // filled from supplier below when available
    const incomingQty = context.incomingByProduct[p.id] ?? 0

    // We attach lead time from the product's supplier at the page level,
    // but keep a conservative default of 2 days here.
    const reorderPoint = Math.round(avgDailySales * 2 + safetyStock)
    const targetStock = Math.max(reorderPoint + Math.round(avgDailySales * 2), p.targetStock || 0)
    const suggested = Math.max(0, targetStock - currentStock - incomingQty)

    let urgency: ReorderRecommendation['urgency'] = 'watch'
    let reason = ''
    if (currentStock <= 0) {
      urgency = 'out_of_stock'
      reason = 'Out of stock. Suggested reorder to target stock.'
    } else if (currentStock + incomingQty <= reorderPoint) {
      urgency = 'order_now'
      reason = `Stock ${currentStock} is at/below reorder point ${reorderPoint} (avg ${avgDailySales.toFixed(1)}/day + ${safetyStock} safety).`
    } else {
      // Watch: approaching reorder point
      const margin = currentStock + incomingQty - reorderPoint
      if (margin <= Math.ceil(avgDailySales * 1.5) + safetyStock && avgDailySales > 0) {
        urgency = 'watch'
        reason = `Stock ${currentStock} is approaching the reorder point. Monitor.`
      }
    }
    if (!urgency) continue

    out.push({
      productId: p.id,
      productName: p.name,
      barcode: p.barcode,
      category: p.category,
      currentStock,
      avgDailySales,
      leadTimeDays,
      safetyStock,
      targetStock,
      reorderPoint,
      incomingQty,
      suggestedQty: suggested,
      reason,
      urgency,
    })
  }
  // Sort: out of stock first, then order now (by urgency), then watch.
  const order = { out_of_stock: 0, order_now: 1, watch: 2 }
  return out.sort((a, b) => order[a.urgency] - order[b.urgency])
}

// ---------------------------------------------------------------------
// Expiry forecasting
// ---------------------------------------------------------------------
export interface ExpiryForecast {
  expiringQty: number
  daysToExpiry: number
  avgDailySales: number
  expectedSales: number
  excessUnits: number
  costAtRiskCents: number
  recommendation: 'promote' | 'markdown' | 'no_action'
  note: string
}

export function forecastExpiry(
  batch: StockBatch,
  avgDailySales: number,
): ExpiryForecast | null {
  if (!batch.expiryDate) return null
  const days = daysUntil(batch.expiryDate)
  if (days == null || days < 0) return null
  const expiringQty = batch.qtyRemaining
  const expectedSales = Math.floor(avgDailySales * days)
  const excessUnits = Math.max(0, expiringQty - expectedSales)
  const costAtRiskCents = excessUnits * batch.unitCostCents
  let recommendation: ExpiryForecast['recommendation'] = 'no_action'
  let note = 'Expected sales cover the expiring stock. No action needed.'
  if (excessUnits > 0 && days <= 7) {
    recommendation = 'promote'
    note = `Forecast ~${expectedSales} sales in ${days} days leaves ~${excessUnits} excess units (~${excessUnits * batch.unitCostCents / 100} at risk). Consider a promotion or markdown. This is an estimate, not a guarantee.`
  } else if (excessUnits > 0) {
    recommendation = 'markdown'
    note = `Forecast ${expectedSales} sales before expiry, leaving ~${excessUnits} excess units. Watch closely.`
  }
  return {
    expiringQty,
    daysToExpiry: days,
    avgDailySales,
    expectedSales,
    excessUnits,
    costAtRiskCents,
    recommendation,
    note,
  }
}

// Recompute product aggregate stats from batches + sale days
export function computeProductStats(
  product: Product,
  batches: StockBatch[],
  saleDays: { date: string; units: number; revenueCents: number; cogsCents: number }[],
): Product {
  const totalStock = batches.filter((b) => b.qtyRemaining > 0).reduce((s, b) => s + b.qtyRemaining, 0)
  const stockValueCents = batches.reduce((s, b) => s + b.qtyRemaining * b.unitCostCents, 0)
  return {
    ...product,
    totalStock,
    stockValueCents,
    salesHistory: saleDays,
  }
}

// Avg daily sales over a window of the last N days
export function avgDailySales(saleDays: { date: string; units: number }[], days: number): number {
  if (!saleDays || saleDays.length === 0) return 0
  const total = saleDays.reduce((s, d) => s + d.units, 0)
  return total / days
}