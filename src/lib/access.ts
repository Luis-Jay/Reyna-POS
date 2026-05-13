import type { User, UserPermissions } from '../types'

export const ASSIGNABLE_PERMISSION_KEYS = [
  'can_access_dashboard',
  'can_access_pos',
  'can_access_sales',
  'can_access_analytics',
  'can_manage_products',
  'can_access_inventory',
  'can_access_reports',
  'can_access_customer_credit',
  'can_access_expenses',
  'can_access_cashier_monitoring',
  'can_access_loyalty',
] as const satisfies ReadonlyArray<keyof UserPermissions>

export type AssignablePermissionKey = typeof ASSIGNABLE_PERMISSION_KEYS[number]

export const PERMISSION_MODULES: Array<{
  key: AssignablePermissionKey
  label: string
  desc: string
}> = [
  { key: 'can_access_dashboard', label: 'Dashboard', desc: 'Module launcher and daily overview' },
  { key: 'can_access_pos', label: 'POS', desc: 'Sell items and process checkout' },
  { key: 'can_access_sales', label: 'Sales', desc: 'View orders, returns, and sales history' },
  { key: 'can_access_analytics', label: 'Analytics', desc: 'Sales charts and business trends' },
  { key: 'can_manage_products', label: 'Products', desc: 'Add, edit, import, and price products' },
  { key: 'can_access_inventory', label: 'Inventory', desc: 'Stock levels, adjustments, and reports' },
  { key: 'can_access_reports', label: 'Reports', desc: 'Reports, exports, and financial summaries' },
  { key: 'can_access_customer_credit', label: 'Customer Credit', desc: 'Debtors, balances, and payments' },
  { key: 'can_access_expenses', label: 'Expenses', desc: 'Expense records and operating costs' },
  { key: 'can_access_cashier_monitoring', label: 'Cashier Monitoring', desc: 'Shifts, time-in/out, and petty cash' },
  { key: 'can_access_loyalty', label: 'Loyalty', desc: 'Sukipoints and customer rewards' },
]

type PermissionRequirement = AssignablePermissionKey | AssignablePermissionKey[]

const DASHBOARD_FALLBACK_ORDER: Array<{ path: string; requirement: PermissionRequirement }> = [
  { path: '/', requirement: 'can_access_dashboard' },
  { path: '/pos', requirement: 'can_access_pos' },
  { path: '/orders', requirement: 'can_access_sales' },
  { path: '/analytics', requirement: 'can_access_analytics' },
  { path: '/products', requirement: 'can_manage_products' },
  { path: '/inventory', requirement: 'can_access_inventory' },
  { path: '/debtors', requirement: 'can_access_customer_credit' },
  { path: '/reports', requirement: 'can_access_reports' },
  { path: '/expenses', requirement: 'can_access_expenses' },
  { path: '/cashier-monitoring', requirement: 'can_access_cashier_monitoring' },
  { path: '/loyalty', requirement: 'can_access_loyalty' },
]

export function getAdminPermissions(): UserPermissions {
  return ASSIGNABLE_PERMISSION_KEYS.reduce<UserPermissions>((acc, key) => {
    acc[key] = true
    return acc
  }, {})
}

export function getDefaultCashierPermissions(): UserPermissions {
  return ASSIGNABLE_PERMISSION_KEYS.reduce<UserPermissions>((acc, key) => {
    acc[key] = key === 'can_access_pos'
    return acc
  }, {})
}

function parseRawPermissions(rawPermissions?: string | UserPermissions | null): Partial<UserPermissions> {
  if (!rawPermissions) return {}

  if (typeof rawPermissions === 'string') {
    try {
      const parsed = JSON.parse(rawPermissions)
      return parsed && typeof parsed === 'object' ? parsed as Partial<UserPermissions> : {}
    } catch {
      return {}
    }
  }

  return typeof rawPermissions === 'object' ? rawPermissions : {}
}

export function normalizePermissions(rawPermissions?: string | UserPermissions | null): UserPermissions {
  const raw = parseRawPermissions(rawPermissions)
  const normalized = ASSIGNABLE_PERMISSION_KEYS.reduce<UserPermissions>((acc, key) => {
    acc[key] = Boolean(raw[key])
    return acc
  }, {})

  if (raw.can_manage_inventory) normalized.can_access_inventory = true
  if (raw.can_manage_debtors) normalized.can_access_customer_credit = true

  const hasExplicitFlags = ASSIGNABLE_PERMISSION_KEYS.some(key => typeof raw[key] === 'boolean')
    || typeof raw.can_manage_inventory === 'boolean'
    || typeof raw.can_manage_debtors === 'boolean'

  return hasExplicitFlags ? normalized : getDefaultCashierPermissions()
}

export function getEffectivePermissions(user: User | null | undefined): UserPermissions {
  if (!user) return {}
  if (user.role === 'admin') return getAdminPermissions()
  return normalizePermissions(user.permissions)
}

export function hasPermission(user: User | null | undefined, requirement: PermissionRequirement): boolean {
  if (!user) return false
  if (user.role === 'admin') return true

  const permissions = getEffectivePermissions(user)
  if (Array.isArray(requirement)) {
    return requirement.some(key => permissions[key] === true)
  }
  return permissions[requirement] === true
}

export function getDefaultAuthorizedPath(user: User | null | undefined): string | null {
  if (!user) return null
  if (user.role === 'admin') return '/'

  const match = DASHBOARD_FALLBACK_ORDER.find(item => hasPermission(user, item.requirement))
  return match?.path ?? null
}
