// =====================================================================
// RetailPilot — Core domain types
// All monetary values are stored as INTEGER CENTS to avoid floating-point
// money errors. Every document is scoped to a `storeId`.
// =====================================================================

export type Role = 'owner' | 'manager' | 'staff'

export type ExpiryTracking = 'required' | 'optional' | 'none'

export type BatchStatus = 'active' | 'expired' | 'depleted'

export type SaleStatus = 'completed' | 'voided'

export type PaymentMethod = 'cash' | 'card' | 'other'

export type WasteReason = 'Expired' | 'Damaged' | 'Spoiled' | 'Recall' | 'Stock Correction' | 'Other'

export type AdjustmentReason = 'Stock Count' | 'Damaged' | 'Data Correction' | 'Other'

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'

export type NotificationType =
  | 'expired'
  | 'expiring_soon'
  | 'low_stock'
  | 'out_of_stock'
  | 'purchase_order_received'
  | 'purchase_order_submitted'
  | 'waste'
  | 'system'

// ---------- Users ----------
export interface RPUser {
  id: string
  storeId: string
  uid: string // Firebase auth uid
  email: string
  name: string
  role: Role
  active: boolean
  createdAt: number
}

// ---------- Store ----------
export interface StoreSettings {
  storeId: string
  name: string
  address: string
  phone: string
  abn?: string
  currency: string // e.g. 'AUD'
  currencySymbol: string // e.g. '$'
  locale: string // e.g. 'en-AU'
  timezone: string // IANA
  defaultMinimumStock: number
  safetyStockDays: number
  expiryWarningDays: number // warn when expiry within N days
  taxRatePercent: number // e.g. 10 for GST (not hardcoded globally)
  receiptFooter: string
  allowStaffDiscount: boolean
  allowStaffVoid: boolean
}

// ---------- Supplier ----------
export interface Supplier {
  id: string
  storeId: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  leadTimeDays: number
  minOrderAmountCents: number
  notes: string
  active: boolean
  createdAt: string
}

// ---------- Product ----------
export interface Product {
  id: string
  storeId: string
  name: string
  barcode: string
  sku: string
  category: string
  brand: string
  supplierId: string
  supplierName?: string
  costCents: number
  sellCents: number
  minStock: number
  targetStock: number
  unit: string
  aisle: string
  shelf: string
  notes: string
  expiryTracking: ExpiryTracking
  active: boolean
  createdAt: string
  updatedAt: string
  // stats
  totalStock: number
  stockValueCents: number
  salesHistory?: SaleDay[]
}

export interface SaleDay {
  date: string // YYYY-MM-DD
  units: number
  revenueCents: number
  cogsCents: number
}

// ---------- Stock Batch ----------
export interface StockBatch {
  id: string
  storeId: string
  productId: string
  qtyReceived: number
  qtyRemaining: number
  expiryDate: string | null // null = no expiry
  receivedDate: string
  unitCostCents: number
  supplierId: string
  supplierName?: string
  lotNumber: string
  createdBy: string
  createdByName: string
  createdAt: string
}

// ---------- Cart line (transient, not stored) ----------
export interface CartLine {
  productId: string
  barcode: string
  name: string
  qty: number
  unitPriceCents: number
  discountCents: number // per-line total discount
  availableStock: number
}

export interface HeldSale {
  id: string
  storeId: string
  createdBy: string
  createdByName: string
  createdAt: string
  label: string
  lines: CartLine[]
}

// ---------- Sale ----------
export interface Sale {
  id: string
  storeId: string
  saleNumber: number
  status: SaleStatus
  timestamp: string
  createdBy: string
  createdByName: string
  lines: SaleLine[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  cogsCents: number
  grossProfitCents: number
  paymentMethod: PaymentMethod
  cashReceivedCents: number | null
  changeCents: number | null
  voidedBy?: string
  voidedAt?: string
}

export interface SaleLine {
  productId: string
  name: string
  barcode: string
  qty: number
  unitPriceCents: number
  discountCents: number
  lineTotalCents: number
  cogsCents: number
}

// ---------- Purchase Order ----------
export interface PurchaseOrderLine {
  productId: string
  productName: string
  barcode: string
  qty: number
  unitCostCents: number
  totalCents: number
  receivedQty: number
}

export interface PurchaseOrder {
  id: string
  storeId: string
  orderNumber: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  lines: PurchaseOrderLine[]
  totalCents: number
  expectedDeliveryDate: string
  notes: string
  createdBy: string
  createdByName: string
  createdAt: string
  submittedAt?: string
  receivedAt?: string
}

// ---------- Waste ----------
export interface WasteRecord {
  id: string
  storeId: string
  productId: string
  productName: string
  batchId: string
  qty: number
  reason: WasteReason
  notes: string
  costCents: number
  createdAt: string
  createdBy: string
  createdByName: string
}

// ---------- Audit ----------
export interface AuditLog {
  id: string
  storeId: string
  uid: string
  userName: string
  action: string
  entityType: string
  entityId: string
  timestamp: string
  beforeState?: unknown
  afterState?: unknown
  reason?: string
}

// ---------- Notification ----------
export interface AppNotification {
  id: string
  storeId: string
  type: NotificationType
  title: string
  message: string
  linkPath: string
  entityId: string
  createdAt: string
  read: boolean
}

// ---------- Barcode ----------
export interface BarcodeGenerated {
  productId: string
  code: string // e.g. internal 'RPL' prefixed
  createdAt: string
}

// =====================================================================
// Enums / constants
// =====================================================================

export const WASTE_REASONS: WasteReason[] = [
  'Expired',
  'Damaged',
  'Spoiled',
  'Recall',
  'Stock Correction',
  'Other',
]

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  'Stock Count',
  'Damaged',
  'Data Correction',
  'Other',
]

export const PRODUCT_STATUS = {
  active: 'active',
  archived: 'archived',
} as const

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}

export const CURRENCIES = [
  { code: 'AUD', symbol: '$', name: 'Australian Dollar' },
  { code: 'NZD', symbol: '$', name: 'New Zealand Dollar' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
]

export const LOCALES = [
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-NZ', label: 'English (New Zealand)' },
]

export const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Pacific/Auckland',
  'Europe/London',
  'America/New_York',
  'UTC',
]