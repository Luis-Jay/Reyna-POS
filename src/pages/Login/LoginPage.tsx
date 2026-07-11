import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { ChevronLeft, Delete } from 'lucide-react'
import { getDefaultRouteForUser } from '../../lib/access'
import { User } from '../../types'
import { supabase } from '../../lib/supabase'

const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Cloud auth state (web only — Electron always skips this step)
  const [needsCloudAuth, setNeedsCloudAuth] = useState(false)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [cloudLoading, setCloudLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  // Password reset state
  const [isPasswordReset, setIsPasswordReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const loadUsers = () => {
    window.api.auth.getUsers().then((list: User[]) => {
      setUsers(list.filter((u: User) => u.is_active))
    })
  }

  useEffect(() => {
    // Detect Supabase password recovery redirect (flag set in main.tsx)
    if (sessionStorage.getItem('supabase_pw_reset') === '1') {
      sessionStorage.removeItem('supabase_pw_reset')
      setIsPasswordReset(true)
      return
    }

    // Expired or invalid reset link
    if (sessionStorage.getItem('supabase_pw_reset_expired') === '1') {
      sessionStorage.removeItem('supabase_pw_reset_expired')
      setNeedsCloudAuth(true)
      setCloudError('Your password reset link has expired. Please sign in or request a new reset email.')
      return
    }

    // If the API supports checkCloudSession (web mode), verify before loading users
    if (typeof window.api.auth.checkCloudSession === 'function') {
      window.api.auth.checkCloudSession().then((ok: boolean) => {
        if (ok) {
          loadUsers()
        } else {
          setNeedsCloudAuth(true)
        }
      })
    } else {
      loadUsers()
    }
  }, [])

  const handlePasswordReset = async () => {
    if (!newPassword || !confirmPassword) return
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.')
      return
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters.')
      return
    }
    setResetLoading(true)
    setResetError('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message)
      setResetDone(true)
      // Clear the hash so a refresh doesn't re-trigger the reset flow
      window.history.replaceState(null, '', window.location.pathname)
    } catch (err: any) {
      setResetError(err?.message || 'Failed to update password.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleCloudLogin = async () => {
    if (!cloudEmail || !cloudPassword) return
    setCloudLoading(true)
    setCloudError('')
    try {
      const result = await window.api.auth.cloudLogin({ email: cloudEmail, password: cloudPassword })
      if (result.success) {
        try {
          if (typeof window.api.auth.syncCloudBusinessSettings === 'function') {
            await window.api.auth.syncCloudBusinessSettings()
          }
        } catch { /* non-fatal */ }
        try { await window.api.sync.force() } catch { /* non-fatal */ }
        setNeedsCloudAuth(false)
        loadUsers()
      } else {
        setCloudError(result.error || 'Invalid email or password.')
      }
    } catch (err: any) {
      setCloudError(err?.message || 'Login failed.')
    } finally {
      setCloudLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!cloudEmail.trim()) {
      setCloudError('Enter your email first so we can send the reset link.')
      return
    }
    if (typeof (window.api.auth as any).requestPasswordReset !== 'function') {
      setCloudError('Password reset is not available in this build.')
      return
    }

    setForgotLoading(true)
    setCloudError('')
    setResetEmailSent(false)
    try {
      const result = await (window.api.auth as any).requestPasswordReset(cloudEmail.trim())
      if (!result?.success) {
        setCloudError(result?.error || 'Failed to send password reset email.')
        return
      }
      setResetEmailSent(true)
    } catch (err: any) {
      setCloudError(err?.message || 'Failed to send password reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleSelect = (user: User) => {
    setSelected(user)
    setPin('')
    setError('')
  }

  const handleKey = (k: string) => {
    if (k === '⌫') {
      setPin(p => p.slice(0, -1))
      setError('')
      return
    }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    setError('')
    if (next.length === 4) {
      setTimeout(() => attemptLogin(selected!, next), 80)
    }
  }

  const attemptLogin = async (user: User, enteredPin: string) => {
    setLoading(true)
    try {
      const result = await window.api.auth.login(user.name, enteredPin)
      if (result.success) {
        login(result.user)
        navigate(getDefaultRouteForUser(result.user))
      } else {
        setError('Wrong PIN. Try again.')
        setPin('')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(`Login failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Password reset screen ──────────────────────────────────────────────────
  if (isPasswordReset) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="brand-gradient w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white text-2xl font-black">R</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Reset Password</h1>
            <p className="text-[var(--muted)] text-sm mt-1">Enter your new password below</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
            {resetDone ? (
              <>
                <p className="text-green-600 text-sm text-center font-medium">Password updated successfully!</p>
                <button
                  onClick={() => setIsPasswordReset(false)}
                  className="w-full py-3 rounded-xl brand-gradient text-white font-semibold text-base shadow hover:opacity-90 transition-opacity"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordReset()}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
                    autoComplete="new-password"
                  />
                </div>
                {resetError && <p className="text-red-500 text-sm text-center">{resetError}</p>}
                <button
                  onClick={handlePasswordReset}
                  disabled={resetLoading || !newPassword || !confirmPassword}
                  className="w-full py-3 rounded-xl brand-gradient text-white font-semibold text-base shadow hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {resetLoading ? 'Updating…' : 'Update Password'}
                </button>
              </>
            )}
          </div>
          <p className="text-center text-xs text-[var(--muted)] mt-8">Powered by Reyna Advanced POS</p>
        </div>
      </div>
    )
  }

  // ── Cloud auth screen (web only) ───────────────────────────────────────────
  if (needsCloudAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="brand-gradient w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white text-2xl font-black">R</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Reyna Advanced POS</h1>
            <p className="text-[var(--muted)] text-sm mt-1">Sign in to your account</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">Email</label>
              <input
                type="email"
                value={cloudEmail}
                onChange={e => setCloudEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCloudLogin()}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">Password</label>
              <input
                type="password"
                value={cloudPassword}
                onChange={e => setCloudPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCloudLogin()}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
                autoComplete="current-password"
              />
            </div>
            {cloudError && <p className="text-red-500 text-sm text-center">{cloudError}</p>}
            {resetEmailSent && (
              <p className="text-green-600 text-sm text-center">
                Reset email sent. Check your inbox and spam folder for the secure link.
              </p>
            )}
            <button
              onClick={handleCloudLogin}
              disabled={cloudLoading || !cloudEmail || !cloudPassword}
              className="w-full py-3 rounded-xl brand-gradient text-white font-semibold text-base shadow hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {cloudLoading ? 'Signing in…' : 'Sign In'}
            </button>
            <button
              onClick={() => {
                setShowForgotPassword(v => !v)
                setCloudError('')
                setResetEmailSent(false)
              }}
              className="text-sm text-[#1a8eff] hover:underline"
            >
              {showForgotPassword ? 'Hide forgot password' : 'Forgot password?'}
            </button>
            {showForgotPassword && (
              <button
                onClick={handleForgotPassword}
                disabled={forgotLoading || !cloudEmail.trim()}
                className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] font-medium hover:bg-[var(--bg-accent)] disabled:opacity-50 transition-colors"
              >
                {forgotLoading ? 'Sending reset email…' : 'Send secure reset email'}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-[var(--muted)] mt-8">Powered by Reyna Advanced POS</p>
        </div>
      </div>
    )
  }

  // ── User selection screen ───────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="brand-gradient w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white text-2xl font-black">R</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Reyna Advanced POS</h1>
            <p className="text-[var(--muted)] text-sm mt-1">Who's signing in?</p>
          </div>

          {/* User cards */}
          <div className="grid gap-3">
            {users.length === 0 && (
              <p className="text-[var(--muted)] text-center text-sm py-4">No accounts found.</p>
            )}
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => handleSelect(user)}
                className="glass-panel w-full active:scale-[0.98] rounded-2xl px-5 py-4 flex items-center gap-4 transition-all hover:shadow-md text-left"
              >
                <div className="brand-gradient w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <span className="text-white text-lg font-bold">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-[var(--text)] font-semibold text-base">{user.name}</p>
                  <p className="text-[var(--muted)] text-xs capitalize">{user.role}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-[var(--muted)] mt-8">Powered by Reyna Advanced POS</p>
        </div>
      </div>
    )
  }

  // ── PIN entry screen ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl shadow-2xl w-full max-w-sm p-8">

        <button
          onClick={() => { setSelected(null); setPin(''); setError('') }}
          className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--text)] text-sm mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div className="text-center mb-6">
          <div className="brand-gradient w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <span className="text-white text-2xl font-bold">{selected.name.charAt(0).toUpperCase()}</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text)]">{selected.name}</h2>
          <p className="text-[var(--muted)] text-sm capitalize">{selected.role}</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-4">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              pin.length > i
                ? 'bg-[var(--brand-500)] border-[var(--brand-500)] scale-110'
                : 'border-gray-300'
            }`} />
          ))}
        </div>

        {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}

        {/* PIN pad */}
        <div className="grid grid-cols-3 gap-2">
          {PIN_KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => k && handleKey(k)}
              disabled={loading || !k}
              className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                !k ? 'invisible' :
                k === '⌫'
                  ? 'bg-[var(--bg-accent)] text-[var(--muted)] hover:bg-[var(--brand-100)]'
                  : 'bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--brand-100)] hover:text-[var(--brand-600)] border border-[var(--border)]'
              }`}
            >
              {k === '⌫' ? <Delete size={18} className="mx-auto" /> : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
