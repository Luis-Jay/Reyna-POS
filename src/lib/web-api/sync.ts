// In the web version, all data is already in Supabase — sync is a no-op.

export const syncApi = {
  getStatus: async () => ({
    status: 'idle' as const,
    lastSynced: null,
    pendingCount: 0,
    message: 'Web version syncs in real-time.',
  }),

  force: async () => ({ success: true }),

  triggerAuto: async (_reason?: string) => ({ success: true }),
}
