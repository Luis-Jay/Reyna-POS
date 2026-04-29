// Settings are stored in localStorage for the web version.
// Keys are identical to the Electron SQLite settings table, but we scope them
// per signed-in cloud account so multiple Reyna accounts do not overwrite each
// other in the same browser profile.

import { supabase } from '../supabase'

const PREFIX = 'reyna_setting_'
const SCOPED_SEPARATOR = '__'
const GUEST_SCOPE = 'guest'

function isScopedStorageKey(key: string) {
  return key.startsWith(PREFIX) && key.includes(SCOPED_SEPARATOR)
}

function buildScopedKey(scope: string, key: string) {
  return `${PREFIX}${scope}${SCOPED_SEPARATOR}${key}`
}

async function getScope() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ? `user:${session.user.id}` : GUEST_SCOPE
}

async function migrateLegacySettingsIfNeeded(scope: string) {
  if (scope === GUEST_SCOPE) return

  let hasScopedSettings = false
  let hasLegacySettings = false

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PREFIX)) continue

    if (isScopedStorageKey(key)) {
      if (key.startsWith(`${PREFIX}${scope}${SCOPED_SEPARATOR}`)) {
        hasScopedSettings = true
        break
      }
      continue
    }

    hasLegacySettings = true
  }

  if (hasScopedSettings || !hasLegacySettings) return

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PREFIX) || isScopedStorageKey(key)) continue

    const settingKey = key.slice(PREFIX.length)
    const value = localStorage.getItem(key)
    if (value != null) {
      localStorage.setItem(buildScopedKey(scope, settingKey), value)
    }
  }
}

export const settingsApi = {
  getAll: async (): Promise<Record<string, string>> => {
    const scope = await getScope()
    await migrateLegacySettingsIfNeeded(scope)

    const result: Record<string, string> = {}
    const scopedPrefix = `${PREFIX}${scope}${SCOPED_SEPARATOR}`

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(scopedPrefix)) continue

      const value = localStorage.getItem(key)
      if (value != null) {
        result[key.slice(scopedPrefix.length)] = value
      }
    }

    return result
  },

  get: async (key: string): Promise<string | null> => {
    const scope = await getScope()
    await migrateLegacySettingsIfNeeded(scope)
    return localStorage.getItem(buildScopedKey(scope, key))
  },

  set: async (key: string, value: string): Promise<{ success: boolean }> => {
    const scope = await getScope()
    localStorage.setItem(buildScopedKey(scope, key), value)
    return { success: true }
  },

  setMany: async (kv: Record<string, string>): Promise<{ success: boolean }> => {
    const scope = await getScope()
    for (const [key, value] of Object.entries(kv)) {
      localStorage.setItem(buildScopedKey(scope, key), value)
    }
    return { success: true }
  },
}
