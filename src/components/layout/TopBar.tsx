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
    <div className="h-14 bg-[#1a8eff] flex items-center px-4 gap-3 shrink-0">
      {back && (
        <button onClick={() => navigate(back)} className="text-white hover:text-blue-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
      )}
      <h1 className="text-white font-semibold text-lg flex-1">{title}</h1>
      {actions}
      <span className="text-white text-sm font-medium">{user?.name?.toUpperCase()}</span>
      <button onClick={handleLogout} className="text-white hover:text-blue-200 transition-colors ml-1">
        <LogOut size={18} />
      </button>
    </div>
  )
}
