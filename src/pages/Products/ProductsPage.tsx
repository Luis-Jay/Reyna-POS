import { Navigate, useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Plus, Tag, Type, Barcode, DollarSign, LayoutGrid } from 'lucide-react'

export default function ProductsPage() {
  const navigate = useNavigate()

  const topActions = (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate('/products/add')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <Plus size={14} /> Add Product
      </button>
      <button onClick={() => navigate('/products/prices')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <Tag size={14} /> Edit Prices
      </button>
      <button onClick={() => navigate('/products/prices?tab=names')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <Type size={14} /> Edit Names
      </button>
      <button onClick={() => navigate('/products/prices?tab=barcodes')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <Barcode size={14} /> Edit Barcodes
      </button>
      <button onClick={() => navigate('/products/prices?tab=costs')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <DollarSign size={14} /> Edit Costs
      </button>
      <button onClick={() => navigate('/products/categories')}
        className="rounded-full bg-white/12 px-3 py-2 text-xs font-medium text-white flex items-center gap-1 transition hover:bg-white/20">
        <LayoutGrid size={14} /> Categories
      </button>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Bulk Edit Prices" back="/" actions={topActions} />
      <BulkEditInline />
    </div>
  )
}

// Inline bulk edit — this is the default view when you land on /products
function BulkEditInline() {
  return <Navigate to="/products/prices" replace />
}
