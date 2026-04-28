import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'

export const shiftsApi = {
  timeIn: async (data: { userId: string; startMoney: number; note?: string }) => {
    try {
      const businessId = await getBusinessId()
      // Check for existing open shift
      const { data: existing } = await supabase
        .from('cashier_shifts')
        .select('id')
        .eq('business_id', businessId)
        .eq('user_id', data.userId)
        .is('time_out', null)
        .limit(1)

      if (existing && existing.length > 0) {
        return { success: false, error: 'Cashier already has an open shift.' }
      }

      const id = uuid()
      const { error } = await supabase.from('cashier_shifts').insert({
        id, business_id: businessId,
        user_id: data.userId,
        start_money: data.startMoney,
        note: data.note || null,
        petty_cash_total: 0,
      })
      if (error) return { success: false, error: error.message }
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  timeOut: async (data: { shiftId: string; endMoney: number; note?: string }) => {
    try {
      const businessId = await getBusinessId()
      const { error } = await supabase.from('cashier_shifts')
        .update({
          time_out: new Date().toISOString(),
          end_money: data.endMoney,
          note: data.note || null,
        })
        .eq('id', data.shiftId)
        .eq('business_id', businessId)
        .is('time_out', null)
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getActive: async (userId?: string) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('cashier_shifts')
        .select('*, cashiers(name)')
        .eq('business_id', businessId)
        .is('time_out', null)
        .order('time_in', { ascending: false })

      if (userId) query = query.eq('user_id', userId)

      const { data } = await query
      return (data ?? []).map(s => ({ ...s, cashier_name: (s.cashiers as any)?.name ?? '' }))
    } catch {
      return []
    }
  },

  getAll: async (filters?: { userId?: string; from?: string; to?: string }) => {
    try {
      const businessId = await getBusinessId()
      let query = supabase
        .from('cashier_shifts')
        .select('*, cashiers(name)')
        .eq('business_id', businessId)
        .order('time_in', { ascending: false })
        .limit(100)

      if (filters?.userId) query = query.eq('user_id', filters.userId)
      if (filters?.from) query = query.gte('time_in', `${filters.from}T00:00:00`)
      if (filters?.to) query = query.lte('time_in', `${filters.to}T23:59:59`)

      const { data } = await query
      return (data ?? []).map(s => ({ ...s, cashier_name: (s.cashiers as any)?.name ?? '' }))
    } catch {
      return []
    }
  },

  addPettyCash: async (data: { shiftId: string; description: string; amount: number }) => {
    try {
      const businessId = await getBusinessId()
      const id = uuid()
      await supabase.from('petty_cash').insert({
        id, business_id: businessId,
        shift_id: data.shiftId,
        description: data.description,
        amount: data.amount,
      })
      // Update shift petty_cash_total
      const { data: shift } = await supabase
        .from('cashier_shifts').select('petty_cash_total').eq('id', data.shiftId).single()
      await supabase.from('cashier_shifts')
        .update({ petty_cash_total: (shift?.petty_cash_total ?? 0) + data.amount })
        .eq('id', data.shiftId).eq('business_id', businessId)
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  getPettyCash: async (shiftId: string) => {
    try {
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('petty_cash')
        .select('*')
        .eq('shift_id', shiftId)
        .eq('business_id', businessId)
        .order('created_at')
      return data ?? []
    } catch {
      return []
    }
  },
}
