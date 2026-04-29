import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const expensesApi = {
  getAll: async (filters?: { from?: string; to?: string; category?: string }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('business_id', businessId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters?.from) query = query.gte('date', filters.from)
      if (filters?.to) query = query.lte('date', filters.to)
      if (filters?.category) query = query.eq('category', filters.category)

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    } catch {
      return []
    }
  },

  create: async (data: { category: string; description?: string; amount: number; date: string }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('expenses').insert({
        id, business_id: businessId,
        category: data.category || 'Other',
        description: data.description || '',
        amount: data.amount,
        date: data.date,
      })
      if (error) return { success: false, error: error.message }
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  update: async (id: string, data: any) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('expenses')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('expenses').delete().eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  getSummary: async (period: 'today' | 'week' | 'month' | 'year') => {
    try {
      const businessId = await getBusinessId()
      const now = new Date()
      let from = ''
      if (period === 'today') from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
      else if (period === 'week') from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(now.getTime() - 6 * 86400000))
      else if (period === 'month') from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      else from = `${now.getFullYear()}-01-01`

      const { data } = await supabase
        .from('expenses')
        .select('category, amount')
        .eq('business_id', businessId)
        .gte('date', from)

      const byCat: Record<string, number> = {}
      let total = 0
      for (const e of data ?? []) {
        byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
        total += e.amount
      }

      const rows = Object.entries(byCat).map(([category, amt]) => ({ category, total: amt })).sort((a, b) => b.total - a.total)
      return { rows, total }
    } catch {
      return { rows: [], total: 0 }
    }
  },
}
