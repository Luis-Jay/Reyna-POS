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

function hasElectronApi() {
  return typeof window !== 'undefined' && 'api' in window
}

function BrowserUnsupported() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Reyna POS</p>
        <h1 className="mt-4 text-3xl font-semibold">Desktop app only</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          The web version has been removed. Open Reyna POS through the installed desktop app to continue.
        </p>
      </div>
    </div>
  )
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
    {hasElectronApi() ? <App /> : <BrowserUnsupported />}
  </React.StrictMode>
)
