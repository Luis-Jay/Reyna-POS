import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const categoriesApi = {
  getAll: async () => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('catalog_categories')
        .select('*')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data ?? []
    } catch {
      return []
    }
  },

  create: async (name: string) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('catalog_categories').insert({
        id, business_id: businessId, name,
      })
      if (error) return { success: false, error: error.message }
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  update: async (id: string, name: string) => {
    try {
      const businessId = await getBusinessId()
      const { error } = await supabase
        .from('catalog_categories')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', businessId)
      if (error) return { success: false }
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { error } = await supabase
        .from('catalog_categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', businessId)
      if (error) return { success: false }
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  reorder: async (ids: string[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(ids.map((id, i) =>
        supabase.from('catalog_categories')
          .update({ sort_order: i })
          .eq('id', id)
          .eq('business_id', businessId)
      ))
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
