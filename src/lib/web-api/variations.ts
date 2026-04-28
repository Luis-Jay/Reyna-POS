import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const variationsApi = {
  getGroups: async () => {
    try {
      const businessId = await getBusinessId()
      const { data: groups, error } = await supabase
        .from('catalog_variation_groups')
        .select('*, catalog_variation_options(*)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return (groups ?? []).map(g => ({
        ...g,
        options: (g.catalog_variation_options ?? [])
          .filter((o: any) => !o.deleted_at)
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
      }))
    } catch {
      return []
    }
  },

  createGroup: async (name: string) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('catalog_variation_groups').insert({
        id, business_id: businessId, name,
      })
      if (error) return { success: false }
      return { success: true, id }
    } catch {
      return { success: false }
    }
  },

  updateGroup: async (id: string, name: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_variation_groups')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  deleteGroup: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_variation_groups')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  addOption: async (groupId: string, data: { name: string; price?: number; cost?: number }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('catalog_variation_options').insert({
        id, business_id: businessId, group_id: groupId,
        name: data.name, price: data.price ?? 0, cost: data.cost ?? 0,
      })
      if (error) return { success: false }
      return { success: true, id }
    } catch {
      return { success: false }
    }
  },

  updateOption: async (id: string, data: { name?: string; price?: number; cost?: number }) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_variation_options')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  deleteOption: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('catalog_variation_options')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
