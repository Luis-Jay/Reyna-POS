import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

const PIN_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [name, setName] = useState('Admin')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleKey = (k: string) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setError('') }
    else if (pin.length < 6) { setPin(p => p + k); setError('') }
  }

  const handleLogin = async () => {
    if (!pin) { setError('Enter your PIN'); return }
    setLoading(true)
    try {
      const result = await window.api.auth.login(name, pin)
      if (result.success) {
        login(result.user)
        navigate(result.user.role === 'admin' ? '/' : '/pos')
      } else {
        setError(result.error || 'Invalid credentials')
        setPin('')
      }
    } catch (e) {
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  // Auto-submit on 4-digit PIN
  const handlePinInput = (k: string) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    const newPin = pin + k
    setPin(newPin)
    setError('')
    if (newPin.length === 4) {
      setTimeout(() => {
        (async () => {
          setLoading(true)
          try {
            const result = await window.api.auth.login(name, newPin)
            if (result.success) {
              login(result.user)
              navigate(result.user.role === 'admin' ? '/' : '/pos')
            } else {
              setError(result.error || 'Invalid credentials')
              setPin('')
            }
          } catch { setError('Login failed') }
          finally { setLoading(false) }
        })()
      }, 100)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a8eff] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1a8eff] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Reyna POS</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Name selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">Account</label>
          <select
            value={name}
            onChange={e => { setName(e.target.value); setPin(''); setError('') }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1a8eff]"
          >
            <option value="admin">Admin</option>
            <option value="cashier">Cashier</option>
          </select>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-4">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${
              pin.length > i ? 'bg-[#1a8eff] border-[#1a8eff]' : 'border-gray-300'
            }`} />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center mb-3">{error}</p>
        )}

        {/* PIN pad */}
        <div className="grid grid-cols-3 gap-2">
          {PIN_KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => k && handlePinInput(k)}
              disabled={loading || !k}
              className={`h-14 rounded-xl text-xl font-semibold transition-all ${
                !k ? 'invisible' :
                k === '⌫'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95'
                  : 'bg-gray-50 text-gray-800 hover:bg-[#e6f2ff] hover:text-[#1a8eff] active:scale-95 border border-gray-200'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || pin.length === 0}
          className="mt-4 w-full bg-[#1a8eff] text-white py-3 rounded-xl font-semibold text-base hover:bg-[#0077e6] active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
