import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/layout/TopBar'
import { Category, Product } from '../../types'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'

export default function CategoriesPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [newCat, setNewCat] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = async () => {
    const [cats, prods] = await Promise.all([
      window.api.categories.getAll(),
      window.api.products.getAll(),
    ])
    setCategories(cats)
    setProducts(prods)
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newCat.trim()) return
    await window.api.categories.create(newCat.trim())
    setNewCat('')
    load()
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return
    await window.api.categories.update(id, editName.trim())
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Products will become uncategorized.')) return
    await window.api.categories.delete(id)
    load()
  }

  const productsByCategory = (catId: string | null) =>
    products.filter(p => catId ? p.category_id === catId : !p.category_id)

  const uncategorized = productsByCategory(null)

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TopBar title="Manage Categories" back="/products" />
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Uncategorized */}
        {uncategorized.length > 0 && (
          <Section title="Uncategorized Products" products={uncategorized} onNavigate={navigate} />
        )}

        {/* Each category */}
        {categories.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
              {editingId === cat.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                    autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdate(cat.id)} />
                  <button onClick={() => handleUpdate(cat.id)} className="text-green-500 hover:text-green-600"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-800">{cat.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(cat.id); setEditName(cat.name) }} className="text-gray-400 hover:text-[#1a8eff]"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(cat.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 p-4">
              {productsByCategory(cat.id).map(p => (
                <button key={p.id} onClick={() => navigate(`/products/${p.id}/edit`)}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg text-left">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                    {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{cat.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Add category */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Add New Category</p>
          <div className="flex gap-2">
            <input value={newCat} onChange={e => setNewCat(e.target.value)}
              placeholder="Category name..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            <button onClick={handleAdd}
              className="bg-[#1a8eff] text-white px-4 rounded-lg font-medium text-sm hover:bg-[#0077e6] flex items-center gap-1">
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, products, onNavigate }: { title: string; products: Product[]; onNavigate: any }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        {products.map(p => (
          <button key={p.id} onClick={() => onNavigate(`/products/${p.id}/edit`)}
            className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg text-left">
            <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
              {p.image_path && <img src={getProductImageSrc(p.image_path)} alt={p.name} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">No Category</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
