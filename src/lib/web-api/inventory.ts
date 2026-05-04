import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

type StockBatchRow = {
  id: string
  product_id: string
  remaining_quantity: number
  unit_cost: number
  retail_price: number
  wholesale_price: number | null
  received_at: string
  note?: string | null
  source_order_id?: string | null
}

function stockStatus(qty: number, threshold: number): 'out' | 'critical' | 'low' | 'safe' {
  if (qty <= 0) return 'out'
  if (qty <= threshold * 0.5) return 'critical'
  if (qty <= threshold) return 'low'
  return 'safe'
}

function normalizeInventoryRow(product: any) {
  const inventory = product.catalog_inventory?.[0]
  const quantity = Number(inventory?.quantity ?? 0)
  const lowThreshold = Number(inventory?.low_threshold ?? 5)
  const trackInventory = !!product.track_inventory

  return {
    id: inventory?.id ?? `missing-${product.id}`,
    product_id: product.id,
    product_name: product.name ?? '',
    image_path: product.image_url ?? product.image_data ?? null,
    barcode: product.barcode ?? null,
    base_price: Number(product.base_price ?? 0),
    base_cost: Number(product.base_cost ?? 0),
    retail_price: Number(product.retail_price ?? product.base_price ?? 0),
    wholesale_price: Number(product.wholesale_price ?? product.retail_price ?? product.base_price ?? 0),
    quantity,
    low_threshold: lowThreshold,
    monthly_sold: Number(product.monthly_sold ?? 0),
    updated_at: inventory?.updated_at ?? product.updated_at ?? new Date().toISOString(),
    status: stockStatus(quantity, lowThreshold),
    category_name: product.catalog_categories?.name ?? null,
    description: product.description ?? null,
    has_variations: product.has_variations ? 1 : 0,
    variation_group_id: product.variation_group_id ?? null,
    variation_group_name: product.catalog_variation_groups?.name ?? null,
    track_inventory: trackInventory ? 1 : 0,
  }
}

function normalizeBatch(batch: StockBatchRow) {
  return {
    id: batch.id,
    quantity: Number(batch.remaining_quantity ?? 0),
    unit_cost: Number(batch.unit_cost ?? 0),
    retail_price: Number(batch.retail_price ?? 0),
    wholesale_price: Number(batch.wholesale_price ?? batch.retail_price ?? 0),
    received_at: batch.received_at ?? '',
    note: batch.note ?? null,
    source_order_id: batch.source_order_id ?? null,
  }
}

function mapBatchesByProduct(rows: StockBatchRow[] | null | undefined) {
  const batchesByProduct: Record<string, ReturnType<typeof normalizeBatch>[]> = {}
  for (const row of rows ?? []) {
    if (Number(row.remaining_quantity ?? 0) <= 0) continue
    const list = batchesByProduct[row.product_id] ?? []
    list.push(normalizeBatch(row))
    batchesByProduct[row.product_id] = list
  }

  for (const productId of Object.keys(batchesByProduct)) {
    batchesByProduct[productId].sort((a, b) => {
      const receivedDiff = new Date(a.received_at || 0).getTime() - new Date(b.received_at || 0).getTime()
      if (receivedDiff !== 0) return receivedDiff
      return a.id.localeCompare(b.id)
    })
  }

  return batchesByProduct
}

function applyActiveBatchPricing<T extends {
  product_id: string
  base_price?: number
  base_cost?: number
  retail_price?: number
  wholesale_price?: number
}>(row: T, batchesByProduct: Record<string, ReturnType<typeof normalizeBatch>[]>) {
  const batches = batchesByProduct[row.product_id] ?? []
  const activeBatch = batches[0]
  const priceTiers = batches

  if (!activeBatch) {
    return {
      ...row,
      price_tiers: priceTiers,
      price_tier_count: priceTiers.length,
    }
  }

  return {
    ...row,
    base_cost: activeBatch.unit_cost,
    base_price: activeBatch.retail_price,
    retail_price: activeBatch.retail_price,
    wholesale_price: activeBatch.wholesale_price ?? activeBatch.retail_price,
    price_tiers: priceTiers,
    price_tier_count: priceTiers.length,
  }
}

async function fetchProducts(businessId: string) {
  // Try with image_url first; fall back without it if the column doesn't exist yet
  const full = await supabase
    .from('catalog_products')
    .select(`
      id, name, image_url, image_data, barcode, base_price, base_cost, retail_price,
      wholesale_price, monthly_sold, description, updated_at, is_active, deleted_at,
      track_inventory, has_variations, variation_group_id,
      catalog_categories(name),
      catalog_variation_groups(name)
    `)
    .eq('business_id', businessId)
  if (!full.error) return full

  // image_url column may not be in PostgREST schema cache yet — retry without it
  console.warn('[inventory] catalog_products query failed, retrying without image_url:', full.error.message)
  return supabase
    .from('catalog_products')
    .select(`
      id, name, image_data, barcode, base_price, base_cost, retail_price, wholesale_price,
      monthly_sold, description, updated_at, is_active, deleted_at, track_inventory,
      has_variations, variation_group_id,
      catalog_categories(name),
      catalog_variation_groups(name)
    `)
    .eq('business_id', businessId)
}

export const inventoryApi = {
  getAll: async (filter?: string) => {
    try {
      const businessId = await getBusinessId()
      const [productsRes, inventoryRes, batchesRes] = await Promise.all([
        fetchProducts(businessId),
        supabase
          .from('catalog_inventory')
          .select('id, product_id, quantity, low_threshold, updated_at')
          .eq('business_id', businessId),
        supabase
          .from('stock_batches')
          .select('id, product_id, remaining_quantity, unit_cost, retail_price, wholesale_price, received_at, note, source_order_id')
          .eq('business_id', businessId)
          .gt('remaining_quantity', 0)
          .order('received_at', { ascending: true }),
      ])
      if (productsRes.error) {
        console.error('[inventory] catalog_products error:', productsRes.error)
        throw productsRes.error
      }
      if (inventoryRes.error) {
        console.error('[inventory] catalog_inventory error:', inventoryRes.error)
        throw inventoryRes.error
      }
      if (batchesRes.error) {
        console.error('[inventory] stock_batches error:', batchesRes.error)
        throw batchesRes.error
      }

      const invMap: Record<string, any> = {}
      for (const inv of inventoryRes.data ?? []) invMap[inv.product_id] = inv
      const batchesByProduct = mapBatchesByProduct(batchesRes.data as StockBatchRow[] | undefined)

      const merged = (productsRes.data ?? []).map(p => ({
        ...p,
        catalog_inventory: invMap[p.id] ? [invMap[p.id]] : [],
      }))

      let rows = merged
        .filter(p => !p.deleted_at && p.is_active)
        .map(normalizeInventoryRow)
        .map(row => applyActiveBatchPricing(row, batchesByProduct))

      if (filter === 'Low Stock' || filter === 'low') {
        rows = rows.filter(r => r.track_inventory && (r.status === 'low' || r.status === 'critical' || r.status === 'out'))
      } else if (filter === 'Out of Stock' || filter === 'out') {
        rows = rows.filter(r => r.track_inventory && r.status === 'out')
      } else if (filter === 'Critical' || filter === 'critical') {
        rows = rows.filter(r => r.track_inventory && r.status === 'critical')
      } else if (filter === 'Fast Moving') {
        rows = [...rows].sort((a, b) => (b.monthly_sold ?? 0) - (a.monthly_sold ?? 0))
      } else {
        rows = [...rows].sort((a, b) => a.product_name.localeCompare(b.product_name))
      }

      return rows
    } catch (err: any) {
      console.error('[inventory] getAll error:', err?.message ?? err)
      return []
    }
  },

  getReport: async () => {
    try {
      const businessId = await getBusinessId()
      const [productsRes, inventoryRes, categoriesRes, batchesRes] = await Promise.all([
        supabase
          .from('catalog_products')
          .select('id, name, barcode, description, category_id, retail_price, wholesale_price, base_cost, monthly_sold, is_active, deleted_at, track_inventory, updated_at')
          .eq('business_id', businessId),
        supabase
          .from('catalog_inventory')
          .select('id, product_id, quantity, low_threshold, updated_at')
          .eq('business_id', businessId),
        supabase
          .from('catalog_categories')
          .select('id, name')
          .eq('business_id', businessId),
        supabase
          .from('stock_batches')
          .select('id, product_id, remaining_quantity, unit_cost, retail_price, wholesale_price, received_at, note, source_order_id')
          .eq('business_id', businessId)
          .gt('remaining_quantity', 0)
          .order('received_at', { ascending: true }),
      ])
      if (productsRes.error) throw productsRes.error
      if (inventoryRes.error) throw inventoryRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (batchesRes.error) throw batchesRes.error

      const invMap: Record<string, any> = {}
      for (const inv of inventoryRes.data ?? []) invMap[inv.product_id] = inv
      const catMap: Record<string, string> = {}
      for (const cat of categoriesRes.data ?? []) catMap[cat.id] = cat.name
      const batchesByProduct = mapBatchesByProduct(batchesRes.data as StockBatchRow[] | undefined)

      const data = (productsRes.data ?? []).map(p => ({
        ...p,
        catalog_inventory: invMap[p.id] ? [invMap[p.id]] : [],
        catalog_categories: p.category_id ? { name: catMap[p.category_id] ?? null } : null,
      }))

      return data
        .filter(p => !p.deleted_at && p.is_active && p.track_inventory)
        .map(product => {
          const row = applyActiveBatchPricing(normalizeInventoryRow(product), batchesByProduct)
          return {
            barcode: row.barcode,
            product_id: row.product_id,
            product_name: row.product_name,
            category_name: row.category_name,
            quantity: row.quantity,
            low_threshold: row.low_threshold,
            retail_price: row.retail_price,
            wholesale_price: row.wholesale_price,
            base_cost: row.base_cost,
            description: row.description,
            monthly_sold: row.monthly_sold,
            status: row.status,
            stock_value: row.quantity * row.base_cost,
            potential_revenue: row.quantity * row.retail_price,
            price_tiers: row.price_tiers ?? [],
          }
        })
    } catch {
      return []
    }
  },

  addStock: async (productId: string, qty: number, note?: string, pricing?: any) => {
    try {
      const businessId = await getBusinessId()
      const [{ data: inv }, { data: product }] = await Promise.all([
        supabase
          .from('catalog_inventory')
          .select('quantity')
          .eq('product_id', productId)
          .eq('business_id', businessId)
          .single(),
        supabase
          .from('catalog_products')
          .select('base_cost, retail_price, wholesale_price')
          .eq('id', productId)
          .eq('business_id', businessId)
          .single(),
      ])

      const newQty = (inv?.quantity ?? 0) + qty
      if (inv) {
        await supabase.from('catalog_inventory')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('product_id', productId).eq('business_id', businessId)
      } else {
        await supabase.from('catalog_inventory').insert({
          id: uuid(), business_id: businessId, product_id: productId,
          quantity: qty, low_threshold: 5,
        })
      }

      const unitCost = Number(pricing?.unit_cost ?? product?.base_cost ?? 0)
      const retailPrice = Number(pricing?.retail_price ?? product?.retail_price ?? 0)
      const wholesalePrice = Number(pricing?.wholesale_price ?? product?.wholesale_price ?? retailPrice)

      await supabase.from('stock_batches').insert({
        id: uuid(),
        business_id: businessId,
        product_id: productId,
        initial_quantity: qty,
        remaining_quantity: qty,
        unit_cost: unitCost,
        retail_price: retailPrice,
        wholesale_price: wholesalePrice,
        note: note || 'Manual stock add',
      })

      if ((inv?.quantity ?? 0) <= 0) {
        await supabase
          .from('catalog_products')
          .update({
            base_cost: unitCost,
            base_price: retailPrice,
            retail_price: retailPrice,
            wholesale_price: wholesalePrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', productId)
          .eq('business_id', businessId)
      }

      // Log stock movement
      await supabase.from('stock_movements').insert({
        id: uuid(), business_id: businessId, product_id: productId,
        type: 'restock', quantity: qty, note: note || null,
      }).select()

      return { success: true, newQuantity: newQty }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  setStock: async (productId: string, qty: number, note?: string) => {
    try {
      const businessId = await getBusinessId()
      const { data: inv } = await supabase
        .from('catalog_inventory')
        .select('quantity')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .single()

      const diff = qty - (inv?.quantity ?? 0)

      if (inv) {
        await supabase.from('catalog_inventory')
          .update({ quantity: qty, updated_at: new Date().toISOString() })
          .eq('product_id', productId).eq('business_id', businessId)
      } else {
        await supabase.from('catalog_inventory').insert({
          id: uuid(), business_id: businessId, product_id: productId,
          quantity: qty, low_threshold: 5,
        })
      }

      await supabase.from('stock_movements').insert({
        id: uuid(), business_id: businessId, product_id: productId,
        type: 'adjustment', quantity: diff, note: note || null,
      }).select()

      return { success: true, newQuantity: qty }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getMovements: async (productId: string) => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    } catch {
      return []
    }
  },

  setThreshold: async (productId: string, threshold: number) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_inventory')
        .update({ low_threshold: threshold })
        .eq('product_id', productId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
