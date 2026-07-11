import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

function shouldFallbackToClientFlow(error: any, fnName: string) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes(fnName.toLowerCase()) && (
    message.includes('could not find the function')
    || message.includes('does not exist')
    || message.includes('schema cache')
  )
}

export const debtorsApi = {
  getAll: async (filters?: { search?: string; hasBalance?: boolean }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('sales_debtors')
        .select('id, name, phone, business_id, balance, total_credit, total_paid, last_reminder_at, created_at, updated_at, deleted_at')
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
        .select('id, name, phone, business_id, balance, total_credit, total_paid, last_reminder_at, created_at, updated_at, deleted_at')
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
      const { error } = await supabase.rpc('add_debtor_transaction', {
        p_business_id: businessId,
        p_transaction_id: id,
        p_debtor_id: tx.debtor_id,
        p_type: tx.type,
        p_amount: tx.amount ?? 0,
        p_note: tx.note || null,
        p_order_id: tx.order_id || null,
        p_user_id: tx.user_id || null,
      })
      if (error && !shouldFallbackToClientFlow(error, 'add_debtor_transaction')) {
        return { success: false, error: error.message }
      }

      if (error) {
        const { error: insertError } = await supabase.from('sales_debtor_transactions').insert({
          id,
          business_id: businessId,
          debtor_id: tx.debtor_id,
          type: tx.type,
          amount: tx.amount,
          profit: 0,
          note: tx.note || null,
          order_id: tx.order_id || null,
          user_id: tx.user_id || null,
        })
        if (insertError) return { success: false, error: insertError.message }

        if (tx.type === 'debt') {
          const { data: debtor } = await supabase.from('sales_debtors')
            .select('balance, total_credit')
            .eq('id', tx.debtor_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('sales_debtors').update({
            balance: Number(debtor?.balance ?? 0) + Number(tx.amount ?? 0),
            total_credit: Number(debtor?.total_credit ?? 0) + Number(tx.amount ?? 0),
            updated_at: new Date().toISOString(),
          }).eq('id', tx.debtor_id).eq('business_id', businessId)
        } else if (tx.type === 'payment') {
          const { data: debtor } = await supabase.from('sales_debtors')
            .select('balance, total_paid')
            .eq('id', tx.debtor_id)
            .eq('business_id', businessId)
            .single()

          await supabase.from('sales_debtors').update({
            balance: Math.max(0, Number(debtor?.balance ?? 0) - Number(tx.amount ?? 0)),
            total_paid: Number(debtor?.total_paid ?? 0) + Number(tx.amount ?? 0),
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
        .select('id, debtor_id, business_id, type, amount, profit, note, order_id, user_id, created_at')
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
