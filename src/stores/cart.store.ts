import { create } from 'zustand'
import { CartItem } from '../types'
import { v4 as uuid } from 'uuid'

interface CartState {
  items: CartItem[]
  customerName: string
  discount: number
  addItem: (item: Omit<CartItem, 'id' | 'subtotal'>) => void
  updateQuantity: (id: string, quantity: number) => void
  updateItemWithPrice: (id: string, quantity: number, price: number) => void
  removeItem: (id: string) => void
  setCustomerName: (name: string) => void
  setDiscount: (amount: number) => void
  clearCart: () => void
  total: () => number
  subtotal: () => number
  estimatedProfit: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerName: '',
  discount: 0,

  addItem: (item) => {
    const { items } = get()
    // If same product + not custom, merge qty
    if (item.product_id && !item.is_custom) {
      const existing = items.find(
        i =>
          i.product_id === item.product_id &&
          !i.is_custom &&
          (i.price_type ?? 'retail') === (item.price_type ?? 'retail') &&
          i.price === item.price
      )
      if (existing) {
        set({
          items: items.map(i =>
            i.id === existing.id
              ? { ...i, quantity: i.quantity + item.quantity, subtotal: (i.quantity + item.quantity) * i.price }
              : i
          ),
        })
        return
      }
    }
    const newItem: CartItem = {
      ...item,
      base_price: item.base_price ?? item.price,
      id: uuid(),
      subtotal: item.quantity * item.price,
    }
    set({ items: [...items, newItem] })
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id)
      return
    }
    set({
      items: get().items.map(i =>
        i.id === id ? { ...i, quantity, subtotal: quantity * i.price } : i
      ),
    })
  },

  updateItemWithPrice: (id, quantity, price) => {
    if (quantity <= 0) {
      get().removeItem(id)
      return
    }
    set({
      items: get().items.map(i =>
        i.id === id ? { ...i, quantity, price, subtotal: quantity * price } : i
      ),
    })
  },

  removeItem: (id) => set({ items: get().items.filter(i => i.id !== id) }),

  setCustomerName: (name) => set({ customerName: name }),
  setDiscount: (amount) => set({ discount: amount }),

  clearCart: () => set({ items: [], customerName: '', discount: 0 }),

  subtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
  total: () => Math.max(0, get().subtotal() - get().discount),
  estimatedProfit: () =>
    get().items.reduce((s, i) => s + (i.price - i.cost) * i.quantity, 0) - get().discount,
}))
