// ─── Auth ────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'cashier'

export interface UserPermissions {
  can_access_reports?: boolean
  can_manage_inventory?: boolean
  can_access_expenses?: boolean
  can_access_cashier_monitoring?: boolean
  can_manage_debtors?: boolean
  can_manage_products?: boolean
}

export interface User {
  id: string
  name: string
  role: UserRole
  is_active: number
  permissions?: string  // JSON string
  created_at: string
}

// ─── Category ────────────────────────────────────────────────────────────────
export interface Category {
  id: string
  name: string
  sort_order: number
  deleted_at?: string
}

// ─── Variation ───────────────────────────────────────────────────────────────
export interface VariationGroup {
  id: string
  name: string
  options: VariationOption[]
  deleted_at?: string
}

export interface VariationOption {
  id: string
  group_id: string
  name: string
  price: number
  cost: number
  sort_order: number
  deleted_at?: string
}

// ─── Product ─────────────────────────────────────────────────────────────────
export interface Product {
  id: string
  name: string
  description?: string
  image_path?: string
  barcode?: string
  category_id?: string
  category_name?: string
  base_price: number
  retail_price: number
  wholesale_price?: number
  base_cost: number
  markup_pct?: number
  has_variations: number
  variation_group_id?: string
  variation_group_name?: string
  allow_fractions: number
  track_inventory: number
  is_active: number
  sort_order: number
  monthly_sold: number
  created_at: string
  updated_at: string
  // Runtime joined
  stock?: number
  status?: 'safe' | 'low' | 'critical' | 'out'
  price_tier_count?: number
  price_tiers?: InventoryPriceTier[]
}

export interface ProductVariation {
  id: string
  product_id: string
  option_id: string
  option_name: string
  price?: number
  cost?: number
  barcode?: string
}

// ─── Cart ────────────────────────────────────────────────────────────────────
export interface CartItem {
  id: string           // unique cart line id
  product_id?: string
  name: string
  price: number        // effective price (may be tier price)
  base_price: number   // original product price, for reverting tiers
  cost: number
  quantity: number
  subtotal: number
  is_custom: boolean
  image_path?: string
  price_type?: 'retail' | 'wholesale'
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'void'
export type PaymentMethod = 'cash' | 'gcash' | 'card'

export interface PaymentEntry {
  method: PaymentMethod
  amount: number
}

export interface Order {
  id: string
  order_number: string
  customer_name?: string
  status: OrderStatus
  subtotal: number
  discount: number
  total: number
  payment_amount?: number
  change_amount?: number
  payment_breakdown?: PaymentEntry[]
  is_credit: number
  debtor_id?: string
  user_id?: string
  note?: string
  exclude_sales: number
  created_at: string
  deleted_at?: string
  // Joined
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id?: string
  name: string
  price: number
  cost: number
  quantity: number
  subtotal: number
  is_custom: number
}

export interface SavedOrder {
  id: string
  name: string
  items_json: string
  total: number
  created_at: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────
export interface InventoryItem {
  id: string
  product_id: string
  product_name: string
  product_image?: string
  image_path?: string
  barcode?: string | null
  base_price?: number
  base_cost?: number
  retail_price?: number
  wholesale_price?: number
  quantity: number
  low_threshold: number
  monthly_sold: number
  updated_at: string
  status: 'safe' | 'low' | 'critical' | 'out'
  price_tier_count?: number
  price_tiers?: InventoryPriceTier[]
}

export interface InventoryPriceTier {
  id: string
  quantity: number
  unit_cost: number
  retail_price: number
  wholesale_price: number
  received_at: string
  note?: string | null
  source_order_id?: string | null
}

export interface StockMovement {
  id: string
  product_id: string
  product_name?: string
  type: 'sale' | 'restock' | 'adjustment' | 'return'
  quantity: number
  reference_id?: string
  note?: string
  user_id?: string
  created_at: string
}

// ─── Debtors ─────────────────────────────────────────────────────────────────
export interface Debtor {
  id: string
  name: string
  phone?: string
  balance: number
  total_credit: number
  total_paid: number
  due_date?: string
  follow_up_date?: string
  last_reminder_at?: string
  created_at: string
  deleted_at?: string
  // Runtime
  last_activity?: string
}

export interface DebtorTransaction {
  id: string
  debtor_id: string
  type: 'debt' | 'payment' | 'note'
  amount: number
  profit: number
  note?: string
  order_id?: string
  user_id?: string
  created_at: string
}

// ─── Analytics ───────────────────────────────────────────────────────────────
export interface DashboardSnapshot {
  sales_today: number
  profit_today: number
  total_products: number
  recent_orders: RecentOrder[]
}

export interface RecentOrder {
  id: string
  order_number: string
  total: number
  item_count: number
  created_at: string
}

export interface AnalyticsReport {
  total_sales: number
  net_profit: number
  net_income: number
  total_cost: number
  total_expenses: number
  order_count: number
  avg_sale: number
  debt_outstanding: number
  debt_added: number
  debt_paid: number
}

export interface DailyStat {
  date: string
  sales: number
  profit: number
  cost: number
  expenses?: number
  net_income?: number
}

export interface AnalyticsRange {
  preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_month' | 'this_month'
  from?: string
  to?: string
}

export interface CashflowPoint {
  date: string
  sales: number
  expenses: number
  net_income: number
}

export interface HourlyStat {
  hour: number
  count: number
}

export interface TopProduct {
  product_id: string
  name: string
  image_path?: string
  total_qty: number
  total_revenue: number
}

export interface CategoryStat {
  category_name: string
  total: number
  pct: number
}

export interface InventoryValuation {
  potential_revenue: number
  total_cost: number
}

export interface FinancialStatementLine {
  label: string
  amount: number
  type: 'debit' | 'credit' | 'value'
}

export interface FinancialStatements {
  period: {
    from: string
    to: string
  }
  profit_and_loss: {
    revenue: number
    cost_of_goods_sold: number
    gross_profit: number
    net_profit: number
  }
  income_statement: {
    net_sales: number
    cost_of_sales: number
    gross_income: number
    operating_expenses: number
    net_income: number
    note: string
  }
  trial_balance: {
    lines: FinancialStatementLine[]
    total_debits: number
    total_credits: number
    note: string
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────
export interface AppSettings {
  store_name: string
  store_phone: string
  setup_completed: string
  thermal_enabled: string
  paper_size: string
  printer_interface: string
  inventory_enabled: string
  cashier_manage_debtors: string
  buyer_page_enabled: string
  oos_blocking: string
  sound_alerts: string
  store_closed: string
  ai_image_recognition: string
  cloud_sync_url: string
  cloud_sync_enabled: string
}

// ─── Printer ─────────────────────────────────────────────────────────────────
export interface PrinterStatus {
  connected: boolean
  type?: string
  device?: string
  error?: string
}

// ─── Sync ────────────────────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'
