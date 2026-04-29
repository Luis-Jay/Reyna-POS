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
    importBatch:  (rows: any[])          => ipcRenderer.invoke(IPC.PRODUCTS.IMPORT_BATCH, rows),
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
    refund:       (id: string)                 => ipcRenderer.invoke(IPC.ORDERS.REFUND, id),
    partialRefund:(id: string, items: any[])   => ipcRenderer.invoke(IPC.ORDERS.PARTIAL_REFUND, id, items),
    excludeSales: (id: string, exclude: boolean) => ipcRenderer.invoke(IPC.ORDERS.EXCLUDE_SALES, id, exclude),
    saveCart:     (data: any)              => ipcRenderer.invoke(IPC.ORDERS.SAVE_CART, data),
    getSaved:     ()                       => ipcRenderer.invoke(IPC.ORDERS.GET_SAVED),
    deleteSaved:  (id: string)             => ipcRenderer.invoke(IPC.ORDERS.DELETE_SAVED, id),
    getPending:           ()        => ipcRenderer.invoke(IPC.ORDERS.GET_PENDING),
    getCashierSalesToday: ()        => ipcRenderer.invoke(IPC.ORDERS.GET_CASHIER_SALES_TODAY),
  },

  // ─── Inventory ─────────────────────────────────────────────────────────────
  inventory: {
    getAll:       (filter?: string)        => ipcRenderer.invoke(IPC.INVENTORY.GET_ALL, filter),
    getReport:    ()                       => ipcRenderer.invoke(IPC.INVENTORY.GET_REPORT),
    addStock:     (productId: string, qty: number, note?: string, pricing?: any) =>
                    ipcRenderer.invoke(IPC.INVENTORY.ADD_STOCK, productId, qty, note, pricing),
    setStock:     (productId: string, qty: number, note?: string) =>
                    ipcRenderer.invoke(IPC.INVENTORY.SET_STOCK, productId, qty, note),
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
    getReport:      (periodOrRange: any)  => ipcRenderer.invoke(IPC.ANALYTICS.GET_REPORT, periodOrRange),
    getDaily:       (days: number)        => ipcRenderer.invoke(IPC.ANALYTICS.GET_DAILY, days),
    getCashflow:    (periodOrRange: any)  => ipcRenderer.invoke(IPC.ANALYTICS.GET_CASHFLOW, periodOrRange),
    getHourly:      (dateOrRange?: any)   => ipcRenderer.invoke(IPC.ANALYTICS.GET_HOURLY, dateOrRange),
    getTopProducts:       (periodOrRange: any) => ipcRenderer.invoke(IPC.ANALYTICS.GET_TOP_PRODUCTS, periodOrRange),
    getCategories:        (periodOrRange: any) => ipcRenderer.invoke(IPC.ANALYTICS.GET_CATEGORIES, periodOrRange),
    getFinancials:        (periodOrRange: any) => ipcRenderer.invoke(IPC.ANALYTICS.GET_FINANCIALS, periodOrRange),
    getTopDebtors:        ()               => ipcRenderer.invoke(IPC.ANALYTICS.GET_TOP_DEBTORS),
    getSlowMoving:        (periodOrRange: any) => ipcRenderer.invoke(IPC.ANALYTICS.GET_SLOW_MOVING, periodOrRange),
    getPaymentBreakdown:  (days: number)   => ipcRenderer.invoke(IPC.ANALYTICS.GET_PAYMENT_BREAKDOWN, days),
  },

  // ─── Price Tiers (Wholesale) ───────────────────────────────────────────────
  priceTiers: {
    get:    (productId: string)              => ipcRenderer.invoke(IPC.PRICE_TIERS.GET, productId),
    set:    (productId: string, tiers: any[])=> ipcRenderer.invoke(IPC.PRICE_TIERS.SET, productId, tiers),
    delete: (productId: string)              => ipcRenderer.invoke(IPC.PRICE_TIERS.DELETE, productId),
  },

  // ─── Shifts (Cashier Monitoring) ───────────────────────────────────────────
  shifts: {
    timeIn:       (data: any)              => ipcRenderer.invoke(IPC.SHIFTS.TIME_IN, data),
    timeOut:      (data: any)              => ipcRenderer.invoke(IPC.SHIFTS.TIME_OUT, data),
    getActive:    (userId?: string)        => ipcRenderer.invoke(IPC.SHIFTS.GET_ACTIVE, userId),
    getAll:       (filters?: any)          => ipcRenderer.invoke(IPC.SHIFTS.GET_ALL, filters),
    addPettyCash: (data: any)              => ipcRenderer.invoke(IPC.SHIFTS.ADD_PETTY_CASH, data),
    getPettyCash: (shiftId: string)        => ipcRenderer.invoke(IPC.SHIFTS.GET_PETTY_CASH, shiftId),
  },

  // ─── Expenses ──────────────────────────────────────────────────────────────
  expenses: {
    getAll:      (filters?: any)              => ipcRenderer.invoke(IPC.EXPENSES.GET_ALL, filters),
    create:      (data: any)                  => ipcRenderer.invoke(IPC.EXPENSES.CREATE, data),
    update:      (id: string, data: any)      => ipcRenderer.invoke(IPC.EXPENSES.UPDATE, id, data),
    delete:      (id: string)                 => ipcRenderer.invoke(IPC.EXPENSES.DELETE, id),
    getSummary:  (period: string)             => ipcRenderer.invoke(IPC.EXPENSES.GET_SUMMARY, period),
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

  // ─── SMS ───────────────────────────────────────────────────────────────────
  sms: {
    send:       (phone: string, message: string) => ipcRenderer.invoke(IPC.SMS.SEND, phone, message),
    getCredits: ()                               => ipcRenderer.invoke(IPC.SMS.GET_CREDITS),
    getLog:     ()                               => ipcRenderer.invoke(IPC.SMS.GET_LOG),
  },

  // ─── Loyalty / Sukipoints ─────────────────────────────────────────────────
  loyalty: {
    getAll:     (search?: string)                          => ipcRenderer.invoke(IPC.LOYALTY.GET_ALL, search),
    getByPhone: (phone: string)                            => ipcRenderer.invoke(IPC.LOYALTY.GET_BY_PHONE, phone),
    create:     (data: any)                                => ipcRenderer.invoke(IPC.LOYALTY.CREATE, data),
    earn:       (accountId: string, points: number, orderId?: string, note?: string) =>
                  ipcRenderer.invoke(IPC.LOYALTY.EARN, accountId, points, orderId, note),
    redeem:     (accountId: string, points: number, orderId?: string, note?: string) =>
                  ipcRenderer.invoke(IPC.LOYALTY.REDEEM, accountId, points, orderId, note),
    adjust:     (accountId: string, points: number, note?: string) =>
                  ipcRenderer.invoke(IPC.LOYALTY.ADJUST, accountId, points, note),
    getHistory: (accountId: string)                        => ipcRenderer.invoke(IPC.LOYALTY.GET_HISTORY, accountId),
    delete:     (accountId: string)                        => ipcRenderer.invoke(IPC.LOYALTY.DELETE, accountId),
  },

  // ─── Product Orders ───────────────────────────────────────────────────────
  productOrders: {
    getAll:     ()            => ipcRenderer.invoke(IPC.PRODUCT_ORDERS.GET_ALL),
    getPending: ()            => ipcRenderer.invoke(IPC.PRODUCT_ORDERS.GET_PENDING),
    create:     (data: any)   => ipcRenderer.invoke(IPC.PRODUCT_ORDERS.CREATE, data),
    receive:    (id: string)  => ipcRenderer.invoke(IPC.PRODUCT_ORDERS.RECEIVE, id),
    cancel:     (id: string)  => ipcRenderer.invoke(IPC.PRODUCT_ORDERS.CANCEL, id),
  },

  // ─── Push events (main → renderer) ─────────────────────────────────────────
  on: {
    barcodeScanned: (cb: (code: string) => void) => {
      const handler = (_: any, code: string) => cb(code)
      ipcRenderer.on(IPC.PUSH.BARCODE_SCANNED, handler)
      return () => { ipcRenderer.off(IPC.PUSH.BARCODE_SCANNED, handler) }
    },
    syncStatus: (cb: (status: any) => void) => {
      const handler = (_: any, status: any) => cb(status)
      ipcRenderer.on(IPC.PUSH.SYNC_STATUS, handler)
      return () => { ipcRenderer.off(IPC.PUSH.SYNC_STATUS, handler) }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
