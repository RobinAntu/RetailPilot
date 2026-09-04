# RetailPilot 🛒
**Smarter Stock. Less Waste. More Profit.**

A production-ready, cloud-based supermarket management system for small supermarkets.
Single connected app: scanning → stock → expiry → waste → reorder → purchasing → profit.

---

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Firebase Auth + Cloud Firestore (multi-store) + Firebase Storage + Firebase Hosting
- **Scanning**: ZXing (camera), keyboard-wedge (USB/Bluetooth), manual entry
- **Analytics**: Recharts · **Spreadsheets**: SheetJS (XLSX) + CSV
- **PWA**: installable, offline-ready, Online/Syncing/Offline states

All money is handled in **integer cents** to avoid floating-point errors. Default locale
is **en-AU**, currency **AUD**, date **DD/MM/YYYY**.

---

## Getting started (development)

```bash
npm install

# Backend selection is automatic:
#   • No Firebase config  -> in-memory LocalBackend (fully functional, single-tab)
#   • VITE_USE_FIRESTORE  -> production Cloud Firestore backend
cp .env.example .env.local   # then fill in your Firebase config

npm run dev
```

> **LocalBackend** implements the exact same interface as the Firestore backend so
> the entire app (POS, FEFO, reorder, reporting, backups) works and can be
> acceptance-tested without a Firebase project.

## Testing

```bash
# TypeScript (must be 0 errors)
npx tsc --noEmit

# Production build + PWA
npm run build

# Core business-logic tests (FEFO, integer-cents money, barcode check digits,
# reorder/forecast). Bundles with esbuild and runs in Node:
node scripts/run-logic-tests.mjs
```

## Environment (`VITE_` variables)
| Var | Purpose |
|---|---|
| `VITE_USE_FIRESTORE` | `true` switches to the Cloud Firestore backend |
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `your-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | sender id |
| `VITE_FIREBASE_APP_ID` | web app id |

## Deploy to Firebase Hosting

1. `npm run build` (outputs `dist/`).
2. Install the CLI and log in:
   ```bash
   npm i -g firebase-tools && firebase login
   ```
3. `firebase use <project-id>`
4. `firebase deploy --only hosting,firestore:rules,storage:rules`

`firebase.json` already wires **hosting → `dist`**, **firestore rules**, and
**storage rules**. The hosting config adds an SPA rewrite and immutable asset
caching.

> ⚠️ **Security rules are PRODUCTION rules** (`firestore.rules`, `storage.rules`).
> They enforce **store isolation** and **role gating**. Never run Firestore in
> test mode in production.

## Security & permissions
Roles are set as **Firebase Auth custom claims** (`role`, `storeId`) at signup:
- **Owner** — everything (users, settings, backup/restore, roles).
- **Manager** — operations: inventory, receiving, expiry, waste, suppliers,
  purchase orders, POS, reports.
- **Staff** — POS, scanning, receiving (where permitted), expiry checks.

The UI hides actions without permission **and** `firestore.rules` enforce the
same boundaries server-side — a staff member cannot promote themselves or touch
owner-only data by editing frontend code.

### Data model
```
stores/{storeId}
  ├── products/{id}          products (price, supplier, expiry tracking)
  ├── batches/{id}           FEFO stock batches (qty, expiry, lot, cost, supplier)
  ├── sales/{id}             sales + line items + COGS/gross profit
  ├── suppliers/{id}
  ├── purchaseOrders/{id}    drafts -> submitted -> partially_received -> received
  ├── waste/{id}
  ├── users/{id}
  ├── auditLogs/{id}         append-only, tamper-resistant
  ├── notifications/{id}
  ├── heldSales/{id}
  └── meta/{settings|counters}
```

**Every document is scoped to its store.** Sales, receiving, waste and stock
adjustments run inside **Firestore transactions** (or a concurrency-safe local
equivalent) so multiple checkout devices cannot oversell the same inventory.

## Feature checklist (status)
- Login/Signup + RBAC (Owner/Manager/Staff) ✅
- App shell: sidebar, top bar, global search, notifications, mobile nav ✅
- Dashboard: KPI cards, priority actions, 7/30-day charts (live data) ✅
- Scan/POS: keyboard-wedge + ZXing camera + manual, cart, discounts, hold/resume ✅
- Transactional checkout: FEFO deduction, COGS, gross profit, audit, low-stock ✅
- Inventory: CRUD, filters, archive, adjust, import/export ✅
- Batch & expiry: batches, FEFO, Expiry Command Centre + forecasting ✅
- Waste: record, analytics, cost loss ✅
- Reorder: out-of-stock/order-now/watch, safety stock, lead time, incoming PO ✅
- Purchase Orders: draft→submitted→received, batches auto-created ✅
- Suppliers module ✅
- Reports: today/yesterday/7/30/custom, profit/inventory/expiry/waste/etc ✅
- Excel/CSV import with validation + preview, Full Workbook + CSV export ✅
- Barcode Centre (EAN/UPC + internal codes + check digits) ✅
- Global search, notifications, audit logging ✅
- Data & Backup (JSON + Excel, validated restore w/ owner confirm) ✅
- Settings (store, inventory, POS, security, appearance) ✅
- User management (invite, deactivate, role) ✅
- PWA (manifest, icons, offline caching) ✅
- Automated tests: FEFO, money, barcodes, reorder, forecast ✅

## End-to-end acceptance flow
1. Start an empty store → create Owner.
2. Import the ~150-product catalogue (Inventory → Import, or use the provided
   sample/template download).
3. Receive a product into one expiry batch, then the same product into a second
   batch with a **different** expiry date.
4. Verify combined stock; sell part; verify **FEFO** deducts the earliest batch
   first and that inventory/revenue/profit update.
5. Record waste; verify inventory + reports update.
6. Trigger low stock → reorder recommendation → create a purchase order →
   receive it.
7. Export the full Excel workbook.
8. Log out and sign in on another device → same cloud data appears.

## Notes
- Auto-generated barcodes are **internal codes**, not GS1-registered.
- Expiry forecasts are **estimates**, clearly labelled, never guarantees.
- No success is shown until the write confirms; failures surface clearly with a
  safe retry path.