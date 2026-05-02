import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const priceTiersApi = {
  get: async (productId: string) => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('catalog_product_price_tiers')
        .select('*')
        .eq('product_id', productId)
        .eq('business_id', businessId)
        .order('min_qty')
      return data ?? []
    } catch {
      return []
    }
  },

  set: async (productId: string, tiers: { min_qty: number; price: number; label?: string }[]) => {
    try {
      const businessId = await getBusinessId()
      // Replace all tiers for this product
      await supabase.from('catalog_product_price_tiers')
        .delete().eq('product_id', productId).eq('business_id', businessId)

      if (tiers.length > 0) {
        await supabase.from('catalog_product_price_tiers').insert(
          tiers.map(t => ({
            id: uuid(),
            business_id: businessId,
            product_id: productId,
            min_qty: t.min_qty,
            price: t.price,
            label: t.label || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
        )
      }
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  delete: async (productId: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_product_price_tiers')
        .delete().eq('product_id', productId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
