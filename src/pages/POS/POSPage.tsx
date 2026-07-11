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
import { ShoppingBag, Plus, Minus, X, Search, Clock, ClipboardList, Settings, Camera, LogOut, ShoppingCart, Grid } from 'lucide-react'
import { getProductImageSrc } from '../../utils/images'
import { canAccessModule, getDefaultRouteForUser } from '../../lib/access'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
type PriceTier = { min_qty: number; price: number; label?: string | null }

export default function POSPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const homeRoute = getDefaultRouteForUser(user)
  const canAccessSales = canAccessModule(user, 'sales')
  const canAccessSettings = user?.role === 'admin'
  const cart = useCartStore()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedLetter, setSelectedLetter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [globalPriceType, setGlobalPriceType] = useState<'retail' | 'wholesale'>('retail')
  const [layout, setLayout] = useState<1|2>(2)
  const [pendingCount, setPendingCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)

  // Mobile: which panel is visible
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products')

  // Modals
  const [showCheckout, setShowCheckout] = useState(false)
  const [quantityProduct, setQuantityProduct] = useState<Product | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [showSaveOrder, setShowSaveOrder] = useState(false)
  const [showSavedOrders, setShowSavedOrders] = useState(false)
  const [showCameraScanner, setShowCameraScanner] = useState(false)

  const [tierCache, setTierCache] = useState<Record<string, PriceTier[]>>({})


  const loadProducts = useCallback(async () => {
    const filters: any = {}
    if (selectedCategory) filters.category = selectedCategory
    if (selectedLetter) filters.letter = selectedLetter
    if (search) filters.search = search
    const data = await window.api.products.getAll(filters)
    setProducts(data)
  }, [selectedCategory, selectedLetter, search])

  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => { window.api.categories.getAll().then(setCategories) }, [])
  useEffect(() => {
    window.api.orders.getPending().then((r: any[]) => setPendingCount(r.length))
    window.api.orders.getSaved().then((r: any[]) => setSavedCount(r.length))
  }, [])

  const fetchAndCacheTiers = useCallback(async (productId: string): Promise<PriceTier[]> => {
    const cached = tierCache[productId]
    if (cached !== undefined) return cached

    const tiers = ((await window.api.priceTiers.get(productId)) || []) as PriceTier[]
    setTierCache(prev => prev[productId] !== undefined ? prev : ({ ...prev, [productId]: tiers }))
    return tiers
  }, [tierCache])

  const applyTierPrice = useCallback((tiers: PriceTier[] | undefined, qty: number, basePrice: number): number => {
    if (!tiers || tiers.length === 0) return basePrice
    const best = [...tiers].filter(t => qty >= t.min_qty).sort((a, b) => b.min_qty - a.min_qty)[0]
    return best ? best.price : basePrice
  }, [])

  const needsModal = (product: Product) =>
    !!(product.has_variations || product.variation_group_id || product.allow_fractions)

  const handleScannedBarcode = useCallback(async (code: string) => {
    const product = await window.api.products.getByBarcode(code)
    if (!product) return
    if (needsModal(product)) {
      setQuantityProduct(product)
    } else {
      const tiers = await fetchAndCacheTiers(product.id)
      const retailPrice = product.retail_price ?? product.base_price
      const wholesalePrice = product.wholesale_price ?? retailPrice
      const retailUnitPrice = applyTierPrice(tiers, 1, retailPrice)
      const nextUnitPrice = globalPriceType === 'wholesale' ? wholesalePrice : retailUnitPrice
      cart.addItem({
        product_id: product.id,
        name: product.name,
        price: nextUnitPrice,
        base_price: retailPrice,
        retail_unit_price: retailUnitPrice,
        wholesale_unit_price: wholesalePrice,
        cost: product.base_cost,
        quantity: 1,
        is_custom: false,
        image_path: product.image_path,
        price_type: globalPriceType,
      })
    }
  }, [applyTierPrice, cart, fetchAndCacheTiers, globalPriceType])

  useEffect(() => {
    const off = window.api.on.barcodeScanned((code: string) => { void handleScannedBarcode(code) })
    return () => { off() }
  }, [handleScannedBarcode])

  const handleAddProduct = async (product: Product) => {
    if (needsModal(product)) {
      setQuantityProduct(product)
    } else {
      const tiers = await fetchAndCacheTiers(product.id)
      const retailPrice = product.retail_price ?? product.base_price
      const wholesalePrice = product.wholesale_price ?? retailPrice
      const retailUnitPrice = applyTierPrice(tiers, 1, retailPrice)
      const nextUnitPrice = globalPriceType === 'wholesale' ? wholesalePrice : retailUnitPrice
      cart.addItem({
        product_id: product.id,
        name: product.name,
        price: nextUnitPrice,
        base_price: retailPrice,
        retail_unit_price: retailUnitPrice,
        wholesale_unit_price: wholesalePrice,
        cost: product.base_cost,
        quantity: 1,
        is_custom: false,
        image_path: product.image_path,
        price_type: globalPriceType,
      })
    }
  }

  const handleCartQtyChange = async (item: CartItem, newQty: number) => {
    if (item.product_id && !item.is_custom) {
      if (item.price_type === 'wholesale') { cart.updateQuantity(item.id, newQty); return }

      const tiers = tierCache[item.product_id] ?? await fetchAndCacheTiers(item.product_id)
      const base = item.base_price ?? item.price
      const newPrice = applyTierPrice(tiers, newQty, base)
      cart.updateItemWithPrice(item.id, newQty, newPrice)
    } else {
      cart.updateQuantity(item.id, newQty)
    }
  }

  const handleOrderComplete = () => {
    setShowCheckout(false)
    cart.clearCart()
    loadProducts()
    setMobileView('products')
  }

  // ── Shared sub-components ──────────────────────────────────────────────────

  const ProductBrowser = (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="p-3 pb-0">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="brand-ring w-full rounded-2xl border border-emerald-900/10 bg-white/85 py-2.5 pl-11 pr-4 text-sm text-slate-700"
          />
        </div>
      </div>

      {/* Letter filter */}
      <div className="flex gap-1 px-3 pt-2 overflow-x-auto scrollbar-hide shrink-0">
        <button onClick={() => setSelectedLetter('')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${!selectedLetter ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
        >All</button>
        {LETTERS.map(l => (
          <button key={l} onClick={() => setSelectedLetter(l)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${selectedLetter === l ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
          >{l}</button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-3 pt-2 overflow-x-auto scrollbar-hide shrink-0">
        <button onClick={() => setSelectedCategory('')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${!selectedCategory ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
        >All</button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setSelectedCategory(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedCategory === c.id ? 'bg-[var(--brand-600)] text-white shadow-sm' : 'bg-white/80 text-slate-600 hover:bg-[var(--brand-50)]'}`}
          >{c.name}</button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map(p => (
            <ProductCard key={p.id} product={p} onAdd={handleAddProduct} />
          ))}
        </div>
        {products.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">No products found</div>
        )}
      </div>
    </div>
  )

  const CartPanel = (
    <div className="flex flex-1 flex-col overflow-hidden">
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
              onQty={(q) => handleCartQtyChange(item, q)}
              onRemove={() => cart.removeItem(item.id)}
            />
          ))
        )}
      </div>

      {/* Totals + actions */}
      <div className="border-t border-emerald-900/5 p-4 space-y-3">
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
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setShowCustom(true)} className="rounded-xl bg-slate-800 py-2.5 text-xs font-medium text-white flex items-center justify-center gap-1 hover:bg-slate-900">
            <Plus size={14} /> Custom
          </button>
          <button
            onClick={() => savedCount > 0 ? setShowSavedOrders(true) : setShowSaveOrder(true)}
            className="relative rounded-xl bg-amber-500 py-2.5 text-xs font-medium text-white flex items-center justify-center gap-1 hover:bg-amber-600"
          >
            <ShoppingBag size={14} /> Save
            {savedCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{savedCount}</span>}
          </button>
          <button
            onClick={() => { if (cart.items.length > 0) cart.clearCart() }}
            disabled={cart.items.length === 0}
            className="rounded-xl bg-red-500 py-2.5 text-xs font-medium text-white flex items-center justify-center gap-1 hover:bg-red-600 disabled:opacity-40"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-transparent min-w-0">

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="brand-gradient relative flex h-14 md:h-20 shrink-0 items-center gap-2 md:gap-3 overflow-hidden border-b border-white/15 px-3 md:px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%)]" />
        {homeRoute !== '/pos' && (
          <button onClick={() => navigate(homeRoute)} className="relative rounded-full border border-white/15 bg-white/10 px-2.5 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium text-white transition hover:bg-white/20">
            Back
          </button>
        )}
        <div className="relative">
          <p className="hidden md:block text-xs uppercase tracking-[0.24em] text-emerald-50/75">Selling Floor</p>
          <h1 className="text-base md:text-2xl font-semibold text-white leading-tight">Point of Sale</h1>
        </div>
        <button
          onClick={() => setGlobalPriceType(globalPriceType === 'retail' ? 'wholesale' : 'retail')}
          title="Pricing mode applies to products added from now on — items already in the cart keep their price"
          className={`relative flex items-center gap-0.5 rounded-full border border-white/20 p-1 text-xs font-bold shadow-inner transition-colors ${
            globalPriceType === 'wholesale' ? 'bg-emerald-600' : 'bg-[#1a8eff]'
          }`}
        >
          <span className={`rounded-full px-2.5 py-1.5 transition ${globalPriceType === 'retail' ? 'bg-white text-[#1a8eff] shadow' : 'text-white/70'}`}>
            Retail
          </span>
          <span className={`rounded-full px-2.5 py-1.5 transition ${globalPriceType === 'wholesale' ? 'bg-white text-emerald-600 shadow' : 'text-white/70'}`}>
            Wholesale
          </span>
        </button>
        <div className="flex-1" />
        {canAccessSales && pendingCount > 0 && (
          <button onClick={() => navigate('/orders')} className="relative flex items-center gap-1 rounded-full bg-amber-400/95 px-2.5 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm">
            <Clock size={13} /> <span className="hidden sm:inline">Pending</span>
          </button>
        )}
        {canAccessSales && (
          <button onClick={() => navigate('/orders')} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/20">
            <ClipboardList size={15} /> <span className="hidden sm:inline">Orders</span>
          </button>
        )}
        {canAccessSettings && (
          <button onClick={() => navigate('/settings')} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/20">
            <Settings size={15} /> <span className="hidden sm:inline">Config</span>
          </button>
        )}
        <button onClick={() => setShowCameraScanner(true)} className="relative flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/20">
          <Camera size={15} /> <span className="hidden sm:inline">Scan</span>
        </button>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="relative flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold tracking-wide text-white/90 transition hover:bg-red-500/40 hover:text-white"
          title="Sign out"
        >
          <span className="hidden sm:inline max-w-[80px] truncate">{user?.name?.toUpperCase()}</span>
          <LogOut size={13} />
        </button>
      </div>

      {/* ── MOBILE layout (< md) ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden md:hidden">
        {/* Panel: products */}
        {mobileView === 'products' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="glass-panel flex flex-1 flex-col overflow-hidden">
              {ProductBrowser}
            </div>

            {/* Floating checkout bar when cart has items */}
            {cart.items.length > 0 && (
              <div className="shrink-0 bg-white/80 backdrop-blur border-t border-emerald-900/8 px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">{cart.items.length} item{cart.items.length !== 1 ? 's' : ''}</p>
                  <p className="font-bold text-slate-800 text-base">{formatCurrency(cart.total())}</p>
                </div>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="rounded-2xl bg-[var(--brand-600)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
                >
                  Checkout
                </button>
              </div>
            )}
          </div>
        )}

        {/* Panel: cart */}
        {mobileView === 'cart' && (
          <div className="glass-panel flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-emerald-900/5 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/70">Ticket</p>
                <span className="font-semibold text-slate-800">Current Order</span>
              </div>
            </div>
            {CartPanel}
          </div>
        )}

        {/* Bottom tab bar */}
        <div className="shrink-0 grid grid-cols-2 border-t border-emerald-900/8 bg-white/95 backdrop-blur">
          <button
            onClick={() => setMobileView('products')}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${mobileView === 'products' ? 'text-[var(--brand-600)]' : 'text-slate-400'}`}
          >
            <Grid size={20} />
            Products
          </button>
          <button
            onClick={() => setMobileView('cart')}
            className={`relative flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${mobileView === 'cart' ? 'text-[var(--brand-600)]' : 'text-slate-400'}`}
          >
            <ShoppingCart size={20} />
            Cart
            {cart.items.length > 0 && (
              <span className="absolute top-2 right-[calc(50%-20px)] bg-[var(--brand-600)] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {cart.items.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── DESKTOP layout (>= md) ────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 gap-4 overflow-hidden p-4 min-w-0">
        {layout === 2 ? (
          <>
            {/* Left: product browser */}
            <div className="glass-panel flex flex-1 flex-col overflow-hidden rounded-[30px] min-w-0">
              {ProductBrowser}
            </div>

            {/* Right: cart */}
            <div className="glass-strong flex w-80 flex-col rounded-[30px] min-w-0">
              <div className="flex items-center justify-between border-b border-emerald-900/5 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700/70">Ticket</p>
                  <span className="font-semibold text-slate-800">Current Order</span>
                </div>
                <button onClick={() => setLayout(1)} className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-medium text-[var(--brand-700)]">Layout 1</button>
              </div>
              {CartPanel}
            </div>
          </>
        ) : (
          /* Layout 1 */
          <div className="relative flex-1 flex flex-col overflow-hidden p-3 pr-[21rem] min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setLayout(2)} className="rounded-full bg-[var(--brand-50)] px-3 py-1 text-xs font-medium text-[var(--brand-700)]">Layout 2</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.items.map(item => (
                <CartRow key={item.id} item={item}
                  onQty={(q) => handleCartQtyChange(item, q)}
                  onRemove={() => cart.removeItem(item.id)}
                  large
                />
              ))}
              {cart.items.length === 0 && <p className="py-8 text-center text-slate-400">Cart is empty</p>}
            </div>
            <div className="glass-strong absolute right-4 top-4 bottom-4 flex w-80 flex-col rounded-[28px] p-4 min-w-0">
              <h3 className="mb-2 font-semibold text-slate-700">Add Products</h3>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search Product..."
                className="brand-ring mb-2 w-full rounded-2xl border border-emerald-900/10 bg-white/80 px-3 py-2 text-sm"
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {products.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-2xl p-2 transition hover:bg-emerald-50/80">
                    <div className="h-10 w-10 overflow-hidden rounded-xl bg-gray-100 shrink-0">
                      {p.image_path && <img src={getProductImageSrc(p.image_path)} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-[var(--brand-700)]">R ₱{(p.retail_price ?? p.base_price).toFixed(2)}</p>
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
          initialPriceType={globalPriceType}
          cachedTiers={quantityProduct ? tierCache[quantityProduct.id] : undefined}
          loadTiers={fetchAndCacheTiers}
          onClose={() => setQuantityProduct(null)}
          onAdd={(item) => {
            cart.addItem(item)
            setQuantityProduct(null)
          }}
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

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void | Promise<void> }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-emerald-900/8 bg-white/82 shadow-[0_8px_20px_rgba(22,49,39,0.06)] transition duration-200 active:scale-95 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(22,49,39,0.10)]">
      <div className="aspect-square overflow-hidden bg-[linear-gradient(180deg,#f4faf6_0%,#e7f4eb_100%)]">
        {product.image_path ? (
          <img src={getProductImageSrc(product.image_path)} className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-emerald-200">?</div>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-xs font-semibold text-slate-800 leading-snug">{product.name}</p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">₱{(product.retail_price ?? product.base_price).toFixed(2)}</p>
        {(product.wholesale_price ?? 0) > 0 && (product.wholesale_price ?? 0) !== (product.retail_price ?? product.base_price) && (
          <p className="text-[11px] font-medium text-emerald-600">W ₱{(product.wholesale_price ?? 0).toFixed(2)}</p>
        )}
        <button
          onClick={() => onAdd(product)}
          className="mt-2 w-full rounded-xl border border-emerald-900/8 bg-[var(--brand-50)] py-1.5 text-[11px] font-semibold text-[var(--brand-700)] transition hover:bg-[var(--brand-600)] hover:text-white active:scale-95"
        >+ Add</button>
      </div>
    </div>
  )
}

function CartRow({ item, onQty, onRemove, large }: { item: CartItem; onQty: (q: number) => void; onRemove: () => void; large?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${large ? 'rounded-[22px] bg-white/80 px-4 py-3 shadow-sm' : 'border-b border-emerald-900/5 px-3 py-2.5'}`}>
      {item.image_path && (
        <div className="h-9 w-9 overflow-hidden rounded-xl bg-gray-100 shrink-0">
          <img src={getProductImageSrc(item.image_path)} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
        <p className="text-xs text-slate-400">
          {item.quantity} × ₱{item.price}
          {item.price_type === 'wholesale' && <span className="ml-1 text-amber-600 font-semibold">★W</span>}
          {' = '}<span className="font-bold text-[var(--brand-700)]">₱{item.subtotal.toFixed(0)}</span>
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => onQty(item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-700)] hover:bg-[var(--brand-100)] active:scale-90">
          <Minus size={12} />
        </button>
        <span className="text-sm font-semibold w-7 text-center">{item.quantity}</span>
        <button onClick={() => onQty(item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-700)] hover:bg-[var(--brand-100)] active:scale-90">
          <Plus size={12} />
        </button>
        <button onClick={onRemove} className="ml-1 flex h-7 w-7 items-center justify-center text-slate-300 hover:text-red-500 active:scale-90">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
