import {
  AppNotification,
  AuditLog,
  HeldSale,
  PaymentMethod,
  Product,
  PurchaseOrder,
  RPUser,
  Role,
  Sale,
  StockBatch,
  Supplier,
  WasteReason,
  WasteRecord,
} from '../../types'
import { deductFEFO, totalAvailable } from '../inventory'
import { toISO, toISODate } from '../date'
import type {
  Backend,
  AuthSession,
  CreateSaleInput,
  SignupInput,
  ReceivedOrderInput,
  RestoreRequest,
  BackupBundle,
  ImportSaleLine,
  ImportSummary,
} from './types'

// =====================================================================
// LocalBackend — a transactional in-browser implementation backed by
// localStorage. Used for development, offline demos and end-to-end tests
// without a Firebase project. The FirestoreBackend implements the same
// interface for production; business rules are identical.
// =====================================================================

const KEY = 'retailpilot:db:'
const AUTH_KEY = 'retailpilot:auth'
const SESSION_KEY = 'retailpilot:session'

interface AuthEntry {
  uid: string
  email: string
  password: string
  name: string
  role: string
  storeId: string
  storeName: string
  deactivated?: boolean
}

const PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  manager: [
    'pos', 'scan', 'receive', 'expiry', 'reorder', 'orders', 'suppliers',
    'waste', 'reports', 'inventory_view', 'inventory_add', 'inventory_edit',
    'adjust', 'import', 'export', 'discount', 'void', 'markdown', 'barcode',
  ],
  staff: ['pos', 'scan', 'receive_enter', 'expiry_check', 'waste_record', 'inventory_view'],
}

function uid(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}
const nowISO = () => toISO(new Date())

function loadList<T>(storeId: string, col: string): T[] {
  return safeParse<T[]>(localStorage.getItem(`retailpilot:db:${storeId}:${col}`), [])
}
function saveList(storeId: string, col: string, data: unknown[]) {
  localStorage.setItem(`retailpilot:db:${storeId}:${col}`, JSON.stringify(data))
}
function loadObj<T>(storeId: string, col: string, fallback: T): T {
  return safeParse<T>(localStorage.getItem(`retailpilot:db:${storeId}:${col}`), fallback)
}
function saveObj(storeId: string, col: string, data: unknown) {
  localStorage.setItem(`retailpilot:db:${storeId}:${col}`, JSON.stringify(data))
}
function loadAuth(): Record<string, AuthEntry> {
  return safeParse<Record<string, AuthEntry>>(localStorage.getItem(AUTH_KEY), {})
}
function saveAuth(entries: Record<string, AuthEntry>) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(entries))
}

const DEFAULT_SETTINGS = (storeId: string): any => ({
  storeId, name: 'My Store', address: '', phone: '', abn: '',
  currency: 'AUD', currencySymbol: '$', locale: 'en-AU', timezone: 'Australia/Sydney',
  defaultMinimumStock: 5, safetyStockDays: 2, expiryWarningDays: 7,
  taxRatePercent: 10, receiptFooter: 'Thank you for shopping with us!',
  allowStaffDiscount: false, allowStaffVoid: false,
})

export class LocalBackend implements Backend {
  readonly name = 'local' as const
  private session: AuthSession | null = null
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true
  private authSubs = new Set<(s: AuthSession | null) => void>()
  private onlineSubs = new Set<(online: boolean) => void>()

  constructor() {
    const raw = localStorage.getItem(SESSION_KEY)
    this.session = raw ? safeParse<AuthSession | null>(raw, null) : null
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online = true; this.onlineSubs.forEach((cb) => cb(true)) })
      window.addEventListener('offline', () => { this.online = false; this.onlineSubs.forEach((cb) => cb(false)) })
    }
  }

  // ---------------- auth ----------------
  private signSession(s: AuthSession | null) {
    this.session = s
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
    this.authSubs.forEach((cb) => cb(s))
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    await sleep(150)
    const auth = loadAuth()
    const entry = auth[email.toLowerCase().trim()]
    if (!entry || entry.password !== password) throw new Error('Invalid email or password.')
    if (entry.deactivated) throw new Error('This account has been deactivated.')
    const s: AuthSession = { uid: entry.uid, email: entry.email, name: entry.name, role: entry.role, storeId: entry.storeId }
    this.signSession(s)
    return s
  }

  async signUp(input: SignupInput): Promise<AuthSession> {
    const auth = loadAuth()
    const email = input.email.toLowerCase().trim()
    if (auth[email]) throw new Error('An account with this email already exists.')
    const storeId = 'store_' + Math.random().toString(36).slice(2, 10)
    const uidVal = 'u_' + Math.random().toString(36).slice(2, 10)
    auth[email] = { uid: uidVal, email, password: input.password, name: input.name, role: input.role, storeId, storeName: input.storeName }
    saveAuth(auth)
    saveObj(storeId, 'settings', DEFAULT_SETTINGS(storeId))
    saveObj(storeId, 'counters', { saleNumber: 0, orderNumber: 0 })
    const user: RPUser = { id: uidVal, storeId, uid: uidVal, email, name: input.name, role: input.role as any, active: true, createdAt: Date.now() }
    saveList(storeId, 'users', [user])
    const s: AuthSession = { uid: uidVal, email, name: input.name, role: input.role, storeId }
    this.signSession(s)
    return s
  }

  async signOut(): Promise<void> { this.signSession(null) }

  onAuthChanged(cb: (s: AuthSession | null) => void): () => void {
    this.authSubs.add(cb)
    cb(this.session)
    return () => this.authSubs.delete(cb)
  }

  async sendPasswordReset(email: string): Promise<void> {
    const auth = loadAuth()
    if (!auth[email.toLowerCase().trim()]) throw new Error('No account found for that email.')
    // Production delegates to Firebase Auth email links.
  }

  currentSession(): AuthSession | null { return this.session }
  isOwner(): boolean { return this.session?.role === 'owner' }

  can(role: string, action: string): boolean {
    const list = PERMISSIONS[role] || []
    if (list.includes('*')) return true
    return list.includes(action)
  }

  // ---------------- settings ----------------
  async getSettings(storeId: string): Promise<any> {
    const s = loadObj<any>(storeId, 'settings', null)
    if (!s) { saveObj(storeId, 'settings', DEFAULT_SETTINGS(storeId)); return DEFAULT_SETTINGS(storeId) }
    return s
  }
  async saveSettings(s: any): Promise<void> {
    const existing = await this.getSettings(s.storeId)
    saveObj(s.storeId, 'settings', { ...existing, ...s })
  }

  // ---------------- products ----------------
  async getProducts(storeId: string): Promise<Product[]> { return loadList(storeId, 'products') }
  async getProduct(storeId: string, productId: string): Promise<Product | null> {
    return (await this.getProducts(storeId)).find((p) => p.id === productId) || null
  }
  async saveProduct(p: Product): Promise<void> {
    const list = await this.getProducts(p.storeId)
    const i = list.findIndex((x) => x.id === p.id)
    if (i >= 0) list[i] = p
    else list.push(p)
    saveList(p.storeId, 'products', list)
  }
  async upsertManyProducts(storeId: string, products: Product[]): Promise<number> {
    const list = await this.getProducts(storeId)
    let added = 0
    for (const p of products) {
      const i = list.findIndex((x) => x.id === p.id)
      if (i >= 0) list[i] = p
      else { list.push(p); added++ }
    }
    saveList(storeId, 'products', list)
    return added
  }
  async deleteProduct(storeId: string, productId: string, by: { uid: string; name: string }): Promise<void> {
    const list = await this.getProducts(storeId)
    saveList(storeId, 'products', list.filter((p) => p.id !== productId))
    // Remove its batches so stock no longer dangles.
    const batches = await this.getBatches(storeId, productId)
    if (batches.length) saveList(storeId, 'batches', loadList(storeId, 'batches').filter((b: any) => b.productId !== productId))
    await this.createAuditLog(storeId, { uid: by.uid, userName: by.name, action: 'product.delete', entityType: 'product', entityId: productId, beforeState: { productId } })
  }

  // ---------------- batches ----------------
  async getBatches(storeId: string, productId?: string): Promise<StockBatch[]> {
    const all = loadList<StockBatch>(storeId, 'batches')
    return productId ? all.filter((b) => b.productId === productId) : all
  }
  async addBatches(storeId: string, batches: StockBatch[]): Promise<void> {
    const all = loadList<StockBatch>(storeId, 'batches')
    all.push(...batches)
    saveList(storeId, 'batches', all)
  }

  // ---------------- suppliers ----------------
  async getSuppliers(storeId: string): Promise<Supplier[]> { return loadList<Supplier>(storeId, 'suppliers') }
  async saveSupplier(s: Supplier): Promise<void> {
    const list = await this.getSuppliers(s.storeId)
    const i = list.findIndex((x) => x.id === s.id)
    if (i >= 0) list[i] = s
    else list.push(s)
    saveList(s.storeId, 'suppliers', list)
  }
  async deleteSupplier(storeId: string, id: string, by: { uid: string; name: string }): Promise<void> {
    const list = await this.getSuppliers(storeId)
    saveList(storeId, 'suppliers', list.filter((x) => x.id !== id))
    // Clear supplier references on products so they don't dangle.
    const products = await this.getProducts(storeId)
    let changed = false
    const next = products.map((p) => {
      if (p.supplierId === id) { changed = true; return { ...p, supplierId: '', supplierName: undefined } }
      return p
    })
    if (changed) saveList(storeId, 'products', next)
    await this.createAuditLog(storeId, { uid: by.uid, userName: by.name, action: 'supplier.delete', entityType: 'supplier', entityId: id, beforeState: { id } })
  }

  // ---------------- sales ----------------
  async getSales(storeId: string): Promise<Sale[]> { return loadList<Sale>(storeId, 'sales') }
  async getSaleNumber(storeId: string): Promise<number> {
    const c = loadObj<{ saleNumber: number }>(storeId, 'counters', { saleNumber: 0 })
    return c.saleNumber || 0
  }

  async createSale(storeId: string, input: CreateSaleInput): Promise<{ sale: Sale; cogsCents: number; grossProfitCents: number }> {
    const batches = loadList<StockBatch>(storeId, 'batches')
    const products = loadList<Product>(storeId, 'products')
    const counters = loadObj<{ saleNumber: number; orderNumber: number }>(storeId, 'counters', { saleNumber: 0, orderNumber: 0 })
    const now = nowISO()
    const dayKey = toISODate(new Date())

    // 1. Validate availability.
    for (const line of input.lines) {
      const avail = totalAvailable(batches.filter((b) => b.productId === line.productId))
      if (line.qty > avail) {
        throw new Error(`Insufficient stock for "${line.name}". Available: ${avail}, requested: ${line.qty}.`)
      }
    }

    // 2. Deduct via FEFO -> COGS.
    let cogsCents = 0
    const newBatches = batches.map((b) => ({ ...b }))
    for (const line of input.lines) {
      const lineBatches = newBatches.filter((b) => b.productId === line.productId)
      const res = deductFEFO(lineBatches, line.qty)
      for (const nb of res.batches) {
        const i = newBatches.findIndex((x) => x.id === nb.id)
        if (i >= 0) newBatches[i] = nb
      }
      cogsCents += res.cogsCents
    }

    const saleNumber = counters.saleNumber + 1
    const sale: Sale = {
      id: uid(), storeId, saleNumber, status: 'completed',
      timestamp: now, createdBy: input.createdBy, createdByName: input.createdByName,
      lines: input.lines.map((l) => ({ ...l, cogsCents: 0 })),
      subtotalCents: input.subtotalCents, discountCents: input.discountCents,
      taxCents: input.taxCents, totalCents: input.totalCents,
      cogsCents, grossProfitCents: input.totalCents - cogsCents,
      paymentMethod: input.paymentMethod,
      cashReceivedCents: input.cashReceivedCents, changeCents: input.changeCents,
    }
    // Allocate COGS per line by value share for reporting.
    const netSubtotal = Math.max(1, sale.subtotalCents)
    sale.lines = sale.lines.map((l) => {
      const share = (l.lineTotalCents) / netSubtotal
      return { ...l, cogsCents: Math.round(cogsCents * share) }
    })

    const sales = loadList<Sale>(storeId, 'sales')
    sales.push(sale)
    saveList(storeId, 'sales', sales)
    saveList(storeId, 'batches', newBatches)
    saveObj(storeId, 'counters', { saleNumber, orderNumber: counters.orderNumber })

    // Update products and fire notifications.
    const newProducts = products.map((p) => ({ ...p }))
    const notifs: AppNotification[] = []
    for (const line of input.lines) {
      const p = newProducts.find((x) => x.id === line.productId)
      if (!p) continue
      p.totalStock = Math.max(0, (p.totalStock || 0) - line.qty)
      const salesToday = p.salesHistory || []
      const rec = salesToday.find((d) => d.date === dayKey)
      const lineCogs = sale.lines.find((l) => l.productId === line.productId)?.cogsCents || 0
      if (rec) {
        rec.units += line.qty
        rec.revenueCents += line.lineTotalCents
        rec.cogsCents += lineCogs
      } else {
        salesToday.push({ date: dayKey, units: line.qty, revenueCents: line.lineTotalCents, cogsCents: lineCogs })
      }
      p.salesHistory = salesToday
      if (p.totalStock <= 0) {
        notifs.push(mknot(storeId, 'out_of_stock', 'Out of stock', `"${p.name}" is now out of stock.`, '/inventory', p.id))
      } else if (p.totalStock <= (p.minStock ?? 0)) {
        notifs.push(mknot(storeId, 'low_stock', 'Low stock', `"${p.name}" is at ${p.totalStock} units (min ${p.minStock}).`, '/inventory', p.id))
      }
    }
    saveList(storeId, 'products', newProducts)
    if (notifs.length) {
      const existing = loadList<AppNotification>(storeId, 'notifications')
      saveList(storeId, 'notifications', [...notifs, ...existing])
    }

    await this.createAuditLog(storeId, { uid: input.createdBy, userName: input.createdByName, action: 'sale.complete', entityType: 'sale', entityId: sale.id, afterState: { totalCents: sale.totalCents, paymentMethod: sale.paymentMethod } })
    return { sale, cogsCents, grossProfitCents: sale.grossProfitCents }
  }

  async importSales(storeId: string, lines: ImportSaleLine[], byUser: { uid: string; name: string }): Promise<ImportSummary> {
    const products = loadList<Product>(storeId, 'products')
    const sales = loadList<Sale>(storeId, 'sales')
    const counters = loadObj<{ saleNumber: number; orderNumber: number }>(storeId, 'counters', { saleNumber: 0, orderNumber: 0 })
    const byBarcode = new Map<string, Product>()
    for (const p of products) if (p.barcode) byBarcode.set(p.barcode.toLowerCase(), p)
    const byName = new Map<string, Product>()
    for (const p of products) byName.set(p.name.toLowerCase(), p)

    const newProducts = products.map((p) => ({ ...p }))
    const importedNames: string[] = []
    const skippedNames: string[] = []
    let saleNumber = counters.saleNumber
    let totalRevenueCents = 0
    let imported = 0

    for (const line of lines) {
      const product = byBarcode.get(line.barcode.toLowerCase()) ?? byName.get(line.name.toLowerCase())
      if (!product) { skippedNames.push(line.name || line.barcode); continue }
      const unitPriceCents = line.unitPriceCents ?? product.sellCents
      const qty = Math.max(0, line.qty)
      if (qty === 0) continue
      saleNumber += 1
      const lineTotalCents = Math.round(unitPriceCents * qty)
      const cogsCents = Math.round((product.costCents || 0) * qty)
      const sale: Sale = {
        id: uid(), storeId, saleNumber, status: 'completed',
        timestamp: line.timestamp, createdBy: byUser.uid, createdByName: byUser.name,
        lines: [{ productId: product.id, name: product.name, barcode: product.barcode, qty, unitPriceCents, discountCents: 0, lineTotalCents, cogsCents }],
        subtotalCents: lineTotalCents, discountCents: 0, taxCents: 0, totalCents: lineTotalCents,
        cogsCents, grossProfitCents: lineTotalCents - cogsCents,
        paymentMethod: (['card', 'cash', 'eftpos', 'other'] as PaymentMethod[]).includes(line.payment.toLowerCase() as PaymentMethod) ? (line.payment.toLowerCase() as PaymentMethod) : 'card',
        cashReceivedCents: null, changeCents: null,
      }
      sales.push(sale)
      totalRevenueCents += lineTotalCents
      imported += 1
      if (!importedNames.includes(product.name)) importedNames.push(product.name)

      // Keep per-product sales history aligned (drives today's figures + trends).
      const p = newProducts.find((x) => x.id === product.id)
      if (p) {
        const dayKey = line.timestamp.slice(0, 10)
        const hist = p.salesHistory || []
        const rec = hist.find((d) => d.date === dayKey)
        if (rec) { rec.units += qty; rec.revenueCents += lineTotalCents; rec.cogsCents += cogsCents }
        else hist.push({ date: dayKey, units: qty, revenueCents: lineTotalCents, cogsCents })
        p.salesHistory = hist
      }
    }

    saveList(storeId, 'sales', sales)
    saveList(storeId, 'products', newProducts)
    saveObj(storeId, 'counters', { saleNumber, orderNumber: counters.orderNumber })
    if (imported > 0) {
      await this.createAuditLog(storeId, { uid: byUser.uid, userName: byUser.name, action: 'sale.import', entityType: 'sale', entityId: `${storeId}:import`, afterState: { imported, totalRevenueCents } })
    }
    return { imported, skipped: lines.length - imported, totalRevenueCents, importedNames, skippedNames }
  }

  async voidSale(storeId: string, saleId: string, byUser: { uid: string; name: string }, reason: string): Promise<void> {
    const sales = await this.getSales(storeId)
    const sale = sales.find((s) => s.id === saleId)
    if (!sale) throw new Error('Sale not found')
    if (sale.status === 'voided') throw new Error('Sale already voided')
    sale.status = 'voided'
    sale.voidedBy = byUser.uid
    sale.voidedAt = nowISO()
    saveList(storeId, 'sales', sales)
    await this.createAuditLog(storeId, { uid: byUser.uid, userName: byUser.name, action: 'sale.void', entityType: 'sale', entityId: sale.id, reason })
  }

  // ---------------- waste ----------------
  async getWaste(storeId: string): Promise<WasteRecord[]> { return loadList<WasteRecord>(storeId, 'waste') }
  async recordWaste(
    storeId: string,
    input: { product: Product; batchId: string; qty: number; reason: WasteReason; notes: string; user: { uid: string; name: string } },
  ): Promise<WasteRecord> {
    const batches = await this.getBatches(storeId)
    const batch = batches.find((b) => b.id === input.batchId)
    if (!batch) throw new Error('Batch not found')
    if (input.qty <= 0 || input.qty > batch.qtyRemaining) throw new Error(`Invalid quantity. Batch has ${batch.qtyRemaining} remaining.`)
    batch.qtyRemaining -= input.qty
    saveList(storeId, 'batches', batches)
    const rec: WasteRecord = {
      id: uid(), storeId, productId: input.product.id, productName: input.product.name,
      batchId: input.batchId, qty: input.qty, reason: input.reason, notes: input.notes,
      costCents: input.qty * batch.unitCostCents, createdAt: nowISO(),
      createdBy: input.user.uid, createdByName: input.user.name,
    }
    const list = await this.getWaste(storeId)
    list.push(rec)
    saveList(storeId, 'waste', list)
    const products = await this.getProducts(storeId)
    const p = products.find((x) => x.id === input.product.id)
    if (p) {
      p.totalStock = Math.max(0, (p.totalStock || 0) - input.qty)
      await this.saveProduct(p)
    }
    await this.createAuditLog(storeId, { uid: input.user.uid, userName: input.user.name, action: 'waste.record', entityType: 'batch', entityId: input.batchId, reason: input.reason, afterState: rec })
    return rec
  }

  // ---------------- adjustment ----------------
  async adjustStock(
    storeId: string,
    input: { productId: string; delta: number; reason: string; notes: string; user: { uid: string; name: string } },
  ): Promise<void> {
    const products = await this.getProducts(storeId)
    const p = products.find((x) => x.id === input.productId)
    if (!p) throw new Error('Product not found')
    const newTotal = (p.totalStock || 0) + input.delta
    if (newTotal < 0) throw new Error('Adjustment would make stock negative.')
    p.totalStock = newTotal
    await this.saveProduct(p)
    await this.createAuditLog(storeId, {
      uid: input.user.uid, userName: input.user.name,
      action: input.delta >= 0 ? 'stock.adjust.add' : 'stock.adjust.remove',
      entityType: 'product', entityId: input.productId, reason: input.reason,
      afterState: { delta: input.delta, newTotal, notes: input.notes },
    })
  }

  // ---------------- purchase orders ----------------
  async getPurchaseOrders(storeId: string): Promise<PurchaseOrder[]> { return loadList<PurchaseOrder>(storeId, 'purchaseOrders') }
  async savePurchaseOrder(po: PurchaseOrder): Promise<void> {
    const list = await this.getPurchaseOrders(po.storeId)
    const i = list.findIndex((x) => x.id === po.id)
    if (i >= 0) list[i] = po
    else list.push(po)
    saveList(po.storeId, 'purchaseOrders', list)
  }
  async receivePurchaseOrder(storeId: string, po: PurchaseOrder, received: ReceivedOrderInput[], user: { uid: string; name: string }): Promise<void> {
    const orders = await this.getPurchaseOrders(storeId)
    const order = orders.find((o) => o.id === po.id)
    if (!order) throw new Error('Purchase order not found')
    const newBatches: StockBatch[] = []
    for (const r of received) {
      newBatches.push({
        id: uid(), storeId, productId: r.productId,
        qtyReceived: r.qty, qtyRemaining: r.qty, expiryDate: r.expiryDate,
        receivedDate: toISODate(new Date()), unitCostCents: r.unitCostCents,
        supplierId: order.supplierId, supplierName: order.supplierName,
        lotNumber: r.lotNumber, createdBy: user.uid, createdByName: user.name, createdAt: nowISO(),
      })
      const products = await this.getProducts(storeId)
      const p = products.find((x) => x.id === r.productId)
      if (p) {
        p.totalStock = (p.totalStock || 0) + r.qty
        p.stockValueCents = (p.stockValueCents || 0) + r.qty * r.unitCostCents
        await this.saveProduct(p)
      }
    }
    const all = loadList<StockBatch>(storeId, 'batches')
    all.push(...newBatches)
    saveList(storeId, 'batches', all)
    order.lines = order.lines.map((l) => {
      const rec = received.find((r) => r.productId === l.productId)
      return rec ? { ...l, receivedQty: (l.receivedQty || 0) + rec.qty } : l
    })
    const totalReceived = order.lines.reduce((s, l) => s + (l.receivedQty || 0), 0)
    const totalOrdered = order.lines.reduce((s, l) => s + l.qty, 0)
    order.status = totalReceived >= totalOrdered ? 'received' : 'partially_received'
    order.receivedAt = nowISO()
    saveList(storeId, 'purchaseOrders', orders)
    await this.createAuditLog(storeId, { uid: user.uid, userName: user.name, action: 'purchase_order.receive', entityType: 'purchaseOrder', entityId: order.id, afterState: { status: order.status } })
    await this.createNotification(storeId, { type: 'purchase_order_received', title: 'Order received', message: `Purchase order ${order.orderNumber} from ${order.supplierName} received.`, linkPath: '/orders', entityId: order.id })
  }

  // ---------------- audit ----------------
  async getAuditLogs(storeId: string, limit = 200): Promise<AuditLog[]> {
    const list = loadList<AuditLog>(storeId, 'auditLogs')
    return list.slice(-limit).reverse()
  }
  async createAuditLog(storeId: string, entry: Omit<AuditLog, 'id' | 'storeId' | 'timestamp'>): Promise<void> {
    const list = loadList<AuditLog>(storeId, 'auditLogs')
    list.push({ id: uid(), storeId, timestamp: nowISO(), ...entry })
    saveList(storeId, 'auditLogs', list)
  }

  // ---------------- notifications ----------------
  async getNotifications(storeId: string): Promise<AppNotification[]> {
    return loadList<AppNotification>(storeId, 'notifications').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }
  async createNotification(storeId: string, n: Omit<AppNotification, 'id' | 'storeId' | 'createdAt' | 'read'>): Promise<void> {
    const list = loadList<AppNotification>(storeId, 'notifications')
    list.push({ id: uid(), storeId, createdAt: nowISO(), read: false, ...n })
    saveList(storeId, 'notifications', list)
  }
  async markNotificationsRead(storeId: string, ids?: string[]): Promise<void> {
    const list = loadList<AppNotification>(storeId, 'notifications')
    list.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true })
    saveList(storeId, 'notifications', list)
  }

  // ---------------- held sales ----------------
  async getHeldSales(storeId: string): Promise<HeldSale[]> { return loadList<HeldSale>(storeId, 'heldSales') }
  async saveHeldSale(storeId: string, held: HeldSale): Promise<void> {
    const list = await this.getHeldSales(storeId)
    const i = list.findIndex((x) => x.id === held.id)
    if (i >= 0) list[i] = held
    else list.push(held)
    saveList(storeId, 'heldSales', list)
  }
  async deleteHeldSale(storeId: string, id: string): Promise<void> {
    const list = await this.getHeldSales(storeId)
    saveList(storeId, 'heldSales', list.filter((x) => x.id !== id))
  }

  // ---------------- users ----------------
  async getUsers(storeId: string): Promise<RPUser[]> { return loadList<RPUser>(storeId, 'users') }
  async setUserRole(storeId: string, userId: string, role: string, by: { uid: string; name: string }): Promise<void> {
    const users = await this.getUsers(storeId)
    const u = users.find((x) => x.id === userId)
    if (!u) throw new Error('User not found')
    const old = u.role
    u.role = role as any
    saveList(storeId, 'users', users)
    await this.createAuditLog(storeId, { uid: by.uid, userName: by.name, action: 'user.role', entityType: 'user', entityId: userId, beforeState: { role: old }, afterState: { role } })
  }
  async deactivateUser(storeId: string, userId: string, actor: { uid: string; name: string }): Promise<void> {
    const users = await this.getUsers(storeId)
    const u = users.find((x) => x.id === userId)
    if (!u) throw new Error('User not found')
    if (u.role === 'owner') throw new Error('Cannot deactivate the Owner.')
    const old = u.active
    u.active = false
    saveList(storeId, 'users', users)
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'user.deactivate', entityType: 'user', entityId: userId, beforeState: { active: old }, afterState: { active: false } })
  }
  async inviteUser(storeId: string, input: { email: string; name: string; role: Role; password: string }, actor: { uid: string; name: string }): Promise<void> {
    const auth = loadAuth()
    const email = input.email.toLowerCase().trim()
    if (auth[email]) throw new Error('Email already in use')
    const uidVal = 'u_' + Math.random().toString(36).slice(2, 10)
    auth[email] = { uid: uidVal, email, password: input.password, name: input.name, role: input.role, storeId, storeName: '' }
    saveAuth(auth)
    const user: RPUser = { id: uidVal, storeId, uid: uidVal, email, name: input.name, role: input.role, active: true, createdAt: Date.now() }
    const users = await this.getUsers(storeId)
    users.push(user)
    saveList(storeId, 'users', users)
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'user.invite', entityType: 'user', entityId: uidVal, afterState: { email, role: input.role } })
  }

  // ---------------- backup ----------------
  async exportBackup(storeId: string): Promise<BackupBundle> {
    return {
      app: 'RetailPilot', version: 1, exportedAt: nowISO(), storeId,
      products: await this.getProducts(storeId),
      batches: await this.getBatches(storeId),
      sales: await this.getSales(storeId),
      suppliers: await this.getSuppliers(storeId),
      waste: await this.getWaste(storeId),
      purchaseOrders: await this.getPurchaseOrders(storeId),
      users: await this.getUsers(storeId),
      settings: await this.getSettings(storeId),
    }
  }
  validateBackup(json: BackupBundle): { ok: boolean; summary: RestoreRequest; errors: string[] } {
    const errors: string[] = []
    if (!json || json.app !== 'RetailPilot') errors.push('Not a RetailPilot backup file.')
    if (!Array.isArray(json.products)) errors.push('Missing products.')
    if (!Array.isArray(json.batches)) errors.push('Missing batches.')
    if (!Array.isArray(json.sales)) errors.push('Missing sales.')
    const summary: RestoreRequest = {
      products: json?.products?.length || 0,
      batches: json?.batches?.length || 0,
      sales: json?.sales?.length || 0,
      suppliers: json?.suppliers?.length || 0,
      waste: json?.waste?.length || 0,
      purchaseOrders: json?.purchaseOrders?.length || 0,
      users: json?.users?.length || 0,
      settings: !!json?.settings,
    }
    return { ok: errors.length === 0, summary, errors }
  }
  async restoreBackup(storeId: string, json: BackupBundle, actor: { uid: string; name: string }): Promise<RestoreRequest> {
    const v = this.validateBackup(json)
    if (!v.ok) throw new Error(v.errors.join(' '))
    const existing = await this.getProducts(storeId)
    if (existing.length > 0) {
      throw new Error('Restore refused: this store already contains products. Restore into an empty store to avoid duplication.')
    }
    saveList(storeId, 'products', json.products || [])
    saveList(storeId, 'batches', json.batches || [])
    saveList(storeId, 'sales', json.sales || [])
    saveList(storeId, 'suppliers', json.suppliers || [])
    saveList(storeId, 'waste', json.waste || [])
    saveList(storeId, 'purchaseOrders', json.purchaseOrders || [])
    if (json.users) saveList(storeId, 'users', json.users)
    if (json.settings) saveObj(storeId, 'settings', { ...json.settings, storeId })
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'backup.restore', entityType: 'backup', entityId: 'full', afterState: v.summary })
    return v.summary
  }

  isOnline(): boolean { return this.online }
  onOnlineChanged(cb: (online: boolean) => void): () => void {
    this.onlineSubs.add(cb)
    return () => this.onlineSubs.delete(cb)
  }
}

function mknot(storeId: string, type: AppNotification['type'], title: string, message: string, linkPath: string, entityId: string): AppNotification {
  return { id: uid(), storeId, type, title, message, linkPath, entityId, createdAt: nowISO(), read: false }
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }