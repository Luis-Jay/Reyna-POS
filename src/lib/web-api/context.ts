import { supabase } from '../supabase'

let _businessId: string | null = null

export async function getBusinessId(): Promise<string> {
  if (_businessId) return _businessId

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
  return _businessId
}

export function clearBusinessId() {
  _businessId = null
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}
