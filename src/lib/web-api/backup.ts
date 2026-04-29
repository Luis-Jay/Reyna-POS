import { supabase } from '../supabase'
import { getBusinessId } from './context'

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

  reset: async () => {
    return {
      success: false,
      error: 'Factory reset is not available in the web version. Please contact support.',
    }
  },
}
