import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ProductForm } from '../components/ProductForm'
import { useDataStore } from '../store/appStore'
import type { Product } from '../types'

export default function AddProduct() {
  const location = useLocation()
  const navigate = useNavigate()
  const products = useDataStore((s) => s.products)
  const refresh = useDataStore((s) => s.refresh)
  const editing = (location.state as any)?.product as Product | undefined
  const preseedBarcode = (location.state as any)?.barcode as string | undefined

  const onSaved = async (p: Product) => {
    await refresh()
    navigate(`/products/${p.id}`, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="btn-secondary !p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-2xl font-extrabold text-textprimary">{editing ? 'Edit product' : 'Add product'}</h1>
          <p className="text-sm text-textmuted">Prices are in Australian dollars and stored precisely in cents.</p>
        </div>
      </div>
      <ProductForm
        product={editing}
        initial={preseedBarcode ? { name: '', barcode: preseedBarcode, sku: '', category: '', brand: '', supplierId: '', cost: '', sell: '', minStock: '5', targetStock: '15', unit: 'each', aisle: '', shelf: '', notes: '', expiryTracking: 'optional' } : undefined}
        onSaved={onSaved}
        onCancel={() => navigate(-1)}
        submitLabel={editing ? 'Save changes' : 'Create product'} />
    </div>
  )
}