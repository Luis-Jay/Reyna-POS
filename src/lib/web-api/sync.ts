import { getSyncStatusPayload, triggerSync } from '../web-sync-service'
import { getBusinessId } from './context'

export const syncApi = {
  getStatus: async () => {
    try {
      const businessId = await getBusinessId().catch(() => undefined)
      return getSyncStatusPayload(businessId)
    } catch {
      return {
        status: 'not_signed_in',
        cloudSignedIn: false,
        pending: 0,
        pendingCount: 0,
        syncing: false,
        lastSyncedAt: null,
        lastError: null,
        message: 'Sign in to your cloud account to sync.',
      }
    }
  },

  force: async () => {
    try {
      const businessId = await getBusinessId()
      await triggerSync(businessId)
      return { success: true, message: 'Sync complete.' }
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Sync failed.' }
    }
  },

  triggerAuto: async (_reason?: string) => ({ success: true }),
}
