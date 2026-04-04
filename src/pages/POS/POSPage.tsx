import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../../stores/cart.store'
import { useAuthStore } from '../../stores/auth.store'
import { Product, Category, CartItem, SavedOrder } from '../../types'
import { formatCurrency } from '../../utils/format'
import CheckoutModal from './CheckoutModal'
import QuantityModal from './QuantityModal'
import CustomItemModal from './CustomItemModal'
import SaveOrderModal from './SaveOrderModal'
import SavedOrdersModal from './SavedOrdersModal'
import { ShoppingBag, Camera, Plus, Minus, X, Search, LayoutGrid, List, Clock, ClipboardList, Settings } from 'lucide-react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function POSPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const cart = useCartStore()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedLetter, setSelectedLetter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<1|2>(2)
  const [pendingCount, setPendingCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)

  // Modals
  const [showCheckout, setShowCheckout] = useState(false)
  const [quantityProduct, setQuantityProduct] = useState<Product | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [showSaveOrder, setShowSaveOrder] = useState(false)
  const [showSavedOrders, setShowSavedOrders] = useState(false)

  // Page
  const [page, setPage] = useState(1)
  const PER_PAGE = 20
  const totalPages = Math.ceil(products.length / PER_PAGE)
  const visibleProducts = products.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const loadProducts = useCallback(async () => {
    const filters: any = {}
    if (selectedCategory) filters.category = selectedCategory
    if (selectedLetter) filters.letter = selectedLetter
    if (search) filters.search = search
    const data = await window.api.products.getAll(filters)
    setProducts(data)
    setPage(1)
  }, [selectedCategory, selectedLetter, search])

  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => { window.api.categories.getAll().then(setCategories) }, [])
  useEffect(() => {
    window.api.orders.getPending().then((r: any[]) => setPendingCount(r.length))
    window.api.orders.getSaved().then((r: any[]) => setSavedCount(r.length))
  }, [])

  // Barcode scanner
  useEffect(() => {
    const off = window.api.on.barcodeScanned(async (code: string) => {
      const product = await window.api.products.getByBarcode(code)
      if (product) {
        if (product.has_variations || product.allow_fractions) {
          setQuantityProduct(product)
        } else {
          cart.addItem({ product_id: product.id, name: product.name, price: product.base_price, cost: product.base_cost, quantity: 1, is_custom: false, image_path: product.image_path })
        }
      }
    })
    return () => { off() }
  }, [])

  const handleAddProduct = (product: Product) => {
    if (product.has_variations || product.allow_fractions) {
      setQuantityProduct(product)
    } else {
      cart.addItem({ product_id: product.id, name: product.name, price: product.base_price, cost: product.base_cost, quantity: 1, is_custom: false, image_path: product.image_path })
    }
  }

  const handleOrderComplete = () => {
    setShowCheckout(false)
    cart.clearCart()
    loadProducts()
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-14 bg-[#1a8eff] flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-white hover:text-blue-200">
          ← Point of Sale
        </button>
        <div className="flex-1" />
        {pendingCount > 0 && (
          <button onClick={() => navigate('/orders')} className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
            <Clock size={14} /> Pending
          </button>
        )}
        <button onClick={() => navigate('/orders')} className="text-white text-sm flex items-center gap-1 hover:text-blue-200">
          <ClipboardList size={16} /> Orders
        </button>
        <button onClick={() => navigate('/settings')} className="text-white text-sm flex items-center gap-1 hover:text-blue-200">
          <Settings size={16} /> Config
        </button>
        <span className="text-white text-xs opacity-70">{user?.name?.toUpperCase()}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Layout 2: Product grid left, cart right */}
        {layout === 2 ? (
          <>
            {/* Left: product browser */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Search */}
              <div className="p-3 pb-0">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search Product..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
                  />
                </div>
              </div>

              {/* Letter filter */}
              <div className="flex gap-1 px-3 pt-2 overflow-x-auto scrollbar-hide shrink-0">
                <button
                  onClick={() => { setSelectedLetter(''); setPage(1) }}
                  className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${!selectedLetter ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >All</button>
                {LETTERS.map(l => (
                  <button key={l} onClick={() => { setSelectedLetter(l); setPage(1) }}
                    className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${selectedLetter === l ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{l}</button>
                ))}
              </div>

              {/* Category filter */}
              <div className="flex gap-2 px-3 pt-2 overflow-x-auto scrollbar-hide shrink-0">
                <button onClick={() => { setSelectedCategory(''); setPage(1) }}
                  className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${!selectedCategory ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >All</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCategory(c.id); setPage(1) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${selectedCategory === c.id ? 'bg-[#1a8eff] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{c.name}</button>
                ))}
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {visibleProducts.map(p => (
                    <ProductCard key={p.id} product={p} onAdd={handleAddProduct} />
                  ))}
                </div>
                {products.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-12">No products found</div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-3 border-t text-sm text-gray-600">
                  <span>Showing {(page-1)*PER_PAGE+1}-{Math.min(page*PER_PAGE,products.length)} of {products.length}</span>
                  <button onClick={() => setPage(1)} disabled={page===1} className="px-2 disabled:opacity-30">«</button>
                  <button onClick={() => setPage(p => p-1)} disabled={page===1} className="px-2 disabled:opacity-30">‹</button>
                  <span>Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => p+1)} disabled={page===totalPages} className="px-2 disabled:opacity-30">›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 disabled:opacity-30">»</button>
                </div>
              )}
            </div>

            {/* Right: current order */}
            <div className="w-72 border-l bg-white flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-gray-700">Current Order</span>
                <button onClick={() => setLayout(1)} className="text-xs text-gray-400 hover:text-gray-600">Layout 1</button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto">
                {cart.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <Plus size={32} className="mb-2 opacity-40" />
                    <p className="text-sm">Select items to start</p>
                  </div>
                ) : (
                  cart.items.map(item => (
                    <CartRow key={item.id} item={item}
                      onQty={(q) => cart.updateQuantity(item.id, q)}
                      onRemove={() => cart.removeItem(item.id)}
                    />
                  ))
                )}
              </div>

              {/* Totals */}
              <div className="border-t p-4 space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Total</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(cart.total())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. Profit</span>
                  <span className="text-green-600 font-medium">{formatCurrency(cart.estimatedProfit())}</span>
                </div>
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={cart.items.length === 0}
                  className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold hover:bg-green-600 active:scale-95 transition-all disabled:opacity-40"
                >Checkout</button>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => {}} className="bg-[#1a8eff] text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-[#0077e6]">
                    <Camera size={14} /> Camera
                  </button>
                  <button onClick={() => setShowCustom(true)} className="bg-purple-600 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-purple-700">
                    <Plus size={14} /> Custom
                  </button>
                  <button
                    onClick={() => savedCount > 0 ? setShowSavedOrders(true) : setShowSaveOrder(true)}
                    className="bg-yellow-600 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-yellow-700 relative"
                  >
                    <ShoppingBag size={14} /> Save
                    {savedCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{savedCount}</span>}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Layout 1: list sidebar on right */
          <div className="flex-1 flex flex-col overflow-hidden p-3">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setLayout(2)} className="text-xs text-gray-500 hover:text-gray-700">Layout 2</button>
            </div>
            {/* Cart items list view */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.items.map(item => (
                <CartRow key={item.id} item={item}
                  onQty={(q) => cart.updateQuantity(item.id, q)}
                  onRemove={() => cart.removeItem(item.id)}
                  large
                />
              ))}
              {cart.items.length === 0 && (
                <p className="text-gray-400 text-center py-8">Cart is empty</p>
              )}
            </div>
            {/* Right sidebar search */}
            <div className="w-80 absolute right-0 top-14 bottom-0 border-l bg-white flex flex-col p-3">
              <h3 className="font-semibold text-gray-700 mb-2">Add Products</h3>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Product..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {products.slice(0, 15).map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                      {p.image_path && <img src={`file://${p.image_path}`} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-[#1a8eff]">₱{p.base_price.toFixed(2)}</p>
                    </div>
                    <button onClick={() => handleAddProduct(p)} className="text-xs bg-blue-50 text-[#1a8eff] px-2 py-1 rounded-lg hover:bg-blue-100">+ Add</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold text-gray-800">{formatCurrency(cart.total())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. Profit</span>
                  <span className="text-green-600 font-medium">{formatCurrency(cart.estimatedProfit())}</span>
                </div>
                <button onClick={() => setShowCheckout(true)} disabled={cart.items.length === 0}
                  className="w-full bg-green-500 text-white py-2.5 rounded-xl font-semibold disabled:opacity-40">Checkout</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowCustom(true)} className="bg-purple-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-purple-700">+ Custom Item</button>
                  <button onClick={() => setShowSaveOrder(true)} className="bg-yellow-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-yellow-700">Save Order</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCheckout && (
        <CheckoutModal onClose={() => setShowCheckout(false)} onComplete={handleOrderComplete} />
      )}
      {quantityProduct && (
        <QuantityModal
          product={quantityProduct}
          onClose={() => setQuantityProduct(null)}
          onAdd={(item) => { cart.addItem(item); setQuantityProduct(null) }}
        />
      )}
      {showCustom && (
        <CustomItemModal
          onClose={() => setShowCustom(false)}
          onAdd={(item) => { cart.addItem(item); setShowCustom(false) }}
        />
      )}
      {showSaveOrder && (
        <SaveOrderModal
          onClose={() => setShowSaveOrder(false)}
          onSave={async (name) => {
            await window.api.orders.saveCart({ name, items: cart.items, total: cart.total() })
            cart.clearCart()
            setSavedCount(c => c + 1)
            setShowSaveOrder(false)
          }}
        />
      )}
      {showSavedOrders && (
        <SavedOrdersModal
          onClose={() => setShowSavedOrders(false)}
          onLoad={(saved) => {
            cart.clearCart()
            const items = JSON.parse(saved.items_json)
            items.forEach((i: CartItem) => cart.addItem(i))
            window.api.orders.deleteSaved(saved.id)
            setSavedCount(c => Math.max(0, c - 1))
            setShowSavedOrders(false)
          }}
          onDelete={(id) => {
            window.api.orders.deleteSaved(id)
            setSavedCount(c => Math.max(0, c - 1))
          }}
        />
      )}
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gray-100 overflow-hidden">
        {product.image_path ? (
          <img src={`file://${product.image_path}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">?</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-800 truncate">{product.name}</p>
        <p className="text-xs text-gray-500">₱{product.base_price.toFixed(2)}</p>
        <button
          onClick={() => onAdd(product)}
          className="mt-1.5 w-full bg-gray-50 hover:bg-[#1a8eff] hover:text-white text-gray-600 text-xs py-1 rounded-lg border border-gray-200 hover:border-[#1a8eff] transition-colors"
        >+ Add</button>
      </div>
    </div>
  )
}

function CartRow({ item, onQty, onRemove, large }: { item: CartItem; onQty: (q: number) => void; onRemove: () => void; large?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${large ? 'bg-white rounded-xl px-4 py-3 shadow-sm' : 'px-3 py-2 border-b border-gray-50'}`}>
      {item.image_path && (
        <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0">
          <img src={`file://${item.image_path}`} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400">{item.quantity} x {item.price} = <span className="text-[#1a8eff] font-bold">{item.subtotal.toFixed(0)}</span></p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onQty(item.quantity - 1)} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
          <Minus size={12} />
        </button>
        <span className="text-sm font-semibold w-8 text-center">{item.quantity}</span>
        <button onClick={() => onQty(item.quantity + 1)} className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
          <Plus size={12} />
        </button>
        <button onClick={onRemove} className="w-6 h-6 text-gray-400 hover:text-red-500 flex items-center justify-center ml-1">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
