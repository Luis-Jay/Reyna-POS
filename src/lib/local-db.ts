import Dexie, { type Table } from 'dexie'

export interface LocalProduct {
  id: string
  business_id: string
  name: string
  description: string | null
  image_url: string | null
  barcode: string | null
  category_id: string | null
  base_price: number
  retail_price: number
  wholesale_price: number | null
  base_cost: number
  markup_pct: number | null
  has_variations: number
  variation_group_id: string | null
  allow_fractions: number
  track_inventory: number
  is_active: number
  sort_order: number
  monthly_sold: number
  basic_locked: number
  updated_at: string
  deleted_at: string | null
  // flattened from catalog_inventory join
  stock: number | null
  category_name: string | null
}

export interface LocalCategory {
  id: string
  business_id: string
  name: string
  sort_order: number
  updated_at: string | null
  deleted_at: string | null
}

export interface LocalInventory {
  product_id: string
  business_id: string
  quantity: number
  low_threshold: number
  updated_at: string
}

export interface QueuedOrder {
  id: string
  business_id: string
  order_number: string
  payload: string  // JSON-stringified full order payload (orderData + items)
  synced: 0 | 1
  created_at: string
  sync_error: string | null
}

class ReynaLocalDB extends Dexie {
  products!: Table<LocalProduct>
  categories!: Table<LocalCategory>
  inventory!: Table<LocalInventory>
  orders_queue!: Table<QueuedOrder>

  constructor() {
    super('reyna_pos')
    this.version(1).stores({
      products: 'id, business_id, deleted_at, is_active',
      categories: 'id, business_id, deleted_at',
      inventory: 'product_id, business_id',
      orders_queue: 'id, business_id, synced, created_at',
    })
  }
}

export const localDb = new ReynaLocalDB()

export async function getLocalPendingOrderCount(businessId: string): Promise<number> {
  return localDb.orders_queue
    .where({ business_id: businessId, synced: 0 })
    .count()
}

export async function decrementLocalInventory(
  businessId: string,
  productId: string,
  qty: number,
) {
  const row = await localDb.inventory.get(productId)
  if (row && row.business_id === businessId) {
    await localDb.inventory.update(productId, {
      quantity: Math.max(0, row.quantity - qty),
    })
  }
}

export async function incrementLocalInventory(
  businessId: string,
  productId: string,
  qty: number,
) {
  const row = await localDb.inventory.get(productId)
  if (row && row.business_id === businessId) {
    await localDb.inventory.update(productId, {
      quantity: row.quantity + qty,
    })
  }
}
