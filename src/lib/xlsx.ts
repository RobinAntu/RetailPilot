import * as XLSX from 'xlsx'
import type { Product, Sale, StockBatch, Supplier, WasteRecord } from '../types'
import { fromCents, toCents } from './money'
import { todayISO } from './date'

// ---------------------------------------------------------------------
// CSV / Excel helpers
// ---------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename + '.csv')
}

export function downloadXlsx(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename + '.xlsx')
}

// ---------------------------------------------------------------------
// Product catalogue import
// ---------------------------------------------------------------------
export interface ImportResult {
  validRows: Product[]
  warnings: { row: number; message: string }[]
  errors: { row: number; message: string }[]
  preview: { name: string; barcode: string; category: string; costCents: number; sellCents: number }[]
}

const CATEGORY_MAP: Record<string, string> = {
  dairy: 'Dairy', meat: 'Meat & Seafood', chilled: 'Chilled', bakery: 'Bakery', pantry: 'Pantry',
  beverage: 'Beverages', produce: 'Produce', frozen: 'Frozen', snacks: 'Snacks', household: 'Household',
  personalcare: 'Personal Care', baby: 'Baby', cleaning: 'Cleaning',
}

export async function parseProductImport(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
  const result: ImportResult = { validRows: [], warnings: [], errors: [], preview: [] }
  const seen: Record<string, number> = {}

  rows.forEach((raw, idx) => {
    const rowNum = idx + 2 // header on row 1
    const s = (k: string) => {
      const key = Object.keys(raw).find((x) => x.toLowerCase() === k.toLowerCase())
      return key ? String(raw[key] ?? '').trim() : ''
    }
    const name = s('Product Name') || s('ProductName') || s('Name')
    const barcode = s('Barcode') || s('Bar Code') || s('Product ID')
    const categoryRaw = s('Category')
    const costStr = s('Cost Price') || s('CostPrice')
    const sellStr = s('Selling Price') || s('SellingPrice')
    const unit = s('Unit')
    const qty = s('Required Quantity') || s('Minimum Stock') || s('MinStock')

    if (!name) {
      result.errors.push({ row: rowNum, message: 'Missing Product Name.' })
      return
    }
    const cost = toCents(parseFloat(String(costStr).replace(/[^0-9.]/g, '')) || 0)
    const sell = toCents(parseFloat(String(sellStr).replace(/[^0-9.]/g, '')) || 0)
    if (sell <= 0) {
      result.errors.push({ row: rowNum, message: `"${name}" has no valid Selling Price.` })
      return
    }
    if (barcode && seen[barcode]) {
      result.warnings.push({ row: rowNum, message: `Duplicate barcode ${barcode}.` })
    }
    seen[barcode] = seen[barcode] || 0
    if (barcode) seen[barcode]++

    const category = CATEGORY_MAP[(categoryRaw || '').toLowerCase()] || categoryRaw || 'Uncategorised'
    const product: Product = {
      id: 'p_' + Math.random().toString(36).slice(2, 10),
      storeId: '',
      name, barcode, sku: s('SKU') || barcode,
      category, brand: s('Brand'), supplierId: '', supplierName: s('Supplier'),
      costCents: cost, sellCents: sell,
      minStock: parseInt(qty || '5', 10) || 5,
      targetStock: parseInt(qty || '5', 10) * 3 || 15,
      unit: unit || 'each', aisle: s('Aisle'), shelf: s('Shelf'), notes: s('Notes'),
      expiryTracking: categoryShortLife(category) ? 'required' : 'optional',
      active: true, createdAt: todayISO(), updatedAt: todayISO(),
      totalStock: 0, stockValueCents: 0, salesHistory: [],
    }
    result.validRows.push(product)
    result.preview.push({ name, barcode, category, costCents: cost, sellCents: sell })
  })
  return result
}

function categoryShortLife(category: string): boolean {
  return ['Dairy', 'Meat & Seafood', 'Bread', 'Bakery', 'Produce', 'Frozen'].includes(category)
}

export const importHeaders = [
  'Product Name', 'Barcode', 'SKU', 'Category', 'Brand', 'Supplier', 'Unit',
  'Cost Price', 'Selling Price', 'Required Quantity', 'Aisle', 'Shelf', 'Notes',
]