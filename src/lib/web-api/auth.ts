import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase'
import { clearBusinessId, getBusinessId, getAccessToken } from './context'
import { settingsApi } from './settings'
import { clearCachedActivation } from './activation'

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

function getPasswordResetRedirectUrl() {
  if (typeof window === 'undefined') return undefined
  // No hash fragment here: Supabase appends "#access_token=...&type=recovery"
  // to this URL, and a URL can only have one "#" fragment. Adding our own
  // "#/login" would corrupt the token params it appends (they'd get parsed
  // as "/login#access_token" instead of "access_token"), silently breaking
  // recovery-session detection. App.tsx already force-routes to /login once
  // the PASSWORD_RECOVERY event fires, so no hash is needed here.
  const { origin, pathname } = window.location
  return `${origin}${pathname}`
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

async function syncCloudBusinessSettings() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, store_name, store_phone')
    .eq('user_id', user.id)
    .single()

  if (error || !business) {
    return { success: false, error: error?.message || 'Business not found.' }
  }

  await settingsApi.setMany({
    setup_completed: 'true',
    store_name: business.store_name ?? '',
    store_phone: business.store_phone ?? '',
  })

  return {
    success: true,
    businessId: business.id as string,
    email: user.email ?? null,
  }
}

export const authApi = {
  // Returns true if there is an active Supabase session (web-only helper)
  checkCloudSession: async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession()
    return !!session
  },

  // Returns the email of the currently signed-in cloud user (web-only helper)
  getCloudEmail: async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.email ?? null
  },

  // Returns the business name from Supabase for the current cloud account (web-only helper)
  getCloudBusinessName: async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase
        .from('businesses')
        .select('store_name')
        .eq('user_id', user.id)
        .single()
      return (data as any)?.store_name ?? null
    } catch {
      return null
    }
  },

  syncCloudBusinessSettings,

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

  logout: async () => {
    clearCachedActivation()
    return { success: true }
  },

  cloudLogout: async () => {
    clearBusinessId()
    clearCachedActivation()
    await supabase.auth.signOut()
    await settingsApi.set('setup_completed', 'false')
    return { success: true }
  },

  getUsers: async () => {
    try {
      const businessId = await getBusinessId()
      const { data, error } = await supabase
        .from('cashiers')
        .select('id, name, role, is_active, permissions, created_at')
        .eq('business_id', businessId)
        .order('role', { ascending: false })
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

  deleteUser: async (id: string) => {
    try {
      const token = await getAccessToken()
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/manage-cashier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, apikey: ANON_KEY } : { apikey: ANON_KEY }),
        },
        body: JSON.stringify({ action: 'delete', id }),
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
      await syncCloudBusinessSettings()

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
        await syncCloudBusinessSettings()
      } catch {}

      return { success: true, user: data.user }
    } catch (err: any) {
      return { success: false, error: getFriendlyWebAuthError(err, 'login') }
    }
  },

  requestPasswordReset: async (email: string) => {
    try {
      const normalizedEmail = email.trim()
      if (!normalizedEmail) {
        return { success: false, error: 'Email is required.' }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getPasswordResetRedirectUrl(),
      })
      if (error) return { success: false, error: error.message }

      return { success: true }
    } catch (err: any) {
      return {
        success: false,
        error: getFriendlyWebAuthError(err, 'login') || 'Failed to send password reset email.',
      }
    }
  },

  syncCashiers: async () => ({ success: true }),
}
