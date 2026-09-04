// RetailPilot core-logic tests. Run via:  node scripts/run-logic-tests.mjs
import { deductFEFO, totalAvailable } from '../src/lib/inventory'
import { fromCents, toCents, addCents, mulCents } from '../src/lib/money'
import { money, centsFromDisplay } from '../src/lib/format'
import { checkDigit, generateEAN13, generateInternalCode, validateBarcode, normalizeBarcode } from '../src/lib/barcode'
import { buildReorderRecommendations, forecastExpiry } from '../src/lib/reorder'
import { forecastSeries, productVelocities, projectExpiryRisk } from '../src/lib/ai/forecast'
import { coerceISO, guessFields, buildImportedRows } from '../src/lib/connector'
import { addDaysISO, todayISO } from '../src/lib/date'

let pass = 0
let fail = 0
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log('PASS  ' + name) }
  catch (e: any) { fail++; console.log('FAIL  ' + name + '  →  ' + (e?.message || e)) }
}
function eq(a: any, b: any, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`) }
const D = (n: number) => addDaysISO(todayISO(), n)

// ---------- money: integer cents, no floats ----------
t('toCents/fromCents round-trip', () => { eq(toCents(12.5), 1250); eq(fromCents(1250), 12.5) })
t('money(12345) = $123.45', () => eq(money(12345), '$123.45'))
t('money(50) = $0.50', () => eq(money(50), '$0.50'))
t('centsFromDisplay("12.50") = 1250', () => eq(centsFromDisplay('12.50'), 1250))
t('addCents & mulCents are integer-safe', () => { eq(addCents(105, 95), 200); eq(mulCents(199, 3), 597) })

// ---------- inventory / FEFO ----------
const mkBatch = (id: string, qty: number, expiry: string | null, cost: number) => ({ id, qtyReceived: qty, qtyRemaining: qty, expiryDate: expiry, receivedDate: todayISO(), unitCostCents: cost, storeId: 's', productId: 'p', lotNumber: '', supplierId: '', createdAt: todayISO() })

t('totalAvailable sums remaining qty', () => {
  eq(totalAvailable([mkBatch('a', 3, D(10), 100), mkBatch('b', 20, D(40), 200)]), 23)
})

t('FEFO deducts earliest expiry first (batch a drained first)', () => {
  const r = deductFEFO([mkBatch('a', 3, D(5), 100), mkBatch('b', 20, D(40), 200)], 5)
  const byId: any = {}; r.batches.forEach((b) => (byId[b.id] = b))
  eq(byId['a'].qtyRemaining, 0)
  eq(byId['b'].qtyRemaining, 18)
  eq(r.cogsCents, 3 * 100 + 2 * 200)
})

t('FEFO never goes negative (throws when oversold)', () => {
  let threw = false
  try { deductFEFO([mkBatch('a', 2, D(5), 100)], 5) } catch { threw = true }
  if (!threw) throw new Error('expected failure when selling more than available')
})

t('FEFO ignores expired batches (sells only usable stock)', () => {
  const expired = mkBatch('old', 5, D(-1), 100) // expired yesterday
  const fresh = mkBatch('new', 3, D(20), 200)
  const r = deductFEFO([expired, fresh], 3)
  eq(r.batches[0].qtyRemaining, 5) // expired batch untouched
  eq(r.batches[1].qtyRemaining, 0)
})

t('FEFO handles null-expiry (untracked) batches', () => {
  const r = deductFEFO([mkBatch('a', 2, null, 100)], 1)
  eq(r.batches[0].qtyRemaining, 1)
})

// ---------- barcode ----------
t('EAN-13 check digit (590123412345 -> 7)', () => eq(checkDigit('590123412345'), 7))
t('generateEAN13 appends correct check digit', () => {
  const full = generateEAN13('590123412345')
  eq(full, '5901234123457')
  eq(validateBarcode(full), full)
})
t('validateBarcode accepts EAN-13 and rejects bad lengths', () => {
  if (validateBarcode('5901234123457') !== '5901234123457') throw new Error('valid EAN rejected')
  if (validateBarcode('123') !== null) throw new Error('short numeric code accepted')
})
t('normalizeBarcode promotes 12-digit UPC to EAN-13', () => {
  const upc = '012345678905'
  eq(normalizeBarcode(upc), '0' + upc)
})
t('internal code is accepted as non-numeric barcode', () => {
  const code = generateInternalCode(1)
  if (validateBarcode(code) !== code) throw new Error('internal code not accepted')
})

// ---------- reorder ----------
const prod = (id: string, stock: number, min: number, target: number, ads: number) => ({
  id, storeId: 's', name: id, barcode: 'x' + id, sku: '', category: 'Test', brand: '', supplierId: 's1',
  supplierName: 'Sup', unit: 'ea', costCents: 100, sellCents: 200, minStock: min, targetStock: target,
  totalStock: stock, stockValueCents: stock * 100, active: true, expiryTracking: 'optional' as const,
  unitSize: 1, packSize: 1, aisle: '', shelf: '', notes: '', createdAt: todayISO(), salesHistory: [],
  avgDailySales: ads,
})

t('reorder flags out of stock first', () => {
  const recs = buildReorderRecommendations([prod('p1', 0, 5, 20, 3)], { avgDailySalesByProduct: { p1: 3 }, incomingByProduct: {} }, 2)
  eq(recs[0].urgency, 'out_of_stock')
})
t('reorder computes reorder point with safety stock', () => {
  const recs = buildReorderRecommendations([prod('p2', 6, 5, 30, 4)], { avgDailySalesByProduct: { p2: 4 }, incomingByProduct: {} }, 3)
  eq(recs[0].urgency, 'order_now')
  if (recs[0].safetyStock !== 12) throw new Error('safety stock wrong: ' + recs[0].safetyStock)
})
t('incoming purchase orders reduce suggested qty', () => {
  const recs = buildReorderRecommendations([prod('p3', 2, 5, 30, 4)], { avgDailySalesByProduct: { p3: 4 }, incomingByProduct: { p3: 10 } }, 3)
  if (recs[0].suggestedQty !== Math.max(0, 30 - 2 - 10)) throw new Error('incoming not subtracted: ' + recs[0].suggestedQty)
})

// ---------- expiry forecast ----------
t('forecast flags excess units before expiry', () => {
  const batch = mkBatch('b1', 20, D(4), 500)
  const fc = forecastExpiry(batch, 3)!
  eq(Math.round(fc.excessUnits), 8) // 20 - floor(3*4)=12
  if (fc.costAtRiskCents !== 8 * 500) throw new Error('cost at risk wrong')
})
t('forecast returns null for expired batch', () => {
  const fc = forecastExpiry(mkBatch('b2', 5, D(-1), 100), 3)
  if (fc !== null) throw new Error('expected null for expired batch')
})


// ---------- AI forecasting engine ----------
t('AI forecastSeries returns requested number of future points', () => {
  const f = forecastSeries([{ date: '2025-01-01', value: 10 }, { date: '2025-01-02', value: 12 }], 7, 7)
  eq(f.length, 7)
  if (f.some((p) => Number.isNaN(p.value))) throw new Error('NaN in forecast')
})
t('AI productVelocities computes avg daily units', () => {
  const v = productVelocities([
    { id: 'x', status: 'completed', timestamp: D(0), totalCents: 0, grossProfitCents: 0, lines: [{ productId: 'p1', name: 'Milk', qty: 10, lineTotalCents: 0 }] } as any,
    { id: 'y', status: 'completed', timestamp: D(-1), totalCents: 0, grossProfitCents: 0, lines: [{ productId: 'p1', name: 'Milk', qty: 8, lineTotalCents: 0 }] } as any,
  ], 14)
  const p = v.find((x) => x.productId === 'p1')
  if (!p) throw new Error('no velocity for p1')
  if (p.recent !== 18) throw new Error('recent units wrong')
})
t('AI expiry projection is internally consistent', () => {
  const proj = projectExpiryRisk([mkBatch('b1', 20, D(4), 500)], [], [{ productId: 'p', name: 'M', avgDailyUnits: 3, recent: 0, days: 14 }])
  const p = proj[0]
  if (!p) throw new Error('no projection returned')
  const expected = Math.max(0, Math.floor(3 * p.daysToExpiry))
  if (p.excessUnits !== Math.max(0, 20 - expected)) throw new Error('excess mismatch')
  if (p.costAtRiskCents !== p.excessUnits * 500) throw new Error('cost at risk mismatch')
  if (p.excessUnits > 0 && p.projected !== 'excess') throw new Error('should flag excess within 7 days')
})

// ---------- sales connector ----------
t('coerceISO parses AU DD/MM/YYYY and ISO', () => {
  if (coerceISO('14/05/2026') !== '2026-05-14T00:00:00.000Z') throw new Error('AU date failed')
  if (coerceISO('2026-05-14') !== '2026-05-14T00:00:00.000Z') throw new Error('ISO date failed')
  if (coerceISO('') !== null) throw new Error('empty should be null')
})
t('guessFields detects barcode/qty columns', () => {
  const f = guessFields(['Sale Date', 'Barcode', 'Item Name', 'Qty', 'Amount'])
  if (f.barcode !== 'Barcode') throw new Error('barcode not mapped')
  if (f.qty !== 'Qty') throw new Error('qty not mapped')
  if (f.date !== 'Sale Date') throw new Error('date not mapped')
})
t('buildImportedRows matches by barcode and flags unknown', () => {
  const products = [{ id: 'p1', storeId: 's', name: 'Milk', barcode: 'bp1', costCents: 100, sellCents: 200, category: 'Dairy' }] as any
  const rows = [{ Barcode: 'bp1', Name: 'Milk', Qty: '2', Amount: '4.00', Date: '14/05/2026' }]
  const r = buildImportedRows(rows, { barcode: 'Barcode', name: 'Name', qty: 'Qty', price: 'Amount', date: 'Date' }, products)
  if (r.rows.length !== 1) throw new Error('should resolve one row')
  if (r.rows[0].qty !== 2) throw new Error('qty wrong')
  if (r.rows[0].unitPriceCents !== 400) throw new Error('price wrong: ' + r.rows[0].unitPriceCents)
  const unknown = buildImportedRows([{ Barcode: 'zzz', Name: 'Nope', Qty: '1', Date: '' }], { barcode: 'Barcode', name: 'Name', qty: 'Qty' }, products)
  if (unknown.unresolved.length !== 1) throw new Error('unknown should be flagged')
  if (unknown.rows.length !== 0) throw new Error('no rows should import')
})
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)