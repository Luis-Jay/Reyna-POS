import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Web build: produces a deployable SPA (no Electron, no Node.js deps)
// Uses index.web.html which has a relaxed CSP that allows Supabase requests.
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Point Vite at the web-specific HTML entry
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.web.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5174,
    // Serve index.web.html instead of index.html
    open: '/index.web.html',
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', 'electron', 'serialport', '@node-escpos/core', '@node-escpos/usb-adapter'],
  },
  define: {
    __IS_WEB__: true,
    __IS_ELECTRON__: false,
  },
})
