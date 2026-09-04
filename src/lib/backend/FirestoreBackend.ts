// Production backend backed by Firebase Auth + Cloud Firestore.
// Reads use queries scoped to the signed-in store. Writes that mutate
// inventory (sales, receiving, waste, adjustments) use Firestore
// transactions so concurrent checkout devices cannot oversell stock.
//
// This module is only instantiated when a Firebase project is configured
// (VITE_USE_FIRESTORE=true + env config). Otherwise the app runs on the
// LocalBackend. Firestore security rules (firestore.rules) enforce the same
// store isolation and permission model server-side.

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  runTransaction,
  query,
  where,
  limit,
  orderBy,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore'
import type {
  AppNotification, AuditLog, HeldSale, Product, PurchaseOrder, RPUser, Sale,
  StockBatch, StoreSettings, Supplier, WasteReason, WasteRecord, PaymentMethod,
} from '../../types'
import { deductFEFO, totalAvailable } from '../inventory'
import { toISO, toISODate } from '../date'
import type { Backend, AuthSession, CreateSaleInput, SignupInput, ReceivedOrderInput, RestoreRequest, BackupBundle, ImportSaleLine, ImportSummary } from './types'

let firebaseApp: any = null

export function isFirebaseConfigured(): boolean {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_USE_FIRESTORE === 'true'
  )
}

export class FirestoreBackend implements Backend {
  readonly name = 'firestore' as const
  private storeId: string | null = null

  private app() {
    if (firebaseApp) return firebaseApp
    firebaseApp = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
    return firebaseApp
  }
  private auth() { return getAuth(this.app()) }
  private db() { return getFirestore(this.app()) }
  private store() { return collection(this.db(), `stores/${this.storeId}/data`) }

  private userRef(storeId: string, id: string) { return doc(this.db(), `stores/${storeId}/users`, id) }
  private userColl(storeId: string) { return collection(this.db(), `stores/${storeId}/users`) }

  // ---- auth ----
  async signIn(email: string, password: string): Promise<AuthSession> {
    const cred = await signInWithEmailAndPassword(this.auth(), email, password)
    const token = await cred.user.getIdTokenResult()
    const claims = token.claims as any
    this.storeId = claims.storeId
    return { uid: cred.user.uid, email: cred.user.email!, name: claims.name || email, role: claims.role || 'staff', storeId: claims.storeId }
  }

  async signUp(input: SignupInput): Promise<AuthSession> {
    // First create the store doc, then the user. Custom claims set server-side.
    throw new Error('Owner signup is provisioned by the admin tooling. Please sign in.')
  }

  async signOut(): Promise<void> { await fbSignOut(this.auth()) }

  onAuthChanged(cb: (s: AuthSession | null) => void): () => void {
    return onAuthStateChanged(this.auth(), (user) => {
      if (!user) { cb(null); return }
      user.getIdToken().then((t) => {
        const c = (JSON.parse(atob(t.split('.')[1]))) as any
        this.storeId = c.storeId
        cb({ uid: user.uid, email: user.email || '', name: c.name || user.email || '', role: c.role || 'staff', storeId: c.storeId })
      })
    })
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth(), email)
  }
  currentSession(): AuthSession | null { return null } // session managed by AuthProvider
  isOwner(): boolean { return false }
  can(role: string, action: string): boolean {
    if (role === 'owner') return true
    const manager = ['pos','scan','receive','expiry','reorder','orders','suppliers','waste','reports','inventory_view','inventory_add','inventory_edit','adjust','import','export','discount','void','markdown','barcode']
    const staff = ['pos','scan','receive_enter','expiry_check','waste_record','inventory_view']
    const list = role === 'manager' ? manager : role === 'staff' ? staff : []
    return list.includes(action)
  }

  async getSettings(storeId: string): Promise<any> {
    const d = await getDoc(doc(this.db(), `stores/${storeId}/meta`, 'settings'))
    return d.exists() ? d.data() : null
  }
  async saveSettings(s: any): Promise<void> {
    await setDoc(doc(this.db(), `stores/${s.storeId}/meta`, 'settings'), s)
  }

  async getProducts(storeId: string): Promise<Product[]> {
    const snap = await getDocs(query(collection(this.db(), `stores/${storeId}/products`)))
    return snap.docs.map((d) => d.data() as Product)
  }
  async getProduct(storeId: string, productId: string): Promise<Product | null> {
    const d = await getDoc(doc(this.db(), `stores/${storeId}/products`, productId))
    return d.exists() ? (d.data() as Product) : null
  }
  async saveProduct(p: Product): Promise<void> {
    await setDoc(doc(this.db(), `stores/${p.storeId}/products`, p.id), p)
  }
  async upsertManyProducts(storeId: string, products: Product[]): Promise<number> {
    const batch = writeBatch(this.db())
    let added = 0
    for (const p of products) {
      batch.set(doc(this.db(), `stores/${storeId}/products`, p.id), p)
    }
    await batch.commit()
    return products.length
  }

  async getBatches(storeId: string, productId?: string): Promise<any[]> {
    const q = productId
      ? query(collection(this.db(), `stores/${storeId}/batches`), where('productId', '==', productId))
      : collection(this.db(), `stores/${storeId}/batches`)
    const r = await getDocs(q)
    return r.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  async addBatches(storeId: string, batches: any[]): Promise<void> {
    const batch = writeBatch(this.db())
    for (const b of batches) batch.set(doc(this.db(), `stores/${storeId}/batches`, b.id), b)
    await batch.commit()
  }

  async getSuppliers(storeId: string): Promise<Supplier[]> {
    const r = await getDocs(collection(this.db(), `stores/${storeId}/suppliers`))
    return r.docs.map((d) => d.data() as Supplier)
  }
  async saveSupplier(s: Supplier): Promise<void> {
    await setDoc(doc(this.db(), `stores/${s.storeId}/suppliers`, s.id), s)
  }

  async getSales(storeId: string): Promise<Sale[]> {
    const r = await getDocs(query(collection(this.db(), `stores/${storeId}/sales`), orderBy('timestamp', 'desc'), limit(5000)))
    return r.docs.map((d) => d.data() as Sale)
  }
  async getSaleNumber(storeId: string): Promise<number> {
    const c = await getDoc(doc(this.db(), `stores/${storeId}/meta`, 'counters'))
    return c.exists() ? (c.data() as any).saleNumber || 0 : 0
  }

  async createSale(storeId: string, input: CreateSaleInput): Promise<any> {
    const db = this.db()
    const today = toISODate(new Date())
    const now = toISO(new Date())
    // Queries are only allowed outside a transaction. Pre-read the current
    // batches so we know which document ids the transaction must re-read by ref.
    const preBatchSnap = await getDocs(collection(db, `stores/${storeId}/batches`))
    const preBatches = preBatchSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    const buyIds = Array.from(new Set(input.lines.map((l) => l.productId)))

    const result = await runTransaction(db, async (tx) => {
      const countersRef = doc(db, `stores/${storeId}/meta`, 'counters')
      const countersDoc = await tx.get(countersRef)
      const counters = countersDoc.exists() ? countersDoc.data() : { saleNumber: 0 }
      const saleNumber = (counters.saleNumber || 0) + 1
      // Re-read every affected batch by reference inside the transaction so two
      // devices cannot oversell the same remaining stock (FEFO on fresh data).
      const batches: any[] = []
      for (const b of preBatches) {
        const d = await tx.get(doc(db, `stores/${storeId}/batches`, b.id))
        batches.push(d.exists() ? { id: b.id, ...d.data() } : b)
      }
      const products: any[] = []
      for (const pid of buyIds) {
        const d = await tx.get(doc(db, `stores/${storeId}/products`, pid))
        if (d.exists()) products.push({ id: pid, ...d.data() })
      }

      for (const line of input.lines) {
        const avail = totalAvailable(batches.filter((b) => b.productId === line.productId))
        if (line.qty > avail) throw new Error(`Insufficient stock for "${line.name}".`)
      }
      const newBatches = batches.map((b) => ({ ...b }))
      let cogsCents = 0
      for (const line of input.lines) {
        const res = deductFEFO(newBatches.filter((b) => b.productId === line.productId), line.qty)
        for (const nb of res.batches) {
          const i = newBatches.findIndex((x) => x.id === nb.id)
          if (i >= 0) newBatches[i] = nb
        }
        cogsCents += res.cogsCents
      }
      const saleId = newId()
      const sale: Sale = {
        id: saleId, storeId, saleNumber, status: 'completed', timestamp: toISO(new Date()),
        createdBy: input.createdBy, createdByName: input.createdByName,
        lines: input.lines.map((l) => ({ ...l, cogsCents: 0 })),
        subtotalCents: input.subtotalCents, discountCents: input.discountCents,
        taxCents: input.taxCents, totalCents: input.totalCents,
        cogsCents, grossProfitCents: input.totalCents - cogsCents,
        paymentMethod: input.paymentMethod, cashReceivedCents: input.cashReceivedCents, changeCents: input.changeCents,
      }
      const net = Math.max(1, sale.subtotalCents)
      sale.lines = sale.lines.map((l) => ({ ...l, cogsCents: Math.round(cogsCents * (l.lineTotalCents / net)) }))

      // writes
      tx.set(doc(db, `stores/${storeId}/sales`, saleId), sale)
      for (const nb of newBatches) tx.set(doc(db, `stores/${storeId}/batches`, nb.id), nb)
      tx.set(countersRef, { saleNumber })
      // update products
      const newProducts = products.map((p) => ({ ...p }))
      for (const line of input.lines) {
        const p = newProducts.find((x) => x.id === line.productId)
        if (!p) continue
        p.totalStock = Math.max(0, (p.totalStock || 0) - line.qty)
        const hist = p.salesHistory || []
        const rec = hist.find((d) => d.date === today)
        const lcogs = sale.lines.find((l) => l.productId === line.productId)?.cogsCents || 0
        if (rec) { rec.units += line.qty; rec.revenueCents += line.lineTotalCents; rec.cogsCents += lcogs }
        else hist.push({ date: today, units: line.qty, revenueCents: line.lineTotalCents, cogsCents: lcogs })
        p.salesHistory = hist
        tx.set(doc(db, `stores/${storeId}/products`, p.id), p)
        if (p.totalStock <= 0) tx.set(doc(collection(db, `stores/${storeId}/notifications`)), { storeId, type: 'out_of_stock', title: 'Out of stock', message: `"${p.name}" is now out of stock.`, linkPath: '/inventory', entityId: p.id, createdAt: toISO(new Date()), read: false })
      }
      return { sale, cogsCents, grossProfitCents: sale.grossProfitCents }
    })
    await this.createAuditLog(storeId, { uid: input.createdBy, userName: input.createdByName, action: 'sale.complete', entityType: 'sale', entityId: result.sale.id, afterState: { totalCents: result.sale.totalCents } })
    return result
  }

  async importSales(storeId: string, lines: ImportSaleLine[], byUser: { uid: string; name: string }): Promise<ImportSummary> {
    const db = this.db()
    const prodsSnap = await getDocs(query(collection(db, `stores/${storeId}/products`)))
    const products = prodsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any)
    const byBarcode = new Map<string, any>()
    for (const p of products) if (p.barcode) byBarcode.set(String(p.barcode).toLowerCase(), p)
    const byName = new Map<string, any>()
    for (const p of products) byName.set(String(p.name).toLowerCase(), p)

    const countersRef = doc(db, `stores/${storeId}/meta`, 'counters')
    const cDoc = await getDoc(countersRef)
    let saleNumber = (cDoc.exists() ? cDoc.data().saleNumber : 0) || 0
    const importedNames: string[] = []
    const skippedNames: string[] = []
    let totalRevenueCents = 0
    let imported = 0
    const batch = writeBatch(db)
    const prodUpdates = new Map<string, any>()

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
        id: newId(), storeId, saleNumber, status: 'completed',
        timestamp: line.timestamp, createdBy: byUser.uid, createdByName: byUser.name,
        lines: [{ productId: product.id, name: product.name, barcode: product.barcode, qty, unitPriceCents, discountCents: 0, lineTotalCents, cogsCents }],
        subtotalCents: lineTotalCents, discountCents: 0, taxCents: 0, totalCents: lineTotalCents,
        cogsCents, grossProfitCents: lineTotalCents - cogsCents,
        paymentMethod: (['card', 'cash', 'eftpos', 'other'] as PaymentMethod[]).includes(line.payment.toLowerCase() as PaymentMethod) ? (line.payment.toLowerCase() as PaymentMethod) : 'card',
        cashReceivedCents: null, changeCents: null,
      }
      batch.set(doc(collection(db, `stores/${storeId}/sales`)), sale)
      totalRevenueCents += lineTotalCents
      imported += 1
      if (!importedNames.includes(product.name)) importedNames.push(product.name)

      const dayKey = line.timestamp.slice(0, 10)
      const existing = prodUpdates.get(product.id) || product
      const hist = existing.salesHistory || []
      const rec = hist.find((d: any) => d.date === dayKey)
      if (rec) { rec.units += qty; rec.revenueCents += lineTotalCents; rec.cogsCents += cogsCents }
      else hist.push({ date: dayKey, units: qty, revenueCents: lineTotalCents, cogsCents })
      prodUpdates.set(product.id, { ...existing, salesHistory: hist })
    }

    for (const [id, p] of prodUpdates) batch.set(doc(db, `stores/${storeId}/products`, id), p)
    batch.set(countersRef, { saleNumber })
    await batch.commit()

    if (imported > 0) {
      await this.createAuditLog(storeId, { uid: byUser.uid, userName: byUser.name, action: 'sale.import', entityType: 'sale', entityId: `${storeId}:import`, afterState: { imported, totalRevenueCents } })
    }
    return { imported, skipped: lines.length - imported, totalRevenueCents, importedNames, skippedNames }
  }

  async voidSale(storeId: string, saleId: string, byUser: { uid: string; name: string }, reason: string): Promise<void> {
    const ref = doc(this.db(), `stores/${storeId}/sales`, saleId)
    await runTransaction(this.db(), async (tx) => {
      const d = await tx.get(ref)
      const sale = d.data() as Sale
      if (!sale) throw new Error('Sale not found')
      sale.status = 'voided'
      sale.voidedBy = byUser.uid
      sale.voidedAt = toISO(new Date())
      tx.set(ref, sale)
    })
    await this.createAuditLog(storeId, { uid: byUser.uid, userName: byUser.name, action: 'sale.void', entityType: 'sale', entityId: saleId, reason })
  }

  async getWaste(storeId: string): Promise<WasteRecord[]> {
    const r = await getDocs(query(collection(this.db(), `stores/${storeId}/waste`), orderBy('createdAt', 'desc'), limit(2000)))
    return r.docs.map((d) => d.data() as WasteRecord)
  }
  async recordWaste(storeId, input): Promise<WasteRecord> {
    const db = this.db()
    const res = await runTransaction(db, async (tx) => {
      const bRef = doc(db, `stores/${storeId}/batches`, input.batchId)
      const bd = await tx.get(bRef)
      const batch = bd.data()
      if (!batch || input.qty <= 0 || input.qty > batch.qtyRemaining) throw new Error('Invalid batch quantity')
      batch.qtyRemaining -= input.qty
      tx.set(bRef, batch)
      const pRef = doc(db, `stores/${storeId}/products`, input.product.id)
      const pd = await tx.get(pRef)
      const p = pd.data()
      if (p) { p.totalStock = Math.max(0, (p.totalStock || 0) - input.qty); tx.set(pRef, p) }
      const rec: WasteRecord = { id: newId(), storeId, productId: input.product.id, productName: input.product.name, batchId: input.batchId, qty: input.qty, reason: input.reason, notes: input.notes, costCents: input.qty * batch.unitCostCents, createdAt: toISO(new Date()), createdBy: input.user.uid, createdByName: input.user.name }
      tx.set(doc(collection(db, `stores/${storeId}/waste`)), rec)
      return rec
    })
    await this.createAuditLog(storeId, { uid: input.user.uid, userName: input.user.name, action: 'waste.record', entityType: 'batch', entityId: input.batchId, afterState: res })
    return res
  }

  async adjustStock(storeId, input): Promise<void> {
    const db = this.db()
    await runTransaction(db, async (tx) => {
      const pRef = doc(db, `stores/${storeId}/products`, input.productId)
      const pd = await tx.get(pRef)
      const p = pd.data()
      if (!p) throw new Error('Product not found')
      const newTotal = (p.totalStock || 0) + input.delta
      if (newTotal < 0) throw new Error('Adjustment would make stock negative.')
      p.totalStock = newTotal
      tx.set(pRef, p)
    })
    await this.createAuditLog(storeId, { uid: input.user.uid, userName: input.user.name, action: input.delta >= 0 ? 'stock.adjust.add' : 'stock.adjust.remove', entityType: 'product', entityId: input.productId, reason: input.reason, afterState: { delta: input.delta } })
  }

  async getPurchaseOrders(storeId: string): Promise<PurchaseOrder[]> {
    const r = await getDocs(query(collection(this.db(), `stores/${storeId}/purchaseOrders`), orderBy('createdAt', 'desc')))
    return r.docs.map((d) => d.data() as PurchaseOrder)
  }
  async savePurchaseOrder(po: PurchaseOrder): Promise<void> {
    await setDoc(doc(this.db(), `stores/${po.storeId}/purchaseOrders`, po.id), po)
  }
  async receivePurchaseOrder(storeId, po, received: ReceivedOrderInput[], user): Promise<void> {
    const db = this.db()
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, `stores/${storeId}/purchaseOrders`, po.id)
      const od = await tx.get(orderRef)
      const order = od.data()
      if (!order) throw new Error('Purchase order not found')
      const batches = received.map((r) => ({ id: newId(), storeId, productId: r.productId, qtyReceived: r.qty, qtyRemaining: r.qty, expiryDate: r.expiryDate, receivedDate: toISODate(new Date()), unitCostCents: r.unitCostCents, supplierId: order.supplierId, supplierName: order.supplierName, lotNumber: r.lotNumber, createdBy: user.uid, createdByName: user.name, createdAt: toISO(new Date()) }))
      for (const b of batches) tx.set(doc(collection(db, `stores/${storeId}/batches`), b.id), b)
      order.lines = order.lines.map((l) => { const rec = received.find((r) => r.productId === l.productId); return rec ? { ...l, receivedQty: (l.receivedQty || 0) + rec.qty } : l })
      const totalReceived = order.lines.reduce((s, l) => s + (l.receivedQty || 0), 0)
      const totalOrdered = order.lines.reduce((s, l) => s + l.qty, 0)
      order.status = totalReceived >= totalOrdered ? 'received' : 'partially_received'
      order.receivedAt = toISO(new Date())
      tx.set(orderRef, order)
      for (const r of received) {
        const pRef = doc(db, `stores/${storeId}/products`, r.productId)
        const pd = await tx.get(pRef)
        if (pd.exists()) { const p = pd.data(); p.totalStock = (p.totalStock || 0) + r.qty; tx.set(pRef, p) }
      }
    })
    await this.createAuditLog(storeId, { uid: user.uid, userName: user.name, action: 'purchase_order.receive', entityType: 'purchaseOrder', entityId: po.id })
  }

  async getAuditLogs(storeId: string, limitN = 200): Promise<AuditLog[]> {
    const r = await getDocs(query(collection(this.db(), `stores/${storeId}/auditLogs`), orderBy('timestamp', 'desc'), limit(limitN)))
    return r.docs.map((d) => d.data() as AuditLog)
  }
  async createAuditLog(storeId: string, entry: Omit<AuditLog, 'id' | 'storeId' | 'timestamp'>): Promise<void> {
    await addDoc(collection(this.db(), `stores/${storeId}/auditLogs`), { ...entry, storeId, timestamp: toISO(new Date()) })
  }

  async getNotifications(storeId: string): Promise<AppNotification[]> {
    const r = await getDocs(query(collection(this.db(), `stores/${storeId}/notifications`), orderBy('createdAt', 'desc'), limit(200)))
    return r.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
  }
  async createNotification(storeId: string, n): Promise<void> {
    await addDoc(collection(this.db(), `stores/${storeId}/notifications`), { ...n, storeId, createdAt: toISO(new Date()), read: false })
  }
  async markNotificationsRead(storeId: string, ids?: string[]): Promise<void> {
    const db = this.db()
    const batch = writeBatch(db)
    const r = ids?.length ? await getDocs(query(collection(db, `stores/${storeId}/notifications`), where('__name__', 'in', ids))) : await getDocs(collection(db, `stores/${storeId}/notifications`))
    r.docs.forEach((d) => batch.update(d.ref, { read: true }))
    await batch.commit()
  }

  async getHeldSales(storeId: string): Promise<HeldSale[]> {
    const r = await getDocs(collection(this.db(), `stores/${storeId}/heldSales`))
    return r.docs.map((d) => ({ id: d.id, ...d.data() }) as HeldSale)
  }
  async saveHeldSale(storeId: string, held: HeldSale): Promise<void> {
    await setDoc(doc(this.db(), `stores/${storeId}/heldSales`, held.id), held)
  }
  async deleteHeldSale(storeId: string, id: string): Promise<void> {
    await deleteDoc(doc(this.db(), `stores/${storeId}/heldSales`, id))
  }

  async getUsers(storeId: string): Promise<RPUser[]> {
    const r = await getDocs(this.userColl(storeId))
    return r.docs.map((d) => ({ id: d.id, ...d.data() }) as RPUser)
  }
  async setUserRole(storeId, userId, role, actor): Promise<void> {
    await setDoc(this.userRef(storeId, userId), { role }, { merge: true })
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'user.role', entityType: 'user', entityId: userId, afterState: { role } })
  }
  async deactivateUser(storeId, userId, actor): Promise<void> {
    await setDoc(this.userRef(storeId, userId), { active: false }, { merge: true })
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'user.deactivate', entityType: 'user', entityId: userId })
  }
  async inviteUser(storeId, input, actor): Promise<void> {
    // A Manager/Staff user is created; custom claims are set by Cloud Functions
    // on user creation. This method stores the profile; auth creation is
    // handled in the Host provisioning.
    await addDoc(this.userColl(storeId), { storeId, uid: input.email, email: input.email, name: input.name, role: input.role, active: true, createdAt: Date.now() })
    await this.createAuditLog(storeId, { uid: actor.uid, userName: actor.name, action: 'user.invite', entityType: 'user', entityId: input.email, afterState: { email: input.email, role: input.role } })
  }

  async exportBackup(storeId: string): Promise<BackupBundle> {
    return {
      app: 'RetailPilot', version: 1, exportedAt: toISO(new Date()), storeId,
      products: await this.getProducts(storeId), batches: await this.getBatches(storeId),
      sales: await this.getSales(storeId), suppliers: await this.getSuppliers(storeId),
      waste: await this.getWaste(storeId), purchaseOrders: await this.getPurchaseOrders(storeId),
      users: await this.getUsers(storeId), settings: await this.getSettings(storeId),
    }
  }
  validateBackup(json: any): any {
    const errors: string[] = []
    if (!json || json.app !== 'RetailPilot') errors.push('Not a RetailPilot backup file.')
    if (!Array.isArray(json.products)) errors.push('Missing products.')
    if (!Array.isArray(json.sales)) errors.push('Missing sales.')
    const summary: RestoreRequest = { products: json?.products?.length || 0, batches: json?.batches?.length || 0, sales: json?.sales?.length || 0, suppliers: json?.suppliers?.length || 0, waste: json?.waste?.length || 0, purchaseOrders: json?.purchaseOrders?.length || 0, users: json?.users?.length || 0, settings: !!json?.settings }
    return { ok: errors.length === 0, summary, errors }
  }
  async restoreBackup(storeId, json, by): Promise<RestoreRequest> {
    const v = this.validateBackup(json)
    if (!v.ok) throw new Error(v.errors.join(' '))
    const existing = await this.getProducts(storeId)
    if (existing.length > 0) throw new Error('Restore refused: store already has products.')
    const batch = writeBatch(this.db())
    json.products.forEach((p: any) => batch.set(doc(this.db(), `stores/${storeId}/products`, p.id), p))
    json.sales.forEach((s: any) => batch.set(doc(this.db(), `stores/${storeId}/sales`, s.id), s))
    json.suppliers.forEach((s: any) => batch.set(doc(this.db(), `stores/${storeId}/suppliers`, s.id), s))
    json.batches?.forEach((b: any) => batch.set(doc(this.db(), `stores/${storeId}/batches`, b.id), b))
    json.waste?.forEach((w: any) => batch.set(doc(this.db(), `stores/${storeId}/waste`, w.id), w))
    json.purchaseOrders?.forEach((o: any) => batch.set(doc(this.db(), `stores/${storeId}/purchaseOrders`, o.id), o))
    await batch.commit()
    return v.summary
  }

  isOnline(): boolean { return true }
  onOnlineChanged(cb: (online: boolean) => void): () => void { return () => {} }
}

function newId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }