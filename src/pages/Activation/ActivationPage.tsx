import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, Package, Users, Tag, CreditCard, CheckCircle, Loader, Sparkles } from 'lucide-react'

const FEATURES = [
  { icon: Users,         text: 'Send SMS reminders to debtors using saved contact numbers' },
  { icon: BarChart2,     text: 'Auto-generate reports like trial balance, income statement, and profit and loss' },
  { icon: Package,       text: 'Unlock future premium business insights and advanced reporting tools' },
  { icon: Tag,           text: 'Keep setup and core POS access free from payment prompts at the start' },
  { icon: CreditCard,    text: 'Manage billing separately only when you want Pro-only features' },
]

type Step = 'idle' | 'opening' | 'checking' | 'success' | 'error'

export default function ActivationPage({ onActivated }: { onActivated: () => void }) {
  const navigate = useNavigate()
  const [installId, setInstallId] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingNotice, setPendingNotice] = useState('')
  const [showId, setShowId] = useState(false)
  const successTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    window.api.activation.getInstallId().then(setInstallId)
  }, [])

  useEffect(() => {
    if (step !== 'opening' && step !== 'checking') return

    let failedChecks = 0

    const interval = window.setInterval(async () => {
      const result = await window.api.activation.checkStatus()
      if (result.activated && result.expiresAt) {
        await window.api.activation.markActivated(result.expiresAt)
        window.clearInterval(interval)
        setStep('success')
        setErrorMsg('')
        successTimeoutRef.current = window.setTimeout(() => {
          onActivated()
          navigate('/settings')
        }, 1500)
        return
      }

      failedChecks += 1
      if (step === 'opening' && failedChecks >= 2) {
        setStep('checking')
      }

      if (!result.error && failedChecks >= 3) {
        setPendingNotice('Payment may already be completed, but the activation server has not confirmed it yet. You can close the browser tab and click "I\'ve Completed Payment" below.')
      }

      if (result.error) {
        window.clearInterval(interval)
        setStep('error')
        setErrorMsg(result.error)
      }
    }, 4000)

    return () => {
      window.clearInterval(interval)
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current)
        successTimeoutRef.current = null
      }
    }
  }, [step, navigate, onActivated])

  const handlePay = async () => {
    setStep('opening')
    setErrorMsg('')
    setPendingNotice('')
    try {
      const result = await window.api.activation.createInvoice()
      if (!result.success) {
        setStep('error')
        setErrorMsg(result.error || 'Failed to open payment page. Check your internet connection.')
      } else if (result.alreadyActivated) {
        const status = await window.api.activation.getStatus()
        if (status.activated && status.expiresAt) {
          setStep('success')
          window.setTimeout(() => {
            onActivated()
            navigate('/settings')
          }, 1500)
        } else {
          setStep('checking')
          await handleCheck()
        }
      } else {
        setStep('checking')
        setErrorMsg('')
      }
    } catch (err: any) {
      setStep('error')
      setErrorMsg(err?.message || 'Failed to open payment page. Check your internet connection.')
    }
  }

  const handleCheck = async () => {
    setStep('checking')
    setErrorMsg('')
    setPendingNotice('')
    try {
      const result = await window.api.activation.checkStatus()
      if (result.activated && result.expiresAt) {
        await window.api.activation.markActivated(result.expiresAt)
        setStep('success')
        setTimeout(() => {
          onActivated()
          navigate('/settings')
        }, 1500)
      } else {
        setStep('error')
        setErrorMsg(result.error || 'Payment not found yet. Complete the payment and try again.')
      }
    } catch (error) {
      setStep('error')
      setErrorMsg(error instanceof Error ? error.message : 'Network error, please try again')
    }
  }

  if (step === 'success') {
    return (
      <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Pro Subscription Active</h2>
          <p className="text-gray-500">Your premium features are being unlocked...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1a8eff] rounded-2xl mb-4 shadow-lg">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Reyna Pro</h1>
          <p className="text-gray-500 mt-1">Upgrade only for premium features, not for initial app access</p>
        </div>

        {/* Price card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-4">
          <div className="bg-[#1a8eff] px-6 py-5 text-white text-center">
            <p className="text-sm font-medium opacity-80 mb-1">Optional Pro Subscription</p>
            <p className="text-5xl font-bold">₱399<span className="text-2xl font-medium">/mo</span></p>
            <p className="text-sm opacity-80 mt-1">Only required for Pro-only tools</p>
          </div>

          {/* Features */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What Pro adds</p>
            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={14} className="text-[#1a8eff]" />
                  </div>
                  <p className="text-sm text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment methods */}
          <div className="px-6 pb-5">
            <p className="text-xs text-gray-400 text-center mb-3">Accepts GCash, Maya, Credit/Debit Card, and more</p>

            {(step === 'opening' || step === 'checking') && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <p className="font-semibold">Waiting for payment confirmation...</p>
                <p className="mt-1">
                  Finish the payment in your browser. After payment succeeds, you can close that browser tab. Reyna POS will automatically detect the subscription and activate here.
                </p>
              </div>
            )}

            {pendingNotice && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold">Activation is taking longer than expected.</p>
                <p className="mt-1">{pendingNotice}</p>
              </div>
            )}

            {/* Pay button */}
            <button
              onClick={handlePay}
              disabled={step === 'opening'}
              className="w-full bg-[#1a8eff] hover:bg-[#0077e6] disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              {step === 'opening' ? (
                <><Loader size={18} className="animate-spin" /> Opening payment page...</>
              ) : step === 'checking' ? (
                <><Loader size={18} className="animate-spin" /> Waiting for payment confirmation...</>
              ) : (
                <><CreditCard size={18} /> Subscribe to Reyna Pro</>

              )}
            </button>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">already paid?</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Check button */}
            <button
              onClick={handleCheck}
              disabled={step === 'checking' || step === 'opening'}
              className="w-full border-2 border-gray-200 hover:border-[#1a8eff] hover:text-[#1a8eff] disabled:opacity-60 text-gray-600 py-3 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              {step === 'checking' ? (
                <><Loader size={16} className="animate-spin" /> Checking payment...</>
              ) : step === 'opening' ? (
                <><Loader size={16} className="animate-spin" /> Waiting for automatic activation...</>
              ) : (
                <><CheckCircle size={16} /> I've Completed Payment</>
              )}
            </button>

            {/* Error message */}
            {step === 'error' && errorMsg && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{errorMsg}</p>
              </div>
            )}

            <button
              onClick={() => navigate('/settings')}
              className="mt-3 w-full text-sm text-gray-500 transition-colors hover:text-gray-700"
            >
              Back to Settings
            </button>
          </div>
        </div>

        {/* Installation ID */}
        <div className="text-center">
          <button onClick={() => setShowId(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            {showId ? 'Hide' : 'Show'} Installation ID (for support)
          </button>
          {showId && installId && (
            <p className="mt-1 font-mono text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-200">
              {installId}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
