import { v4 as uuid } from 'uuid'
import { supabase } from '../supabase'
import { getBusinessId } from './context'
import { assertProAccess, getProAccessState } from './pro-access'

export const loyaltyApi = {
  getAll: async (search?: string) => {
    try {
      const access = await getProAccessState()
      if (!access.activated) return []
      const businessId = await getBusinessId()
      let query = supabase
        .from('loyalty_accounts')
        .select('id, name, phone, points, total_earned, total_redeemed, created_at, updated_at, deleted_at')
        .eq('business_id', businessId)
        .is('deleted_at', null)

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        query = query.order('name')
      } else {
        query = query.order('points', { ascending: false })
      }

      const { data } = await query
      return data ?? []
    } catch {
      return []
    }
  },

  getByPhone: async (phone: string) => {
    try {
      const access = await getProAccessState()
      if (!access.activated) return null
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('loyalty_accounts')
        .select('id, name, phone, points, total_earned, total_redeemed, created_at, updated_at, deleted_at')
        .eq('business_id', businessId)
        .eq('phone', phone)
        .is('deleted_at', null)
        .limit(1)
      return data?.[0] ?? null
    } catch {
      return null
    }
  },

  create: async (data: { name: string; phone?: string }) => {
    try {
      await assertProAccess('Loyalty cards are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      const id = uuid()
      const { error } = await supabase.from('loyalty_accounts').insert({
        id, business_id: businessId,
        name: data.name,
        phone: data.phone || null,
        points: 0, total_earned: 0, total_redeemed: 0,
      })
      if (error) return { success: false, error: error.message }
      return { success: true, id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  earn: async (accountId: string, points: number, orderId?: string, note?: string) => {
    try {
      await assertProAccess('Loyalty cards are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      const { data: acct } = await supabase
        .from('loyalty_accounts').select('points, total_earned').eq('id', accountId).single()
      if (!acct) return { success: false, error: 'Account not found' }
      await supabase.from('loyalty_accounts').update({
        points: acct.points + points,
        total_earned: acct.total_earned + points,
        updated_at: new Date().toISOString(),
      }).eq('id', accountId).eq('business_id', businessId)
      await supabase.from('loyalty_transactions').insert({
        id: uuid(), business_id: businessId,
        account_id: accountId, type: 'earn',
        points, order_id: orderId || null, note: note || null,
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  redeem: async (accountId: string, points: number, orderId?: string, note?: string) => {
    try {
      await assertProAccess('Loyalty cards are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      const { data: acct } = await supabase
        .from('loyalty_accounts').select('points, total_redeemed').eq('id', accountId).single()
      if (!acct || acct.points < points) return { success: false, error: 'Insufficient points' }
      await supabase.from('loyalty_accounts').update({
        points: acct.points - points,
        total_redeemed: acct.total_redeemed + points,
        updated_at: new Date().toISOString(),
      }).eq('id', accountId).eq('business_id', businessId)
      await supabase.from('loyalty_transactions').insert({
        id: uuid(), business_id: businessId,
        account_id: accountId, type: 'redeem',
        points, order_id: orderId || null, note: note || null,
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  adjust: async (accountId: string, points: number, note?: string) => {
    try {
      await assertProAccess('Loyalty cards are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      const { data: acct } = await supabase
        .from('loyalty_accounts').select('points').eq('id', accountId).single()
      if (!acct) return { success: false }
      await supabase.from('loyalty_accounts').update({
        points: acct.points + points,
        updated_at: new Date().toISOString(),
      }).eq('id', accountId).eq('business_id', businessId)
      await supabase.from('loyalty_transactions').insert({
        id: uuid(), business_id: businessId,
        account_id: accountId, type: 'adjust',
        points, note: note || null,
      })
      return { success: true }
    } catch {
      return { success: false }
    }
  },

  getHistory: async (accountId: string) => {
    try {
      const access = await getProAccessState()
      if (!access.activated) return []
      const businessId = await getBusinessId()
      const { data } = await supabase
        .from('loyalty_transactions')
        .select('id, account_id, business_id, type, points, order_id, note, created_at')
        .eq('account_id', accountId)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    } catch {
      return []
    }
  },

  delete: async (accountId: string) => {
    try {
      await assertProAccess('Loyalty cards are available on Reyna Pro only.')
      const businessId = await getBusinessId()
      await supabase.from('loyalty_accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', accountId).eq('business_id', businessId)
      return { success: true }
    } catch {
      return { success: false }
    }
  },
}
