import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { createWebApi } from './lib/web-api/index'

// When running as a plain web app (not inside Electron), the preload script
// won't have set window.api. Inject synchronously so it's ready before
// any component mounts and calls window.api.*
if (!(window as any).api) {
  ;(window as any).api = createWebApi()
}

// Expired/invalid password-reset links come back as an error in the hash
// (no recovery token to preserve), so it's safe to flag this immediately.
// A *valid* recovery link's access_token must NOT be touched here — Supabase
// parses it out of the hash asynchronously, and App.tsx reacts to the
// PASSWORD_RECOVERY auth event once that parsing has actually succeeded.
if (window.location.hash.includes('error=access_denied') || window.location.hash.includes('otp_expired')) {
  sessionStorage.setItem('supabase_pw_reset_expired', '1')
}

const originalConsoleInfo = console.info
console.info = (...args: unknown[]) => {
  const [firstArg] = args
  if (
    typeof firstArg === 'string' &&
    firstArg.includes('Download the React DevTools for a better development experience')
  ) {
    return
  }

  originalConsoleInfo(...args)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
