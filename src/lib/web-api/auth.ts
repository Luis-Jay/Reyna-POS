import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { clearBusinessId, getBusinessId, getAccessToken } from './context'
import { settingsApi } from './settings'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

function getFriendlyWebAuthError(err: any, phase: 'login' | 'signup') {
  const message = err?.message || ''

  if (typeof message === 'string') {
    const lower = message.toLowerCase()

    if (lower.includes('invalid login credentials')) {
      return 'Incorrect email or password.'
    }

    if (lower.includes('failed to fetch')) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return 'Unable to reach the cloud server because this device appears to be offline.'
      }

      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return 'Unable to reach the cloud server from a file-opened web build. Start the app with `npm run dev:web` or serve `dist/web` over HTTP.'
      }

      return phase === 'login'
        ? 'Unable to reach the cloud sign-in service. Check your internet connection or firewall, then try again.'
        : 'Unable to reach the cloud signup service. Check your internet connection or firewall, then try again.'
    }
  }

  return message || (phase === 'login' ? 'Login failed.' : 'Signup failed.')
}

function mapCashierToUser(c: any) {
  return {
    id: c.id,
    name: c.name,
    role: c.role as 'admin' | 'cashier',
    is_active: c.is_active ? 1 : 0,
    permissions: c.permissions ? JSON.stringify(c.permissions) : '{}',
    created_at: c.created_at,
  }
}

export const authApi = {
  // Returns true if there is an active Supabase session (web-only helper)
  checkCloudSession: async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession()
    return !!session
  },

  // PIN-based login (cashier or admin via PIN).
  // Calls a Supabase Edge Function to verify the hashed PIN server-side.
  login: async (name: string, pin: string) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        return { success: false, error: 'Your cloud session expired. Please sign in again.' }
      }

      const businessId = await getBusinessId()

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/verify-cashier-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ name, pin, business_id: businessId }),
      })

      const data = await res.json()
      if (!res.ok || !data.user) {
        return { success: false, error: data.error || 'Invalid name or PIN.' }
      }
      return { success: true, user: data.user }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Login failed.' }
    }
  },

  logout: async () => ({ success: true }),

  cloudLogout: async () => {
    clearBusinessId()
    await supabase.auth.signOut()
    return { success: true }
  },

  getUsers: async () => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('cashiers')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return (data ?? []).map(mapCashierToUser)
    } catch {
      return []
    }
  },

  createUser: async (userData: any) => {
    try {
      const token = await getAccessToken()
      const businessId = await getBusinessId()

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/manage-cashier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, apikey: ANON_KEY } : { apikey: ANON_KEY }),
        },
        body: JSON.stringify({ action: 'create', business_id: businessId, ...userData }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error }
      return { success: true, id: data.id }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  updateUser: async (id: string, userData: any) => {
    try {
      const token = await getAccessToken()
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/manage-cashier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, apikey: ANON_KEY } : { apikey: ANON_KEY }),
        },
        body: JSON.stringify({ action: 'update', id, ...userData }),
      })
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  },

  signup: async (signupData: any) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
      })
      if (error) return { success: false, error: error.message }
      if (!data.session?.access_token || !data.user) {
        return { success: false, error: 'Signup succeeded, but no session was returned. Please sign in to continue setup.' }
      }

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/business-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({
          storeName: signupData.storeName || signupData.store_name || 'My Store',
          storePhone: signupData.storePhone || signupData.store_phone || '',
          adminPin: signupData.adminPin || signupData.admin_pin,
          adminName: signupData.adminName || signupData.admin_name || 'Admin',
        }),
      })

      const payload = await res.json()
      if (!res.ok) {
        return { success: false, error: payload.error || 'Failed to finish account setup.' }
      }

      clearBusinessId()
      await getBusinessId()
      await settingsApi.set('setup_completed', 'true')
      await settingsApi.set('store_name', signupData.storeName || signupData.store_name || 'My Store')
      await settingsApi.set('store_phone', signupData.storePhone || signupData.store_phone || '')

      return { success: true }
    } catch (err: any) {
      return { success: false, error: getFriendlyWebAuthError(err, 'signup') }
    }
  },

  cloudLogin: async (creds: { email: string; password: string }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      })
      if (error) return { success: false, error: error.message }

      clearBusinessId() // Reset so getBusinessId re-fetches
      // Eagerly warm up the business ID cache and persist setup flag
      try {
        await getBusinessId()
        await settingsApi.set('setup_completed', 'true')
      } catch {}

      return { success: true, user: data.user }
    } catch (err: any) {
      return { success: false, error: getFriendlyWebAuthError(err, 'login') }
    }
  },

  syncCashiers: async () => ({ success: true }),
}
