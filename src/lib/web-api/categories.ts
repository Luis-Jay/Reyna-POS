import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'
import { localDb, LocalCategory } from '../local-db'

function assertNoError(error: any, fallbackMessage: string) {
  if (error) {
    throw new Error(error.message || fallbackMessage)
  }
}

export const categoriesApi = {
  getAll: async () => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('catalog_categories')
        .select('id, name, sort_order, created_at, updated_at, deleted_at')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name')
        .limit(10000)
      assertNoError(error, 'Failed to load categories.')
      const results = data ?? []

      // Update local cache
      void localDb.categories.bulkPut(results.map((c: any) => ({
        id: c.id,
        business_id: businessId,
        name: c.name,
        sort_order: Number(c.sort_order ?? 0),
        updated_at: c.updated_at ?? null,
        deleted_at: c.deleted_at ?? null,
      } satisfies LocalCategory)))

      return results
    } catch {
      // Offline fallback
      try {
        const businessId = localStorage.getItem('reyna_business_id')
        if (!businessId) return []
        const cached = await localDb.categories
          .where('business_id').equals(businessId)
          .filter(c => !c.deleted_at)
          .toArray()
        cached.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
        return cached
      } catch {
        return []
      }
    }
  },

  create: async (name: string) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('catalog_categories').insert({
        id, business_id: businessId, name,
      })
      assertNoError(error, 'Failed to create category.')
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
      assertNoError(error, 'Failed to update category.')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { error: detachError } = await supabase
        .from('catalog_products')
        .update({ category_id: null, updated_at: new Date().toISOString() })
        .eq('category_id', id)
        .eq('business_id', businessId)
        .is('deleted_at', null)
      assertNoError(detachError, 'Failed to detach products from category.')

      const { error } = await supabase
        .from('catalog_categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', businessId)
      assertNoError(error, 'Failed to delete category.')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  reorder: async (ids: string[]) => {
    try {
      const businessId = await getBusinessId()
      await Promise.all(ids.map(async (id, i) => {
        const { error } = await supabase.from('catalog_categories')
          .update({ sort_order: i })
          .eq('id', id)
          .eq('business_id', businessId)
        assertNoError(error, 'Failed to reorder category.')
      }))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },
}
