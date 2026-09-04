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
  StoreSettings,
  Supplier,
  WasteReason,
  WasteRecord,
} from '../../types'

export interface AuthSession {
  uid: string
  email: string
  name: string
  role: string
  storeId: string
}

export interface SignupInput {
  email: string
  password: string
  name: string
  role: string
  storeName: string
}

export interface CreateSaleInput {
  saleNumber: number
  createdBy: string
  createdByName: string
  lines: {
    productId: string
    name: string
    barcode: string
    qty: number
    unitPriceCents: number
    discountCents: number
    lineTotalCents: number
  }[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  paymentMethod: PaymentMethod
  cashReceivedCents: number | null
  changeCents: number | null
}

export interface ImportSaleLine {
  barcode: string
  name: string
  qty: number
  unitPriceCents: number | null // null => use product default sell price
  timestamp: string // ISO
  payment: string
}

export interface ImportSummary {
  imported: number
  skipped: number
  totalRevenueCents: number
  importedNames: string[]
  skippedNames: string[]
}

export interface ReceivedLine {
  productId: string
  qty: number
  unitCostCents: number
  expiryDate: string | null
  lotNumber: string
}

export interface ReceivedOrderInput {
  productId: string
  productName: string
  qty: number
  unitCostCents: number
  expiryDate: string | null
  lotNumber: string
}

export interface RestoreRequest {
  products: number
  batches: number
  sales: number
  suppliers: number
  waste: number
  purchaseOrders: number
  users: number
  settings: boolean
}

export interface RestoreSummary {
  products: number
  batches: number
  sales: number
  suppliers: number
  waste: number
  purchaseOrders: number
  users: number
}

export interface BackupBundle {
  app: string
  version: number
  exportedAt: string
  storeId: string
  products: Product[]
  batches: any[]
  sales: Sale[]
  suppliers: Supplier[]
  waste: WasteRecord[]
  purchaseOrders: PurchaseOrder[]
  users: RPUser[]
  settings: StoreSettings
}

export interface Backend {
  readonly name: 'firestore' | 'local'

  // ---- auth ----
  signIn(email: string, password: string): Promise<AuthSession>
  signUp(input: SignupInput): Promise<AuthSession>
  signOut(): Promise<void>
  onAuthChanged(cb: (s: AuthSession | null) => void): () => void
  sendPasswordReset(email: string): Promise<void>
  currentSession(): AuthSession | null
  isOwner(): boolean
  can(role: string, action: string): boolean

  // ---- store ----
  getSettings(storeId: string): Promise<StoreSettings>
  saveSettings(s: StoreSettings): Promise<void>

  // ---- products ----
  getProducts(storeId: string): Promise<Product[]>
  getProduct(storeId: string, productId: string): Promise<Product | null>
  saveProduct(p: Product): Promise<void>
  deleteProduct(storeId: string, productId: string, by: { uid: string; name: string }): Promise<void>
  upsertManyProducts(storeId: string, products: Product[]): Promise<number>

  // ---- batches ----
  getBatches(storeId: string, productId?: string): Promise<any[]>
  addBatches(storeId: string, batches: any[]): Promise<void>

  // ---- suppliers ----
  getSuppliers(storeId: string): Promise<Supplier[]>
  saveSupplier(s: Supplier): Promise<void>
  deleteSupplier(storeId: string, id: string, by: { uid: string; name: string }): Promise<void>

  // ---- sales ----
  getSales(storeId: string): Promise<Sale[]>
  /** Atomic: validates availability, deducts batches via FEFO, writes sale + line items + stats + audit. */
  createSale(storeId: string, input: CreateSaleInput): Promise<{ sale: Sale; cogsCents: number; grossProfitCents: number }>
  importSales(storeId: string, lines: ImportSaleLine[], byUser: { uid: string; name: string }): Promise<ImportSummary>
  voidSale(storeId: string, saleId: string, byUser: { uid: string; name: string }, reason: string): Promise<void>
  getSaleNumber(storeId: string): Promise<number>

  // ---- waste ----
  getWaste(storeId: string): Promise<WasteRecord[]>
  recordWaste(
    storeId: string,
    input: {
      product: Product
      batchId: string
      qty: number
      reason: WasteReason
      notes: string
      user: { uid: string; name: string }
    },
  ): Promise<WasteRecord>

  // ---- stock adjustment ----
  adjustStock(
    storeId: string,
    input: {
      productId: string
      delta: number
      reason: string
      notes: string
      user: { uid: string; name: string }
    },
  ): Promise<void>

  // ---- purchase orders ----
  getPurchaseOrders(storeId: string): Promise<PurchaseOrder[]>
  savePurchaseOrder(po: PurchaseOrder): Promise<void>
  receivePurchaseOrder(
    storeId: string,
    po: PurchaseOrder,
    received: ReceivedOrderInput[],
    user: { uid: string; name: string },
  ): Promise<void>

  // ---- audit ----
  getAuditLogs(storeId: string, limit?: number): Promise<AuditLog[]>
  createAuditLog(storeId: string, entry: Omit<AuditLog, 'id' | 'storeId' | 'timestamp'>): Promise<void>

  // ---- notifications ----
  getNotifications(storeId: string): Promise<AppNotification[]>
  createNotification(storeId: string, n: Omit<AppNotification, 'id' | 'storeId' | 'createdAt' | 'read'>): Promise<void>
  markNotificationsRead(storeId: string, ids?: string[]): Promise<void>

  // ---- held sales ----
  getHeldSales(storeId: string): Promise<HeldSale[]>
  saveHeldSale(storeId: string, held: HeldSale): Promise<void>
  deleteHeldSale(storeId: string, id: string): Promise<void>

  // ---- users ----
  getUsers(storeId: string): Promise<RPUser[]>
  setUserRole(storeId: string, userId: string, role: string, by: { uid: string; name: string }): Promise<void>
  deactivateUser(storeId: string, userId: string, by: { uid: string; name: string }): Promise<void>
  inviteUser(storeId: string, input: { email: string; name: string; role: Role; password: string }, by: { uid: string; name: string }): Promise<void>

  // ---- backup / restore ----
  exportBackup(storeId: string): Promise<BackupBundle>
  validateBackup(json: BackupBundle): { ok: boolean; summary: RestoreRequest; errors: string[] }
  restoreBackup(storeId: string, json: BackupBundle, by: { uid: string; name: string }): Promise<RestoreRequest>

  // ---- online status ----
  isOnline(): boolean
  onOnlineChanged(cb: (online: boolean) => void): () => void
}

export type { Role }