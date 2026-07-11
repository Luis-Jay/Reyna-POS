import { supabase } from '../supabase'

const STORAGE_KEY = 'reyna_business_id'

let _businessId: string | null = null

export async function getBusinessId(): Promise<string> {
  if (_businessId) return _businessId

  // Offline fallback: use the last known businessId from localStorage
  if (!navigator.onLine) {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached) {
      _businessId = cached
      return _businessId
    }
    throw new Error('You are offline and no local session was found. Please connect to the internet and sign in first.')
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    // Session is gone — clear everything so the app redirects to login
    _businessId = null
    throw new Error('Session expired. Please sign in again.')
  }

  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (error || !data) throw new Error('Business not found. Please complete setup first.')

  _businessId = data.id as string
  localStorage.setItem(STORAGE_KEY, _businessId)
  return _businessId
}

export function clearBusinessId() {
  _businessId = null
  localStorage.removeItem(STORAGE_KEY)
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}
