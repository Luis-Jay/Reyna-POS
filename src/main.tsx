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
