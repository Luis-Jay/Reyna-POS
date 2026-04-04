import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Plus, Tag, Type, Barcode, DollarSign, LayoutGrid } from 'lucide-react'

export default function ProductsPage() {
  const navigate = useNavigate()

  const topActions = (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate('/products/add')}
        className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-green-600">
        <Plus size={14} /> Add Product
      </button>
      <button onClick={() => navigate('/products/prices')}
        className="bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-purple-600">
        <Tag size={14} /> Edit Prices
      </button>
      <button onClick={() => navigate('/products/prices?tab=names')}
        className="bg-pink-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-pink-600">
        <Type size={14} /> Edit Names
      </button>
      <button onClick={() => navigate('/products/prices?tab=barcodes')}
        className="bg-fuchsia-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-fuchsia-700">
        <Barcode size={14} /> Edit Barcodes
      </button>
      <button onClick={() => navigate('/products/prices?tab=costs')}
        className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-orange-600">
        <DollarSign size={14} /> Edit Costs
      </button>
      <button onClick={() => navigate('/products/categories')}
        className="bg-teal-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-teal-600">
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
  const navigate = useNavigate()
  // Redirect to bulk edit prices
  navigate('/products/prices', { replace: true })
  return null
}
