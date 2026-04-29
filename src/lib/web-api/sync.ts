// In the web version, all data is already in Supabase — sync is a no-op.
import { supabase } from '../supabase'

export const syncApi = {
  getStatus: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const signedIn = Boolean(session)

    return {
      status: signedIn ? 'connected' : 'not_signed_in',
      cloudSignedIn: signedIn,
      pending: 0,
      pendingCount: 0,
      syncing: false,
      lastSyncedAt: null,
      message: signedIn
        ? 'Web version syncs in real-time.'
        : 'Sign in to your cloud account to load your live store data.',
    }
  },

  force: async () => ({ success: true, message: 'Web version syncs in real-time.' }),

  triggerAuto: async (_reason?: string) => ({ success: true }),
}
