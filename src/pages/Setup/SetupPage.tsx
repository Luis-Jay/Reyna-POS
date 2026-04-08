import { useState } from 'react'
import { Check, LockKeyhole, Phone, Store, Sparkles, Mail, LogIn } from 'lucide-react'

type Mode = 'new' | 'restore'

function normalizePhone(input: string) {
  return input.replace(/\D/g, '').slice(0, 10)
}

export default function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<Mode>('new')

  return mode === 'new'
    ? <NewAccountForm onComplete={onComplete} onSwitchMode={() => setMode('restore')} />
    : <RestoreForm onComplete={onComplete} onSwitchMode={() => setMode('new')} />
}

// ─── New Account ──────────────────────────────────────────────────────────────

function NewAccountForm({ onComplete, onSwitchMode }: { onComplete: () => void; onSwitchMode: () => void }) {
  const [storeName, setStoreName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminName, setAdminName] = useState('Admin')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const formattedPhone = normalizePhone(phone)

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')

    if (!storeName.trim()) return setError('Enter your store name.')
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (formattedPhone.length !== 10) return setError('Enter a valid mobile number after +63.')
    if (!/^\d{4}$/.test(pin)) return setError('Owner PIN must be exactly 4 digits.')
    if (pin !== confirmPin) return setError('PIN confirmation does not match.')

    setSaving(true)
    try {
      const result = await window.api.auth.signup({
        email,
        password,
        storeName: storeName.trim(),
        storePhone: `+63${formattedPhone}`,
        adminPin: pin,
        adminName: adminName.trim() || 'Admin',
      })

      if (!result.success) {
        setError(result.error || 'Signup failed. Try again.')
        return
      }

      try { await window.api.sync.triggerAuto('online') } catch { /* non-fatal */ }
      onComplete()
    } catch {
      setError('Unexpected error. Check your internet and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_30%),linear-gradient(160deg,_#18b28d_0%,_#139b76_52%,_#0c7f60_100%)] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">

          {/* Left panel */}
          <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-8 shadow-[0_24px_80px_rgba(5,89,68,0.28)] backdrop-blur-xl lg:p-10">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#11906e] shadow-lg">
                <Sparkles size={32} />
              </div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-white/70">Welcome</p>
              <h1 className="max-w-xl text-4xl font-black leading-tight text-white lg:text-5xl">
                Welcome to Reyna Advanced POS
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/82">
                Create your account and set up your store. Cloud login works across devices, while sales and inventory stay local on each device for now.
              </p>
              <div className="mt-8 grid gap-4">
                {[
                  { icon: Store,      title: 'Cloud account connection', text: 'Use the same owner account on multiple devices, with cashier sync and Pro access tied to that account.' },
                  { icon: LockKeyhole,title: 'Secure owner access',      text: 'Your 4-digit PIN is used for daily quick login after your account is set up.' },
                  { icon: Phone,      title: 'Store contact number',     text: 'Used for your store profile and optional Pro SMS features.' },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-2xl border border-white/14 bg-black/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/14">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">{title}</h2>
                        <p className="mt-1 text-sm leading-6 text-white/76">{text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right panel — form */}
          <section className="rounded-[2rem] bg-white/18 p-5 shadow-[0_24px_80px_rgba(5,89,68,0.28)] backdrop-blur-xl lg:p-6">
            <form onSubmit={handleSubmit} className="rounded-[1.7rem] bg-white/12 p-5 lg:p-7">
              <div className="mb-6">
                <h2 className="text-3xl font-black text-white">Create Your Account</h2>
                <p className="mt-1 text-base text-white/80">Start managing your business.</p>
              </div>

              <div className="space-y-4">
                <Field label="Store Name">
                  <input value={storeName} onChange={e => { setStoreName(e.target.value); setError('') }}
                    placeholder="Reyna Mini Mart"
                    className="brand-input" />
                </Field>

                <Field label="Email Address">
                  <input value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                    type="email" placeholder="owner@example.com"
                    className="brand-input" />
                </Field>

                <Field label="Password" hint="At least 8 characters">
                  <input value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                    type="password" placeholder="••••••••"
                    className="brand-input" />
                </Field>

                <Field label="Owner Name">
                  <input value={adminName} onChange={e => { setAdminName(e.target.value); setError('') }}
                    placeholder="Admin"
                    className="brand-input" />
                </Field>

                <Field label="Store Phone">
                  <div className="flex overflow-hidden rounded-2xl border border-white/15 bg-white">
                    <div className="flex items-center bg-[#4f8f84] px-4 text-xl font-bold text-white">+63</div>
                    <input value={formattedPhone} onChange={e => { setPhone(e.target.value); setError('') }}
                      inputMode="numeric" maxLength={10} placeholder="9123456789"
                      className="brand-ring min-w-0 flex-1 bg-white px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none" />
                  </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Owner PIN (4 digits)">
                    <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                      inputMode="numeric" maxLength={4} placeholder="••••" type="password"
                      className="brand-input" />
                  </Field>
                  <Field label="Confirm PIN">
                    <input value={confirmPin} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
                      inputMode="numeric" maxLength={4} placeholder="••••" type="password"
                      className="brand-input" />
                  </Field>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-200/30 bg-red-500/15 px-4 py-3 text-sm text-white">
                  {error}
                </div>
              )}

              <button type="submit" disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-lg font-black text-[#139b76] transition hover:bg-white/90 disabled:opacity-70">
                {saving ? 'Creating Account...' : <><Check size={20} /> Create My Account</>}
              </button>

              <button type="button" onClick={onSwitchMode}
                className="mt-3 w-full text-center text-sm text-white/70 hover:text-white transition">
                Already have an account? Sign in to restore →
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Restore / New Device ─────────────────────────────────────────────────────

function RestoreForm({ onComplete, onSwitchMode }: { onComplete: () => void; onSwitchMode: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Enter your email and password.')

    setLoading(true)
    try {
      const result = await window.api.auth.cloudLogin({ email, password })
      if (!result.success) {
        setError(result.error || 'Login failed. Check your credentials.')
        return
      }
      try { await window.api.sync.triggerAuto('online') } catch { /* non-fatal */ }
      onComplete()
    } catch {
      setError('Unexpected error. Check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(160deg,_#18b28d_0%,_#139b76_52%,_#0c7f60_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-[2rem] bg-white/18 p-6 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit} className="rounded-[1.7rem] bg-white/12 p-6 lg:p-8">
            <div className="mb-6 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-[#11906e] shadow-lg mb-4">
                <LogIn size={30} />
              </div>
              <h2 className="text-3xl font-black text-white">Sign In</h2>
              <p className="mt-1 text-white/80 text-sm">Restore your account on this device</p>
            </div>

            <div className="space-y-4">
              <Field label="Email Address">
                <input value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                  type="email" placeholder="owner@example.com"
                  className="brand-input" />
              </Field>
              <Field label="Password">
                <input value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                  type="password" placeholder="••••••••"
                  className="brand-input" />
              </Field>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200/30 bg-red-500/15 px-4 py-3 text-sm text-white">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-lg font-black text-[#139b76] transition hover:bg-white/90 disabled:opacity-70">
              {loading ? 'Signing in...' : <><Mail size={18} /> Sign In & Restore</>}
            </button>

            <button type="button" onClick={onSwitchMode}
              className="mt-3 w-full text-center text-sm text-white/70 hover:text-white transition">
              ← Create a new account
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-base font-semibold text-white">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-white/65">{hint}</p>}
    </label>
  )
}
