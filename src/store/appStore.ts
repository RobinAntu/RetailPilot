import { create } from 'zustand'
import type {
  AppNotification, AuditLog, HeldSale, Product, PurchaseOrder, RPUser, Sale,
  StockBatch, StoreSettings, Supplier, WasteRecord,
} from '../types'
import { getBackend } from '../lib/backend'
import type { AuthSession } from '../lib/backend'

interface DataState {
  session: AuthSession | null
  online: boolean
  loading: boolean
  loaded: boolean
  error: string | null

  settings: StoreSettings | null
  products: Product[]
  batches: StockBatch[]
  suppliers: Supplier[]
  sales: Sale[]
  waste: WasteRecord[]
  orders: PurchaseOrder[]
  notifications: any[]
  users: RPUser[]
  auditLogs: AuditLog[]

  init: () => () => void
  refresh: () => Promise<void>
  setSession: (s: AuthSession | null) => void
  clearError: () => void
}

const backend = getBackend()

export const useDataStore = create<DataState>((set, get) => ({
  session: null,
  online: backend.isOnline(),
  loading: false,
  loaded: false,
  error: null,
  settings: null,
  products: [],
  batches: [],
  suppliers: [],
  sales: [],
  waste: [],
  orders: [],
  notifications: [],
  users: [],
  auditLogs: [],

  init: () => {
    const unsubAuth = backend.onAuthChanged((s) => {
      set({ session: s })
      if (s) {
        get().refresh().catch(() => {})
      } else {
        set({ loaded: false, products: [], batches: [], suppliers: [], sales: [], waste: [], orders: [], notifications: [], users: [], auditLogs: [], settings: null })
      }
    })
    const unsubOnline = backend.onOnlineChanged((online) => set({ online }))
    return () => { unsubAuth(); unsubOnline() }
  },

  refresh: async () => {
    const s = get().session
    if (!s) return
    set({ loading: true, error: null })
    try {
      const [products, batches, suppliers, sales, waste, orders, notifications, users, auditLogs, settings] = await Promise.all([
        backend.getProducts(s.storeId),
        backend.getBatches(s.storeId),
        backend.getSuppliers(s.storeId),
        backend.getSales(s.storeId),
        backend.getWaste(s.storeId),
        backend.getPurchaseOrders(s.storeId),
        backend.getNotifications(s.storeId),
        backend.getUsers(s.storeId),
        backend.getAuditLogs(s.storeId, 300),
        backend.getSettings(s.storeId),
      ])
      set({
        products, batches, suppliers, sales, waste, orders, notifications, users, auditLogs, settings,
        loading: false, loaded: true,
      })
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Failed to load data' })
    }
  },

  setSession: (s) => set({ session: s }),
  clearError: () => set({ error: null }),
}))

export { backend }