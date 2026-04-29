// Settings are stored in localStorage for the web version.
// Keys are identical to the Electron SQLite settings table.

const PREFIX = 'reyna_setting_'

function lsKey(key: string) {
  return `${PREFIX}${key}`
}

export const settingsApi = {
  getAll: async (): Promise<Record<string, string>> => {
    const result: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith(PREFIX)) {
        result[k.slice(PREFIX.length)] = localStorage.getItem(k)!
      }
    }
    return result
  },

  get: async (key: string): Promise<string | null> => {
    return localStorage.getItem(lsKey(key))
  },

  set: async (key: string, value: string): Promise<{ success: boolean }> => {
    localStorage.setItem(lsKey(key), value)
    return { success: true }
  },

  setMany: async (kv: Record<string, string>): Promise<{ success: boolean }> => {
    for (const [key, value] of Object.entries(kv)) {
      localStorage.setItem(lsKey(key), value)
    }
    return { success: true }
  },
}
