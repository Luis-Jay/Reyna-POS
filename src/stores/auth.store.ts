import { create } from 'zustand'
import { User, UserPermissions } from '../types'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
  isAdmin: () => boolean
  getPermissions: () => UserPermissions
  can: (key: keyof UserPermissions) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
  isAdmin: () => get().user?.role === 'admin',
  getPermissions: () => {
    const { user } = get()
    if (!user) return {}
    if (user.role === 'admin') return {
      can_access_reports: true,
      can_manage_inventory: true,
      can_access_expenses: true,
      can_access_cashier_monitoring: true,
      can_manage_debtors: true,
      can_manage_products: true,
    }
    try {
      return user.permissions ? JSON.parse(user.permissions) : {}
    } catch {
      return {}
    }
  },
  can: (key) => {
    const { user } = get()
    if (!user) return false
    if (user.role === 'admin') return true
    try {
      const perms: UserPermissions = user.permissions ? JSON.parse(user.permissions) : {}
      return perms[key] === true
    } catch {
      return false
    }
  },
}))
