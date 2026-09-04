import { StockBatch } from '../types'

// ---------------------------------------------------------------------
// First-Expire-First-Out (FEFO) deduction
//
// Returns the updated batches (with qtyRemaining already reduced) along
// with the cost of goods sold (in cents) allocated per unit using each
// batch's unit cost. Never lets a batch go negative: any requested qty
// beyond available stock is refused (caller must check availability first).
// ---------------------------------------------------------------------
export interface FefoResult {
  batches: StockBatch[]
  cogsCents: number
  allocated: { batchId: string; qty: number; unitCostCents: number }[]
}

export function deductFEFO(
  batches: StockBatch[],
  requestedQty: number,
): FefoResult {
  if (requestedQty <= 0) {
    return { batches: [...batches], cogsCents: 0, allocated: [] }
  }
  // Valid, non-expired batches with remaining qty > 0, sorted by expiry date
  // ascending (null/untracked go last so tracked expiry is prioritised).
  const today = new Date()
  const usable = batches
    .filter((b) => b.qtyRemaining > 0 && b.expiryDate && new Date(b.expiryDate + 'T23:59:59') >= today)
    .sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : a.expiryDate! > b.expiryDate! ? 1 : 0))

  // Untracked / non-expiry batches (kept in original order) as fallback.
  const untracked = batches
    .filter((b) => b.qtyRemaining > 0 && !b.expiryDate)
    .sort((a, b) => (a.receivedDate < b.receivedDate ? -1 : 1))

  const pool = [...usable, ...untracked]
  let remaining = requestedQty
  const updated: StockBatch[] = batches.map((b) => ({ ...b }))
  const allocated: FefoResult['allocated'] = []
  let cogsCents = 0

  for (const b of pool) {
    if (remaining <= 0) break
    const take = Math.min(b.qtyRemaining, remaining)
    const batch = updated.find((u) => u.id === b.id)!
    batch.qtyRemaining -= take
    cogsCents += take * b.unitCostCents
    allocated.push({ batchId: b.id, qty: take, unitCostCents: b.unitCostCents })
    remaining -= take
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient available stock: requested ${requestedQty}, only ${requestedQty - remaining} available.`,
    )
  }
  return { batches: updated, cogsCents, allocated }
}

export function totalAvailable(batches: StockBatch[]): number {
  return batches
    .filter((b) => b.qtyRemaining > 0)
    .reduce((s, b) => s + b.qtyRemaining, 0)
}

// Nearest expiry among active batches
export function nearestExpiry(batches: StockBatch[]): string | null {
  const active = batches
    .filter((b) => b.qtyRemaining > 0 && b.expiryDate)
    .sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : 1))
  return active.length ? active[0].expiryDate! : null
}

// Stock value in cents = sum(qtyRemaining * unitCost)
export function batchStockValueCents(batches: StockBatch[]): number {
  return batches.reduce((s, b) => s + b.qtyRemaining * b.unitCostCents, 0)
}