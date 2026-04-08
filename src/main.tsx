import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

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
