import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc-channels'

const api = {
  assets: {
    getProductImageUrl: (filePath: string) => `product-image://local?path=${encodeURIComponent(filePath)}`,
  },

  // ─── Products ──────────────────────────────────────────────────────────────
  products: {
    getAll:       (filters?: any)        => ipcRenderer.invoke(IPC.PRODUCTS.GET_ALL, filters),
    getById:      (id: string)           => ipcRenderer.invoke(IPC.PRODUCTS.GET_BY_ID, id),
    getByBarcode: (barcode: string)      => ipcRenderer.invoke(IPC.PRODUCTS.GET_BY_BARCODE, barcode),
    search:       (q: string)            => ipcRenderer.invoke(IPC.PRODUCTS.SEARCH, q),
    create:       (data: any)            => ipcRenderer.invoke(IPC.PRODUCTS.CREATE, data),
    update:       (id: string, data: any)=> ipcRenderer.invoke(IPC.PRODUCTS.UPDATE, id, data),
    delete:       (id: string)           => ipcRenderer.invoke(IPC.PRODUCTS.DELETE, id),
    bulkPrices:   (updates: any[])       => ipcRenderer.invoke(IPC.PRODUCTS.BULK_PRICES, updates),
    bulkNames:    (updates: any[])       => ipcRenderer.invoke(IPC.PRODUCTS.BULK_NAMES, updates),
    bulkBarcodes: (updates: any[])       => ipcRenderer.invoke(IPC.PRODUCTS.BULK_BARCODES, updates),
    bulkCosts:    (updates: any[])       => ipcRenderer.invoke(IPC.PRODUCTS.BULK_COSTS, updates),
    saveImage:    (productId: string, dataUrl: string) =>
                    ipcRenderer.invoke(IPC.PRODUCTS.SAVE_IMAGE, productId, dataUrl),
  },

  // ─── Categories ────────────────────────────────────────────────────────────
  categories: {
    getAll:   ()                          => ipcRenderer.invoke(IPC.CATEGORIES.GET_ALL),
    create:   (name: string)              => ipcRenderer.invoke(IPC.CATEGORIES.CREATE, name),
    update:   (id: string, name: string)  => ipcRenderer.invoke(IPC.CATEGORIES.UPDATE, id, name),
    delete:   (id: string)                => ipcRenderer.invoke(IPC.CATEGORIES.DELETE, id),
    reorder:  (ids: string[])             => ipcRenderer.invoke(IPC.CATEGORIES.REORDER, ids),
  },

  // ─── Variations ────────────────────────────────────────────────────────────
  variations: {
    getGroups:    ()                       => ipcRenderer.invoke(IPC.VARIATIONS.GET_GROUPS),
    createGroup:  (name: string)           => ipcRenderer.invoke(IPC.VARIATIONS.CREATE_GROUP, name),
    updateGroup:  (id: string, name: string)=>ipcRenderer.invoke(IPC.VARIATIONS.UPDATE_GROUP, id, name),
    deleteGroup:  (id: string)             => ipcRenderer.invoke(IPC.VARIATIONS.DELETE_GROUP, id),
    addOption:    (groupId: string, data: any)=>ipcRenderer.invoke(IPC.VARIATIONS.ADD_OPTION, groupId, data),
    updateOption: (id: string, data: any)  => ipcRenderer.invoke(IPC.VARIATIONS.UPDATE_OPTION, id, data),
    deleteOption: (id: string)             => ipcRenderer.invoke(IPC.VARIATIONS.DELETE_OPTION, id),
  },

  // ─── Orders ────────────────────────────────────────────────────────────────
  orders: {
    create:       (order: any)             => ipcRenderer.invoke(IPC.ORDERS.CREATE, order),
    getAll:       (filters?: any)          => ipcRenderer.invoke(IPC.ORDERS.GET_ALL, filters),
    getById:      (id: string)             => ipcRenderer.invoke(IPC.ORDERS.GET_BY_ID, id),
    updateStatus: (id: string, status: string) => ipcRenderer.invoke(IPC.ORDERS.UPDATE_STATUS, id, status),
    excludeSales: (id: string, exclude: boolean) => ipcRenderer.invoke(IPC.ORDERS.EXCLUDE_SALES, id, exclude),
    saveCart:     (data: any)              => ipcRenderer.invoke(IPC.ORDERS.SAVE_CART, data),
    getSaved:     ()                       => ipcRenderer.invoke(IPC.ORDERS.GET_SAVED),
    deleteSaved:  (id: string)             => ipcRenderer.invoke(IPC.ORDERS.DELETE_SAVED, id),
    getPending:   ()                       => ipcRenderer.invoke(IPC.ORDERS.GET_PENDING),
  },

  // ─── Inventory ─────────────────────────────────────────────────────────────
  inventory: {
    getAll:       (filter?: string)        => ipcRenderer.invoke(IPC.INVENTORY.GET_ALL, filter),
    addStock:     (productId: string, qty: number, note?: string) =>
                    ipcRenderer.invoke(IPC.INVENTORY.ADD_STOCK, productId, qty, note),
    getMovements: (productId: string)      => ipcRenderer.invoke(IPC.INVENTORY.GET_MOVEMENTS, productId),
    setThreshold: (productId: string, threshold: number) =>
                    ipcRenderer.invoke(IPC.INVENTORY.SET_THRESHOLD, productId, threshold),
  },

  // ─── Debtors ───────────────────────────────────────────────────────────────
  debtors: {
    getAll:           (filters?: any)     => ipcRenderer.invoke(IPC.DEBTORS.GET_ALL, filters),
    getById:          (id: string)        => ipcRenderer.invoke(IPC.DEBTORS.GET_BY_ID, id),
    create:           (data: any)         => ipcRenderer.invoke(IPC.DEBTORS.CREATE, data),
    update:           (id: string, data: any) => ipcRenderer.invoke(IPC.DEBTORS.UPDATE, id, data),
    delete:           (id: string)        => ipcRenderer.invoke(IPC.DEBTORS.DELETE, id),
    addTransaction:   (tx: any)           => ipcRenderer.invoke(IPC.DEBTORS.ADD_TRANSACTION, tx),
    markReminder:     (debtorId: string, note?: string) =>
                        ipcRenderer.invoke(IPC.DEBTORS.MARK_REMINDER, debtorId, note),
    getTransactions:  (debtorId: string, filter?: string) =>
                        ipcRenderer.invoke(IPC.DEBTORS.GET_TRANSACTIONS, debtorId, filter),
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    getDashboard:   ()                    => ipcRenderer.invoke(IPC.ANALYTICS.GET_DASHBOARD),
    getReport:      (period: string)      => ipcRenderer.invoke(IPC.ANALYTICS.GET_REPORT, period),
    getDaily:       (days: number)        => ipcRenderer.invoke(IPC.ANALYTICS.GET_DAILY, days),
    getHourly:      (date?: string)       => ipcRenderer.invoke(IPC.ANALYTICS.GET_HOURLY, date),
    getTopProducts: (period: string)      => ipcRenderer.invoke(IPC.ANALYTICS.GET_TOP_PRODUCTS, period),
    getCategories:  (period: string)      => ipcRenderer.invoke(IPC.ANALYTICS.GET_CATEGORIES, period),
    getFinancials:  (period: string)      => ipcRenderer.invoke(IPC.ANALYTICS.GET_FINANCIALS, period),
  },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings: {
    getAll:   ()                          => ipcRenderer.invoke(IPC.SETTINGS.GET_ALL),
    get:      (key: string)               => ipcRenderer.invoke(IPC.SETTINGS.GET, key),
    set:      (key: string, value: string)=> ipcRenderer.invoke(IPC.SETTINGS.SET, key, value),
    setMany:  (kv: Record<string, string>)=> ipcRenderer.invoke(IPC.SETTINGS.SET_MANY, kv),
  },

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    login:        (name: string, pin: string) => ipcRenderer.invoke(IPC.AUTH.LOGIN, name, pin),
    logout:       ()                      => ipcRenderer.invoke(IPC.AUTH.LOGOUT),
    cloudLogout:  ()                      => ipcRenderer.invoke(IPC.AUTH.CLOUD_LOGOUT),
    getUsers:     ()                      => ipcRenderer.invoke(IPC.AUTH.GET_USERS),
    createUser:   (data: any)             => ipcRenderer.invoke(IPC.AUTH.CREATE_USER, data),
    updateUser:   (id: string, data: any) => ipcRenderer.invoke(IPC.AUTH.UPDATE_USER, id, data),
    signup:       (data: any)             => ipcRenderer.invoke(IPC.AUTH.SIGNUP, data),
    cloudLogin:   (data: any)             => ipcRenderer.invoke(IPC.AUTH.CLOUD_LOGIN, data),
    syncCashiers: ()                      => ipcRenderer.invoke(IPC.AUTH.SYNC_CASHIERS),
  },

  // ─── Printer ───────────────────────────────────────────────────────────────
  printer: {
    printReceipt:  (order: any)           => ipcRenderer.invoke(IPC.PRINTER.PRINT_RECEIPT, order),
    testPage:      ()                     => ipcRenderer.invoke(IPC.PRINTER.TEST_PAGE),
    getStatus:     ()                     => ipcRenderer.invoke(IPC.PRINTER.GET_STATUS),
    setConfig:     (config: any)          => ipcRenderer.invoke(IPC.PRINTER.SET_CONFIG, config),
    openDrawer:    ()                     => ipcRenderer.invoke(IPC.PRINTER.OPEN_DRAWER),
    listPrinters:  ()                     => ipcRenderer.invoke(IPC.PRINTER.LIST_PRINTERS),
  },

  // ─── Sync ──────────────────────────────────────────────────────────────────
  sync: {
    getStatus: ()                         => ipcRenderer.invoke(IPC.SYNC.GET_STATUS),
    force:     ()                         => ipcRenderer.invoke(IPC.SYNC.FORCE),
    triggerAuto: (reason?: string)        => ipcRenderer.invoke(IPC.SYNC.TRIGGER_AUTO, reason),
  },

  // ─── Activation ────────────────────────────────────────────────────────────
  activation: {
    getInstallId:   ()  => ipcRenderer.invoke(IPC.ACTIVATION.GET_INSTALL_ID),
    getStatus:      ()  => ipcRenderer.invoke(IPC.ACTIVATION.GET_STATUS),
    createInvoice:  ()  => ipcRenderer.invoke(IPC.ACTIVATION.CREATE_INVOICE),
    checkStatus:    ()  => ipcRenderer.invoke(IPC.ACTIVATION.CHECK_STATUS),
    markActivated:  (expiresAt: string) => ipcRenderer.invoke(IPC.ACTIVATION.MARK_ACTIVATED, expiresAt),
  },

  // ─── Backup ────────────────────────────────────────────────────────────────
  backup: {
    export: ()                            => ipcRenderer.invoke(IPC.BACKUP.EXPORT),
    import: (filePath: string)            => ipcRenderer.invoke(IPC.BACKUP.IMPORT, filePath),
    reset:  ()                            => ipcRenderer.invoke(IPC.BACKUP.RESET),
  },

  // ─── Push events (main → renderer) ─────────────────────────────────────────
  on: {
    barcodeScanned: (cb: (code: string) => void) => {
      const handler = (_: any, code: string) => cb(code)
      ipcRenderer.on(IPC.PUSH.BARCODE_SCANNED, handler)
      return () => ipcRenderer.off(IPC.PUSH.BARCODE_SCANNED, handler)
    },
    syncStatus: (cb: (status: any) => void) => {
      const handler = (_: any, status: any) => cb(status)
      ipcRenderer.on(IPC.PUSH.SYNC_STATUS, handler)
      return () => ipcRenderer.off(IPC.PUSH.SYNC_STATUS, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
