import { User, UserPermissions } from '../types'

export type ModuleId =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'reports'
  | 'customer_credit'
  | 'expenses'
  | 'cashier_monitoring'
  | 'loyalty'
  | 'settings'

export interface ModuleAccessDefinition {
  id: ModuleId
  label: string
  description: string
  path: string
  permissionKey?: keyof UserPermissions
  order: number
}

export const MODULE_ACCESS: ModuleAccessDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Main overview and quick access tiles', path: '/', permissionKey: 'can_access_dashboard', order: 10 },
  { id: 'pos', label: 'POS', description: 'Point of sale screen and checkout flow', path: '/pos', permissionKey: 'can_access_pos', order: 20 },
  { id: 'sales', label: 'Sales', description: 'Orders and sales analytics', path: '/orders', permissionKey: 'can_access_sales', order: 30 },
  { id: 'products', label: 'Products', description: 'Product list, pricing, imports, and categories', path: '/products', permissionKey: 'can_access_products', order: 40 },
  { id: 'inventory', label: 'Inventory / Supplier Credit', description: 'Stock management, inventory reports, and supplier ordering', path: '/inventory', permissionKey: 'can_access_inventory', order: 50 },
  { id: 'reports', label: 'Reports', description: 'Printable reports and exports', path: '/reports', permissionKey: 'can_access_reports', order: 60 },
  { id: 'customer_credit', label: 'Customer Credit', description: 'Debtors, balances, and credit payments', path: '/debtors', permissionKey: 'can_access_customer_credit', order: 70 },
  { id: 'expenses', label: 'Expenses', description: 'Expense tracking and summaries', path: '/expenses', permissionKey: 'can_access_expenses', order: 80 },
  { id: 'cashier_monitoring', label: 'Cashier Monitoring', description: 'Shift logs, time in/out, and cashier activity', path: '/cashier-monitoring', permissionKey: 'can_access_cashier_monitoring', order: 90 },
  { id: 'loyalty', label: 'Loyalty / Sukipoints', description: 'Loyalty accounts and point adjustments', path: '/loyalty', permissionKey: 'can_access_loyalty', order: 100 },
  { id: 'settings', label: 'Settings', description: 'System settings and staff management', path: '/settings', order: 110 },
]

const MODULE_MAP = Object.fromEntries(MODULE_ACCESS.map(module => [module.id, module])) as Record<ModuleId, ModuleAccessDefinition>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBoolean(value: unknown): boolean {
  if (value === true) return true
  if (value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
  }
  return false
}

export function normalizePermissions(input: unknown): UserPermissions {
  const raw = isRecord(input) ? input : {}
  const normalized: UserPermissions = {
    can_access_dashboard: toBoolean(raw.can_access_dashboard),
    can_access_pos: toBoolean(raw.can_access_pos),
    can_access_sales: toBoolean(raw.can_access_sales),
    can_access_products: toBoolean(raw.can_access_products),
    can_access_inventory: toBoolean(raw.can_access_inventory),
    can_access_reports: toBoolean(raw.can_access_reports),
    can_access_customer_credit: toBoolean(raw.can_access_customer_credit),
    can_access_expenses: toBoolean(raw.can_access_expenses),
    can_access_cashier_monitoring: toBoolean(raw.can_access_cashier_monitoring),
    can_access_loyalty: toBoolean(raw.can_access_loyalty),
  }

  if (toBoolean(raw.can_manage_products)) normalized.can_access_products = true
  if (toBoolean(raw.can_manage_inventory)) normalized.can_access_inventory = true
  if (toBoolean(raw.can_manage_debtors)) normalized.can_access_customer_credit = true
  if (toBoolean(raw.can_access_expenses)) normalized.can_access_expenses = true
  if (toBoolean(raw.can_access_cashier_monitoring)) normalized.can_access_cashier_monitoring = true
  if (toBoolean(raw.can_access_reports)) {
    normalized.can_access_sales = true
    normalized.can_access_reports = true
  }

  if (Object.keys(raw).length === 0) {
    normalized.can_access_pos = true
  }

  return normalized
}

export function parseUserPermissions(user: User | null | undefined): UserPermissions {
  if (!user) return {}
  if (user.role === 'admin') {
    return Object.fromEntries(
      MODULE_ACCESS
        .filter(module => module.permissionKey)
        .map(module => [module.permissionKey!, true])
    ) as UserPermissions
  }

  try {
    return normalizePermissions(user.permissions ? JSON.parse(user.permissions) : {})
  } catch {
    return normalizePermissions({})
  }
}

export function serializePermissions(permissions: UserPermissions): UserPermissions {
  return normalizePermissions(permissions)
}

export function canAccessModule(user: User | null | undefined, moduleId: ModuleId): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  const module = MODULE_MAP[moduleId]
  if (!module.permissionKey) return false
  const permissions = parseUserPermissions(user)
  return permissions[module.permissionKey] === true
}

export function getAccessibleModules(user: User | null | undefined): ModuleAccessDefinition[] {
  if (!user) return []
  return MODULE_ACCESS
    .filter(module => canAccessModule(user, module.id))
    .sort((a, b) => a.order - b.order)
}

export function getDefaultRouteForUser(user: User | null | undefined): string {
  if (!user) return '/login'
  const firstModule = getAccessibleModules(user)[0]
  return firstModule?.path ?? '/no-access'
}
