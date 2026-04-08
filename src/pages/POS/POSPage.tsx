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
import CameraScannerModal from './CameraScannerModal'
import { ShoppingBag, Plus, Minus, X, Search, Clock, ClipboardList, Settings, Camera } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'

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
  const [showCameraScanner, setShowCameraScanner] = useState(false)

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

  const handleScannedBarcode = useCallback(async (code: string) => {
    const product = await window.api.products.getByBarcode(code)
    if (!product) return

    if (product.has_variations || product.allow_fractions) {
      setQuantityProduct(product)
    } else {
      cart.addItem({
        product_id: product.id,
        name: product.name,
        price: product.base_price,
        cost: product.base_cost,
        quantity: 1,
        is_custom: false,
        image_path: product.image_path,
      })
    }
  }, [cart])

  // Hardware barcode scanner
  useEffect(() => {
    const off = window.api.on.barcodeScanned((code: string) => {
      void handleScannedBarcode(code)
    })
    return () => { off() }
  }, [handleScannedBarcode])

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
    <div className="h-screen flex flex-col overflow-hidden bg-transparent">
      {/* Top bar */}
      <div className="brand-gradient relative flex h-20 shrink-0 items-center gap-3 overflow-hidden border-b border-white/15 px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%)]" />
        <button onClick={() => navigate('/')} className="relative rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
          Back
        </button>
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-50/75">Selling Floor</p>
          <h1 className="text-2xl font-semibold text-white">Point of Sale</h1>
        </div>
        <div className="flex-1" />
        {pendingCount > 0 && (
          <button onClick={() => navigate('/orders')} className="relative flex items-center gap-1 rounded-full bg-amber-400/95 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm">
            <Clock size={14} /> Pending
          </button>
        )}
        <button onClick={() => navigate('/orders')} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20">
          <ClipboardList size={16} /> Orders
        </button>
        <button onClick={() => navigate('/settings')} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20">
          <Settings size={16} /> Config
        </button>
        <button onClick={() => setShowCameraScanner(true)} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20">
          <Camera size={16} /> Scan
        </button>
        <span className="relative rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-white/90">{user?.name?.toUpperCase()}</span>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Layout 2: Product grid left, cart right */}
        {layout === 2 ? (
          <>
            {/* Left: product browser */}
            <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-[30px]">
              {/* Search */}
              <div className="p-4 pb-0">
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search products..."
                    className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 py-3 pl-11 pr-4 text-sm text-slate-700"
                  />
                </div>
              </div>

              {/* Letter filter */}
              <div className="flex gap-1 px-4 pt-3 overflow-x-auto scrollbar-hide shrink-0">
                <button
                  onClick={() => { setSelectedLetter(''); setPage(1) }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${!selectedLetter ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
                >All</button>
                {LETTERS.map(l => (
                  <button key={l} onClick={() => { setSelectedLetter(l); setPage(1) }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedLetter === l ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
                  >{l}</button>
                ))}
              </div>

              {/* Category filter */}
              <div className="flex gap-2 px-4 pt-3 overflow-x-auto scrollbar-hide shrink-0">
                <button onClick={() => { setSelectedCategory(''); setPage(1) }}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${!selectedCategory ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
                >All</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCategory(c.id); setPage(1) }}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${selectedCategory === c.id ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
                  >{c.name}</button>
                ))}
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {visibleProducts.map(p => (
                    <ProductCard key={p.id} product={p} onAdd={handleAddProduct} />
                  ))}
                </div>
                {products.length === 0 && (
                  <div className="py-16 text-center text-sm text-slate-400">No products found</div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-emerald-900/5 p-4 text-sm text-slate-600">
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
            <div className="glass-strong flex w-80 flex-col rounded-[30px]">
              <div className="flex items-center justify-between border-b border-emerald-900/5 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/70">Ticket</p>
                  <span className="font-semibold text-slate-800">Current Order</span>
                </div>
                <button onClick={() => setLayout(1)} className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-medium text-[var(--brand-700)]">Layout 1</button>
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto">
                {cart.items.length === 0 ? (
                  <div className="flex h-52 flex-col items-center justify-center text-slate-400">
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
              <div className="border-t border-emerald-900/5 p-5 space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Total</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(cart.total())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Est. Profit</span>
                  <span className="text-green-600 font-medium">{formatCurrency(cart.estimatedProfit())}</span>
                </div>
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={cart.items.length === 0}
                  className="w-full rounded-2xl bg-[var(--brand-600)] py-3 text-white font-semibold shadow-[0_14px_30px_rgba(27,125,75,0.22)] transition hover:bg-[var(--brand-700)] active:scale-95 disabled:opacity-40"
                >Checkout</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowCustom(true)} className="rounded-xl bg-slate-800 py-2 text-xs font-medium text-white flex items-center justify-center gap-1 hover:bg-slate-900">
                    <Plus size={14} /> Custom
                  </button>
                  <button
                    onClick={() => savedCount > 0 ? setShowSavedOrders(true) : setShowSaveOrder(true)}
                    className="relative rounded-xl bg-amber-500 py-2 text-xs font-medium text-white flex items-center justify-center gap-1 hover:bg-amber-600"
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
              <button onClick={() => setLayout(2)} className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-medium text-[var(--brand-700)]">Layout 2</button>
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
                <p className="py-8 text-center text-slate-400">Cart is empty</p>
              )}
            </div>
            {/* Right sidebar search */}
            <div className="glass-strong absolute right-4 top-24 bottom-4 flex w-80 flex-col rounded-[28px] p-4">
              <h3 className="mb-2 font-semibold text-slate-700">Add Products</h3>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Product..."
                className="brand-ring mb-2 w-full rounded-2xl border border-emerald-900/10 bg-white/80 px-3 py-2 text-sm"
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {products.slice(0, 15).map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-2xl p-2 transition hover:bg-emerald-50/80">
                    <div className="h-10 w-10 overflow-hidden rounded-xl bg-gray-100 shrink-0">
                      {p.image_path && <img src={getProductImageSrc(p.image_path)} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-[var(--brand-700)]">₱{p.base_price.toFixed(2)}</p>
                    </div>
                    <button onClick={() => handleAddProduct(p)} className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-semibold text-[var(--brand-700)] hover:bg-[var(--brand-100)]">+ Add</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-bold text-slate-800">{formatCurrency(cart.total())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Est. Profit</span>
                  <span className="text-green-600 font-medium">{formatCurrency(cart.estimatedProfit())}</span>
                </div>
                <button onClick={() => setShowCheckout(true)} disabled={cart.items.length === 0}
                  className="w-full rounded-2xl bg-[var(--brand-600)] py-2.5 font-semibold text-white disabled:opacity-40">Checkout</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setShowCustom(true)} className="rounded-xl bg-slate-800 py-2 text-xs font-medium text-white hover:bg-slate-900">+ Custom Item</button>
                  <button onClick={() => setShowSaveOrder(true)} className="rounded-xl bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600">Save Order</button>
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
      {showCameraScanner && (
        <CameraScannerModal
          onClose={() => setShowCameraScanner(false)}
          onDetected={async (code) => {
            await handleScannedBarcode(code)
            setShowCameraScanner(false)
          }}
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
    <div className="overflow-hidden rounded-[24px] border border-emerald-900/8 bg-white/82 shadow-[0_16px_30px_rgba(22,49,39,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_35px_rgba(22,49,39,0.10)]">
      <div className="aspect-square overflow-hidden bg-[linear-gradient(180deg,#f4faf6_0%,#e7f4eb_100%)]">
        {product.image_path ? (
          <img src={getProductImageSrc(product.image_path)} className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-emerald-200">?</div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">₱{product.base_price.toFixed(2)}</p>
        <button
          onClick={() => onAdd(product)}
          className="mt-3 w-full rounded-2xl border border-emerald-900/8 bg-[var(--brand-50)] py-2 text-xs font-semibold text-[var(--brand-700)] transition hover:bg-[var(--brand-600)] hover:text-white"
        >+ Add</button>
      </div>
    </div>
  )
}

function CartRow({ item, onQty, onRemove, large }: { item: CartItem; onQty: (q: number) => void; onRemove: () => void; large?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${large ? 'rounded-[22px] bg-white/80 px-4 py-3 shadow-sm' : 'border-b border-emerald-900/5 px-4 py-3'}`}>
      {item.image_path && (
        <div className="h-10 w-10 overflow-hidden rounded-xl bg-gray-100 shrink-0">
          <img src={getProductImageSrc(item.image_path)} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
        <p className="text-xs text-slate-400">{item.quantity} x {item.price} = <span className="font-bold text-[var(--brand-700)]">{item.subtotal.toFixed(0)}</span></p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onQty(item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-700)] hover:bg-[var(--brand-100)]">
          <Minus size={12} />
        </button>
        <span className="text-sm font-semibold w-8 text-center">{item.quantity}</span>
        <button onClick={() => onQty(item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-700)] hover:bg-[var(--brand-100)]">
          <Plus size={12} />
        </button>
        <button onClick={onRemove} className="ml-1 flex h-7 w-7 items-center justify-center text-slate-400 hover:text-red-500">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
