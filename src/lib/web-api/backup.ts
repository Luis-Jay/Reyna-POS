import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { getBusinessId, getAccessToken } from './context'
import { localDb } from '../local-db'
import { refreshCatalogCache } from '../web-sync-service'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

export const backupApi = {
  export: async () => {
    try {
      const businessId = await getBusinessId()

      // Fetch all business data
      const [products, categories, orders, orderItems, debtors, debtorTx, inventory, expenses] = await Promise.all([
        supabase.from('catalog_products').select('*').eq('business_id', businessId),
        supabase.from('catalog_categories').select('*').eq('business_id', businessId),
        supabase.from('sales_orders').select('*').eq('business_id', businessId),
        supabase.from('sales_order_items').select('*').eq('business_id', businessId),
        supabase.from('sales_debtors').select('*').eq('business_id', businessId),
        supabase.from('sales_debtor_transactions').select('*').eq('business_id', businessId),
        supabase.from('catalog_inventory').select('*').eq('business_id', businessId),
        supabase.from('expenses').select('*').eq('business_id', businessId),
      ])

      const backup = {
        exported_at: new Date().toISOString(),
        version: 'web-1.0',
        data: {
          products: products.data ?? [],
          categories: categories.data ?? [],
          orders: orders.data ?? [],
          order_items: orderItems.data ?? [],
          debtors: debtors.data ?? [],
          debtor_transactions: debtorTx.data ?? [],
          inventory: inventory.data ?? [],
          expenses: expenses.data ?? [],
        },
      }

      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reyna-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)

      return { success: true, path: 'download' }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  // Import from a backup file — web version reads from a file picker
  import: async (_filePath: string) => {
    return {
      success: false,
      error: 'To restore a backup in the web app, use the Import button in Settings to upload a .json backup file.',
    }
  },

  // Full factory reset: wipes all catalog/sales/business data via the
  // reset-business-data edge function (runs with the service-role key, so it
  // isn't at the mercy of client-side RLS/session edge cases), then clears
  // the local device cache and re-pulls the (now empty) state. The
  // `cashiers` table is deliberately never touched so cashier/admin accounts
  // and PINs survive a reset.
  reset: async () => {
    try {
      const businessId = await getBusinessId()
      const token = await getAccessToken()

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/reset-business-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, apikey: ANON_KEY } : { apikey: ANON_KEY }),
        },
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Reset failed.')

      // Local device cache, including any queued offline sales — the cloud
      // records they would have synced to no longer exist.
      await localDb.products.where({ business_id: businessId }).delete()
      await localDb.categories.where({ business_id: businessId }).delete()
      await localDb.inventory.where({ business_id: businessId }).delete()
      await localDb.orders_queue.where({ business_id: businessId }).delete()

      await refreshCatalogCache(businessId)

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Reset failed.' }
    }
  },
}
