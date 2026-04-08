import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { ChevronLeft, Delete } from 'lucide-react'

const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

type User = { id: string; name: string; role: string; is_active: number }

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.auth.getUsers().then((list: User[]) => {
      setUsers(list.filter(u => u.is_active))
    })
  }, [])

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
        navigate(result.user.role === 'admin' ? '/' : '/pos')
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
