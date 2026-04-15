import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { getDb } from './db'

const SUPABASE_URL = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

let supabase: SupabaseClient | null = null
let channel: RealtimeChannel | null = null
let onSyncNeeded: (() => void) | null = null
let isConnected = false
let reconnectTimer: NodeJS.Timeout | null = null
let currentChannelId: string | null = null

function readSettings(): { cloudUserId: string | null; accessToken: string | null; installationId: string | null } {
  try {
    const db = getDb()
    return {
      cloudUserId:    (db.prepare(`SELECT value FROM settings WHERE key = 'cloud_user_id'`).get()    as any)?.value ?? null,
      accessToken:    (db.prepare(`SELECT value FROM settings WHERE key = 'cloud_access_token'`).get() as any)?.value ?? null,
      installationId: (db.prepare(`SELECT value FROM settings WHERE key = 'installation_id'`).get()  as any)?.value ?? null,
    }
  } catch {
    return { cloudUserId: null, accessToken: null, installationId: null }
  }
}

/**
 * Start the Realtime listener. Call once on app ready.
 * @param onSync Called whenever another device pushes a change — trigger a pull sync.
 */
export function initRealtime(onSync: () => void) {
  onSyncNeeded = onSync
  tryConnect()

  // Retry connection every 45 seconds in case it dropped or wasn't signed in yet
  setInterval(() => {
    if (!isConnected) {
      console.log('[Realtime] Not connected — retrying...')
      tryConnect()
    }
  }, 45_000)
}

function tryConnect() {
  const { cloudUserId, accessToken, installationId } = readSettings()
  if (!cloudUserId || !accessToken) {
    // Not signed in yet — nothing to do
    return
  }

  const channelId = `sync:${cloudUserId}`

  // Already connected to this channel
  if (isConnected && currentChannelId === channelId) return

  console.log('[Realtime] Connecting to channel:', channelId)
  cleanupConnection()

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  supabase = sb

  // Authenticate the WebSocket with the user's JWT
  sb.realtime.setAuth(accessToken)

  const ch = sb.channel(channelId, {
    config: { broadcast: { self: false } },
  })
  channel = ch

  ch
    .on('broadcast', { event: 'data_updated' }, (msg) => {
      // Ignore events from a superseded channel
      if (ch !== channel) return
      // Ignore our own broadcasts (safety double-check)
      if (msg.payload?.from === installationId) return
      console.log('[Realtime] Change received from another device — pulling latest data')
      onSyncNeeded?.()
    })
    .subscribe((status) => {
      // Ignore status events from a superseded channel
      if (ch !== channel) return
      if (status === 'SUBSCRIBED') {
        isConnected = true
        currentChannelId = channelId
        console.log('[Realtime] Connected ✓')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Channel error/timeout:', status)
        isConnected = false
        scheduleReconnect()
      } else if (status === 'CLOSED') {
        console.log('[Realtime] Channel closed')
        isConnected = false
      }
    })
}

function scheduleReconnect(delayMs = 10_000) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    tryConnect()
  }, delayMs)
}

/**
 * Broadcast to all other devices in the same business channel that
 * new data is available. Call this after a successful sync push.
 */
export async function broadcastDataUpdated() {
  if (!channel || !isConnected) return
  const { installationId } = readSettings()
  try {
    await channel.send({
      type: 'broadcast',
      event: 'data_updated',
      payload: { from: installationId, ts: Date.now() },
    })
    console.log('[Realtime] Broadcast sent ✓')
  } catch (err: any) {
    console.warn('[Realtime] Broadcast failed:', err?.message)
  }
}

/**
 * Update the JWT used for Realtime auth after a token refresh.
 * Call this after getValidCloudToken() returns a refreshed token.
 */
export function updateRealtimeAuth(newToken: string) {
  supabase?.realtime.setAuth(newToken)
}

/**
 * Reconnect with fresh credentials — call this after sign-in.
 */
export function reconnectRealtime() {
  isConnected = false
  currentChannelId = null
  tryConnect()
}

/**
 * Disconnect — call this on sign-out.
 */
export function disconnectRealtime() {
  cleanupConnection()
}

function cleanupConnection() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  isConnected = false
  currentChannelId = null
  const ch = channel
  channel = null
  supabase = null  // Do NOT call removeAllChannels() — it crashes in Electron because
                   // the phoenix socket adapter calls connToClose.close() which doesn't
                   // exist on the Node.js WebSocket object in this context.
  if (ch) {
    try { ch.unsubscribe() } catch {}
  }
}
