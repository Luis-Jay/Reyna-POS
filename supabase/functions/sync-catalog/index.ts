import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type CatalogPayload = {
  categories?: any[]
  variationGroups?: any[]
  variationOptions?: any[]
  products?: any[]
  inventory?: any[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return json({ error: 'Business not found. Complete setup first.' }, 404)
    }

    if (req.method === 'POST') {
      const payload = await req.json() as CatalogPayload
      const businessId = business.id

      const categories = Array.isArray(payload.categories) ? payload.categories : []
      const variationGroups = Array.isArray(payload.variationGroups) ? payload.variationGroups : []
      const variationOptions = Array.isArray(payload.variationOptions) ? payload.variationOptions : []
      const products = Array.isArray(payload.products) ? payload.products : []
      const inventory = Array.isArray(payload.inventory) ? payload.inventory : []

      if (categories.length > 0) {
        const validCategories = categories.filter(c => typeof c.id === 'string' && c.id.trim())
        const { error } = await supabase.from('catalog_categories').upsert(
          validCategories.map(category => ({
            id: category.id,
            business_id: businessId,
            name: category.name,
            sort_order: category.sort_order ?? 0,
            deleted_at: category.deleted_at ?? null,
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) return json({ error: `Failed to sync categories: ${error.message}` }, 500)
      }

      if (variationGroups.length > 0) {
        const validVariationGroups = variationGroups.filter(g => typeof g.id === 'string' && g.id.trim())
        const { error } = await supabase.from('catalog_variation_groups').upsert(
          validVariationGroups.map(group => ({
            id: group.id,
            business_id: businessId,
            name: group.name,
            deleted_at: group.deleted_at ?? null,
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) return json({ error: `Failed to sync variation groups: ${error.message}` }, 500)
      }

      if (variationOptions.length > 0) {
        const validVariationOptions = variationOptions.filter(o => typeof o.id === 'string' && o.id.trim())
        const { error } = await supabase.from('catalog_variation_options').upsert(
          validVariationOptions.map(option => ({
            id: option.id,
            business_id: businessId,
            group_id: option.group_id,
            name: option.name,
            price: option.price ?? 0,
            cost: option.cost ?? 0,
            sort_order: option.sort_order ?? 0,
            deleted_at: option.deleted_at ?? null,
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) return json({ error: `Failed to sync variation options: ${error.message}` }, 500)
      }

      if (products.length > 0) {
        const validProducts = products.filter(p => typeof p.id === 'string' && p.id.trim())

        // Upload images to Storage and collect URLs
        const imageUrls = new Map<string, string>()
        for (const product of validProducts) {
          if (!product.image_data || typeof product.image_data !== 'string') continue
          try {
            const match = product.image_data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
            if (!match) continue
            const [, mimeType, base64] = match
            const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
            const fileName = `${businessId}/${product.id}.${ext}`
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
            const { error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(fileName, bytes, { contentType: mimeType, upsert: true })
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName)
              imageUrls.set(product.id, publicUrl)
            }
          } catch { /* skip failed image uploads silently */ }
        }

        const { error } = await supabase.from('catalog_products').upsert(
          validProducts.map(product => ({
            id: product.id,
            business_id: businessId,
            name: product.name,
            description: product.description ?? null,
            image_url: imageUrls.get(product.id) ?? product.image_url ?? null,
            barcode: product.barcode ?? null,
            category_id: product.category_id ?? null,
            base_price: product.retail_price ?? product.base_price ?? 0,
            retail_price: product.retail_price ?? product.base_price ?? 0,
            wholesale_price: product.wholesale_price ?? product.retail_price ?? product.base_price ?? 0,
            base_cost: product.base_cost ?? 0,
            markup_pct: product.markup_pct ?? null,
            has_variations: Boolean(product.has_variations),
            variation_group_id: product.variation_group_id ?? null,
            allow_fractions: Boolean(product.allow_fractions),
            track_inventory: Boolean(product.track_inventory),
            is_active: product.is_active !== 0,
            sort_order: product.sort_order ?? 0,
            monthly_sold: product.monthly_sold ?? 0,
            created_at: product.created_at ?? new Date().toISOString(),
            updated_at: product.updated_at ?? new Date().toISOString(),
            deleted_at: product.deleted_at ?? null,
          }))
        )
        if (error) return json({ error: `Failed to sync products: ${error.message}` }, 500)
      }

      if (inventory.length > 0) {
        const validInventory = inventory.filter(
          i =>
            typeof i.id === 'string' &&
            i.id.trim() &&
            typeof i.product_id === 'string' &&
            i.product_id.trim(),
        )

        const productIds = [...new Set(validInventory.map(item => item.product_id))]
        const existingInventoryByProduct = new Map<string, { id: string }>()

        if (productIds.length > 0) {
          const { data: existingInventory, error: existingInventoryError } = await supabase
            .from('catalog_inventory')
            .select('id, product_id')
            .eq('business_id', businessId)
            .in('product_id', productIds)

          if (existingInventoryError) {
            return json({ error: `Failed to read existing inventory: ${existingInventoryError.message}` }, 500)
          }

          for (const row of existingInventory ?? []) {
            existingInventoryByProduct.set(row.product_id, { id: row.id })
          }
        }

        // Deduplicate by product_id — keep the latest entry per product.
        // Two local rows for the same product would both resolve to the same
        // cloud id and cause a primary key conflict on upsert.
        const deduped = new Map<string, object>()
        for (const item of validInventory) {
          const cloudId = existingInventoryByProduct.get(item.product_id)?.id ?? item.id
          deduped.set(item.product_id, {
            id: cloudId,
            business_id: businessId,
            product_id: item.product_id,
            quantity: item.quantity ?? 0,
            low_threshold: item.low_threshold ?? 5,
            updated_at: item.updated_at ?? new Date().toISOString(),
          })
        }

        const { error } = await supabase.from('catalog_inventory').upsert(
          Array.from(deduped.values()),
          { onConflict: 'id' },
        )
        if (error) return json({ error: `Failed to sync inventory: ${error.message}` }, 500)
      }

      return json({ success: true })
    }

    if (req.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const businessId = business.id

    const [
      { data: categories, error: categoriesError },
      { data: variationGroups, error: variationGroupsError },
      { data: variationOptions, error: variationOptionsError },
      { data: products, error: productsError },
      { data: inventory, error: inventoryError },
    ] = await Promise.all([
      supabase.from('catalog_categories').select('*').eq('business_id', businessId).order('sort_order'),
      supabase.from('catalog_variation_groups').select('*').eq('business_id', businessId).order('name'),
      supabase.from('catalog_variation_options').select('*').eq('business_id', businessId).order('sort_order'),
      supabase.from('catalog_products').select('*').eq('business_id', businessId).order('sort_order'),
      supabase.from('catalog_inventory').select('*').eq('business_id', businessId),
    ])

    const firstError = categoriesError || variationGroupsError || variationOptionsError || productsError || inventoryError
    if (firstError) {
      return json({ error: firstError.message }, 500)
    }

    return json({
      categories: categories ?? [],
      variationGroups: variationGroups ?? [],
      variationOptions: variationOptions ?? [],
      products: products ?? [],
      inventory: inventory ?? [],
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
