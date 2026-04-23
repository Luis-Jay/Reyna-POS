import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { getDb } from './db'
import { printOrder } from './ipc/printer.ipc'

const SUPABASE_URL      = 'https://rzhjfsgjkbvcspfncyku.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpmc2dqa2J2Y3NwZm5jeWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODI4ODQsImV4cCI6MjA5MDg1ODg4NH0.gw-mgJWF3yoCRlQIW6IVcrHbiVvqcNSO2i8yzis1aDM'

let supabase: SupabaseClient | null = null
let channel: RealtimeChannel | null = null
let connected = false

function readToken(): string | null {
  try {
    const row: any = getDb().prepare(`SELECT value FROM settings WHERE key = 'cloud_access_token'`).get()
    return row?.value ?? null
  } catch {
    return null
  }
}

export function initPrintRelay() {
  tryConnect()
  setInterval(() => {
    if (!connected) tryConnect()
  }, 60_000)
}

function tryConnect() {
  const token = readToken()
  if (!token) return
  if (connected) return

  cleanup()

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  sb.realtime.setAuth(token)
  supabase = sb

  const ch = sb
    .channel('print-relay')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'print_queue' },
      (payload) => { handlePrintJob(payload.new as any) }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        connected = true
        console.log('[PrintRelay] Connected ✓')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[PrintRelay] Error:', status)
        connected = false
        cleanup()
      } else if (status === 'CLOSED') {
        connected = false
      }
    })

  channel = ch
}

async function handlePrintJob(job: { id: string; status: string; payload: any }) {
  if (job.status !== 'pending') return
  if (!supabase) return

  console.log('[PrintRelay] Printing job:', job.id)

  try {
    const result = await printOrder(job.payload)
    await supabase
      .from('print_queue')
      .update({ status: result.success ? 'printed' : 'failed', error: result.error ?? null })
      .eq('id', job.id)
    console.log(`[PrintRelay] Job ${job.id} → ${result.success ? 'printed' : 'failed'}`)
  } catch (err: any) {
    console.error('[PrintRelay] Print error:', err?.message)
    try {
      await supabase
        .from('print_queue')
        .update({ status: 'failed', error: err?.message ?? 'Unknown error' })
        .eq('id', job.id)
    } catch {}
  }
}

export function reconnectPrintRelay() {
  connected = false
  cleanup()
  tryConnect()
}

export function updatePrintRelayAuth(token: string) {
  supabase?.realtime.setAuth(token)
}

function cleanup() {
  const ch = channel
  channel = null
  supabase = null
  if (ch) {
    try { ch.unsubscribe() } catch {}
  }
}
