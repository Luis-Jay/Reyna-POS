import { supabase } from '../supabase'
import { activationApi } from './activation'

export const BASIC_PRODUCT_LIMIT = 300

type AccessState = {
  activated: boolean
  limit: number
  totalActive: number
  accessibleCount: number
}

type ProductLockRow = {
  id: string
  basic_locked?: boolean | null
}

const lastEnsuredAt = new Map<string, number>()
const ENSURE_TTL_MS = 30_000
const UPDATE_CHUNK_SIZE = 100

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandomIds(ids: string[], count: number) {
  if (count <= 0) return []
  if (count >= ids.length) return [...ids]
  return shuffle(ids).slice(0, count)
}

async function updateLockState(businessId: string, ids: string[], locked: boolean) {
  if (ids.length === 0) return
  for (let index = 0; index < ids.length; index += UPDATE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + UPDATE_CHUNK_SIZE)
    const { error } = await supabase
      .from('catalog_products')
      .update({
        basic_locked: locked,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)
      .in('id', chunk)

    if (error) throw error
  }
}

export async function ensureBasicProductAccess(businessId: string, options?: { force?: boolean }): Promise<AccessState> {
  const activated = (await activationApi.getStatus()).activated === true
  if (activated) {
    const { count } = await supabase
      .from('catalog_products')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .eq('is_active', true)

    return {
      activated: true,
      limit: BASIC_PRODUCT_LIMIT,
      totalActive: count ?? 0,
      accessibleCount: count ?? 0,
    }
  }

  const now = Date.now()
  const lastRun = lastEnsuredAt.get(businessId) ?? 0
  if (!options?.force && now - lastRun < ENSURE_TTL_MS) {
    const { count } = await supabase
      .from('catalog_products')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .eq('basic_locked', false)

    const { count: totalCount } = await supabase
      .from('catalog_products')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .eq('is_active', true)

    return {
      activated: false,
      limit: BASIC_PRODUCT_LIMIT,
      totalActive: totalCount ?? 0,
      accessibleCount: count ?? 0,
    }
  }

  const { data, error } = await supabase
    .from('catalog_products')
    .select('id, basic_locked')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .limit(10000)

  if (error) throw error

  const rows = (data ?? []) as ProductLockRow[]
  const target = Math.min(BASIC_PRODUCT_LIMIT, rows.length)
  const unlockedIds = rows.filter(row => row.basic_locked !== true).map(row => row.id)
  const lockedIds = rows.filter(row => row.basic_locked === true).map(row => row.id)

  const toLock = unlockedIds.length > target
    ? pickRandomIds(unlockedIds, unlockedIds.length - target)
    : []
  const nextUnlockedCount = unlockedIds.length - toLock.length
  const toUnlock = nextUnlockedCount < target
    ? pickRandomIds(lockedIds, target - nextUnlockedCount)
    : []

  await updateLockState(businessId, toLock, true)
  await updateLockState(businessId, toUnlock, false)
  lastEnsuredAt.set(businessId, now)

  return {
    activated: false,
    limit: BASIC_PRODUCT_LIMIT,
    totalActive: rows.length,
    accessibleCount: target,
  }
}

export async function assertBasicProductAccessible(businessId: string, productId: string) {
  const access = await ensureBasicProductAccess(businessId)
  if (access.activated) return

  const { data, error } = await supabase
    .from('catalog_products')
    .select('id, basic_locked')
    .eq('business_id', businessId)
    .eq('id', productId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .single()

  if (error || !data || data.basic_locked === true) {
    throw new Error('This product is locked on the Basic plan. Upgrade to Pro to access all products.')
  }
}

export async function assertBasicProductCreationAllowed(businessId: string) {
  const access = await ensureBasicProductAccess(businessId, { force: true })
  if (access.activated) return
  if (access.totalActive >= BASIC_PRODUCT_LIMIT && access.accessibleCount >= BASIC_PRODUCT_LIMIT) {
    throw new Error('This Basic account is limited to 300 unlocked products. Upgrade to Pro to add more products.')
  }
}
