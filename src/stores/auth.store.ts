import { create } from 'zustand'
import { User, UserPermissions } from '../types'
import { getEffectivePermissions, hasPermission } from '../lib/access'

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
  getPermissions: () => getEffectivePermissions(get().user),
  can: (key) => hasPermission(get().user, key),
}))
