import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const debtorsApi = {
  getAll: async (filters?: { search?: string; hasBalance?: boolean }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('sales_debtors')
        .select('*')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('name')

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
      }
      if (filters?.hasBalance) {
        query = query.gt('balance', 0)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    } catch {
      return []
    }
  },

  getById: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('sales_debtors')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single()
      if (error) return null
      return data
    } catch {
      return null
    }
  },

  create: async (data: { name: string; phone?: string }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('sales_debtors').insert({
        id, business_id: businessId,
        name: data.name,
        phone: data.phone || null,
        balance: 0, total_credit: 0, total_paid: 0,
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
      const { error } = await supabase.from('sales_debtors')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      if (error) return { success: false }
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  delete: async (id: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('sales_debtors')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  addTransaction: async (tx: {
    debtor_id: string
    type: 'debt' | 'payment' | 'note'
    amount: number
    note?: string
    order_id?: string
    user_id?: string
  }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      await supabase.from('sales_debtor_transactions').insert({
        id, business_id: businessId,
        debtor_id: tx.debtor_id,
        type: tx.type,
        amount: tx.amount,
        profit: 0,
        note: tx.note || null,
        order_id: tx.order_id || null,
        user_id: tx.user_id || null,
      })

      // Update debtor balance
      if (tx.type === 'debt') {
        await supabase.from('sales_debtors').update({
          balance: supabase.rpc('increment', { x: tx.amount }) as any,
          total_credit: supabase.rpc('increment', { x: tx.amount }) as any,
          updated_at: new Date().toISOString(),
        }).eq('id', tx.debtor_id).eq('business_id', businessId)
      } else if (tx.type === 'payment') {
        const { data: debtor } = await supabase.from('sales_debtors')
          .select('balance, total_paid').eq('id', tx.debtor_id).single()
        if (debtor) {
          await supabase.from('sales_debtors').update({
            balance: Math.max(0, debtor.balance - tx.amount),
            total_paid: debtor.total_paid + tx.amount,
            updated_at: new Date().toISOString(),
          }).eq('id', tx.debtor_id).eq('business_id', businessId)
        }
      }

      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getTransactions: async (debtorId: string, filter?: string) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('sales_debtor_transactions')
        .select('*')
        .eq('debtor_id', debtorId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })

      if (filter) query = query.eq('type', filter)

      const { data } = await query
      return data ?? []
    } catch {
      return []
    }
  },

  markReminder: async (debtorId: string, _note?: string) => {
    try {
      const businessId = await getBusinessId()
      await supabase.from('sales_debtors').update({
        last_reminder_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', debtorId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
