import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { ArrowLeft, LogOut } from 'lucide-react'

interface TopBarProps {
  title: string
  back?: string
  actions?: React.ReactNode
}

export default function TopBar({ title, back, actions }: TopBarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    await window.api.auth.logout()
    logout()
    navigate('/login')
  }

  return (
    <div className="brand-gradient relative shrink-0 overflow-hidden border-b border-white/15">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%)]" />
      <div className="relative px-3 py-3 sm:px-5 sm:py-0">
        <div className="flex min-h-[64px] items-center gap-2 sm:gap-3">
          {back && (
            <button onClick={() => navigate(back)} className="shrink-0 rounded-full border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/20">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base sm:text-lg font-semibold text-white">{title}</h1>
            <p className="text-[11px] sm:text-xs uppercase tracking-[0.24em] text-emerald-50/75">Reyna Advanced POS</p>
          </div>
          {actions && (
            <div className="hidden md:flex items-center gap-2">
              {actions}
            </div>
          )}
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] sm:text-xs font-semibold tracking-[0.18em] text-white/90">
            {user?.name?.toUpperCase()}
          </span>
          <button onClick={handleLogout} className="shrink-0 rounded-full border border-white/15 bg-white/10 p-2 text-white transition hover:bg-white/20">
            <LogOut size={18} />
          </button>
        </div>
        {actions && (
          <div className="mt-1 flex gap-2 overflow-x-auto pb-2 md:hidden">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
