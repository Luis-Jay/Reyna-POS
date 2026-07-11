import { startWebSyncService, onSyncStatus } from '../web-sync-service'
import { getBusinessId } from './context'
import { settingsApi } from './settings'
import { authApi } from './auth'
import { productsApi } from './products'
import { categoriesApi } from './categories'
import { variationsApi } from './variations'
import { ordersApi } from './orders'
import { inventoryApi } from './inventory'
import { debtorsApi } from './debtors'
import { analyticsApi } from './analytics'
import { priceTiersApi } from './price-tiers'
import { shiftsApi } from './shifts'
import { expensesApi } from './expenses'
import { printerApi } from './printer'
import { syncApi } from './sync'
import { activationApi } from './activation'
import { backupApi } from './backup'
import { smsApi } from './sms'
import { loyaltyApi } from './loyalty'
import { productOrdersApi } from './product-orders'

// Barcode scanner support via keyboard wedge (most USB barcode scanners work this way)
type BarcodeCallback = (code: string) => void
const barcodeListeners: Set<BarcodeCallback> = new Set()
let barcodeBuffer = ''
let barcodeTimer: ReturnType<typeof setTimeout> | null = null

function setupBarcodeScanner() {
  document.addEventListener('keydown', (e) => {
    const key = typeof e.key === 'string' ? e.key : ''

    if (key === 'Enter' && barcodeBuffer.length >= 4) {
      const code = barcodeBuffer
      barcodeBuffer = ''
      if (barcodeTimer) clearTimeout(barcodeTimer)
      barcodeListeners.forEach(cb => cb(code))
      return
    }
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      barcodeBuffer += key
      if (barcodeTimer) clearTimeout(barcodeTimer)
      // Scanners type very fast; if there's a pause > 100ms, clear the buffer
      barcodeTimer = setTimeout(() => { barcodeBuffer = '' }, 100)
    }
  })
}

// Build the web implementation of window.api
export function createWebApi() {
  setupBarcodeScanner()

  // Start the offline sync service once we have a businessId
  getBusinessId().then(businessId => {
    startWebSyncService(businessId)
  }).catch(() => {
    // Not signed in yet — sync will start after login
  })

  return {
    assets: {
      getProductImageUrl: (filePath: string) => filePath,
    },

    products: productsApi,
    categories: categoriesApi,
    variations: variationsApi,
    orders: ordersApi,
    inventory: inventoryApi,
    debtors: debtorsApi,
    analytics: analyticsApi,
    priceTiers: priceTiersApi,
    shifts: shiftsApi,
    expenses: expensesApi,
    settings: settingsApi,
    auth: authApi,
    printer: printerApi,
    sync: syncApi,
    activation: activationApi,
    backup: backupApi,
    sms: smsApi,
    loyalty: loyaltyApi,
    productOrders: productOrdersApi,

    on: {
      barcodeScanned: (cb: BarcodeCallback) => {
        barcodeListeners.add(cb)
        return () => barcodeListeners.delete(cb)
      },
      syncStatus: (cb: (status: any) => void) => {
        return onSyncStatus(cb)
      },
    },
  }
}
