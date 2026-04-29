// In Electron, window.api is injected by the preload script (contextBridge).
// In the web build, it's injected by src/main.tsx from the Supabase-backed web API.
// Both implement the same shape so all frontend code works unchanged.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: any
  }
}

export {}
