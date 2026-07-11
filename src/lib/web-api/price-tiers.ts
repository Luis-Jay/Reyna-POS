import { supabase } from '../supabase'
import { getBusinessId } from './context'
import { assertProAccess, getProAccessState } from './pro-access'

export const priceTiersApi = {
  get: async (productId: string) => {
    try {
      const access = await getProAccessState()
      if (!access.activated) return []
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('price_tiers')
        .select('id, product_id, business_id, min_qty, price, label')
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
      await assertProAccess('Price tiers are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      // Replace all tiers for this product
      await supabase.from('price_tiers')
        .delete().eq('product_id', productId).eq('business_id', businessId)

      if (tiers.length > 0) {
        await supabase.from('price_tiers').insert(
          tiers.map(t => ({
            business_id: businessId,
            product_id: productId,
            min_qty: t.min_qty,
            price: t.price,
            label: t.label || null,
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
      await assertProAccess('Price tiers are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      await supabase.from('price_tiers')
        .delete().eq('product_id', productId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
