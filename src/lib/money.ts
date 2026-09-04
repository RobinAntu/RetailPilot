// Integer-cents helpers — avoid floating-point money errors.
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function centsFromString(str: string): number {
  if (str === '' || str == null) return 0
  const n = parseFloat(str)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

export function addCents(...cents: number[]): number {
  return cents.reduce((a, b) => a + (Math.round(b) || 0), 0)
}

export function mulCents(cents: number, qty: number): number {
  return Math.round(cents * qty)
}

// Cost of a line: unitPrice*qty - discount
export function lineTotalCents(unitPriceCents: number, qty: number, discountCents: number): number {
  return Math.max(0, Math.round(unitPriceCents * qty) - discountCents)
}