import { create } from 'zustand'
import { User, UserPermissions } from '../types'
import { parseUserPermissions } from '../lib/access'

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
  getPermissions: () => parseUserPermissions(get().user),
  can: (key) => {
    const perms: UserPermissions = parseUserPermissions(get().user)
    return perms[key] === true
  },
}))
