import type Database from 'better-sqlite3'
import { getDb } from '../db'
import { isActivated } from '../ipc/activation.ipc'
import { scheduleAutoSync } from '../ipc/sync.ipc'

export const BASIC_PRODUCT_LIMIT = 300

type ProductLockRow = {
  id: string
  basic_locked?: number | null
}

type BasicProductAccessState = {
  activated: boolean
  limit: number
  totalActive: number
  accessibleCount: number
}

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

export function ensureBasicProductAccess(db: Database.Database = getDb()): BasicProductAccessState {
  if (isActivated()) {
    const totalActive = Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL AND is_active = 1`).get() as { count?: number } | undefined)?.count ?? 0,
    )
    return {
      activated: true,
      limit: BASIC_PRODUCT_LIMIT,
      totalActive,
      accessibleCount: totalActive,
    }
  }

  const rows = db.prepare(`
    SELECT id, basic_locked
    FROM products
    WHERE deleted_at IS NULL AND is_active = 1
  `).all() as ProductLockRow[]

  const target = Math.min(BASIC_PRODUCT_LIMIT, rows.length)
  const unlockedIds = rows.filter(row => Number(row.basic_locked ?? 0) === 0).map(row => row.id)
  const lockedIds = rows.filter(row => Number(row.basic_locked ?? 0) !== 0).map(row => row.id)

  const toLock = unlockedIds.length > target
    ? pickRandomIds(unlockedIds, unlockedIds.length - target)
    : []
  const nextUnlockedCount = unlockedIds.length - toLock.length
  const toUnlock = nextUnlockedCount < target
    ? pickRandomIds(lockedIds, target - nextUnlockedCount)
    : []

  if (toLock.length || toUnlock.length) {
    const lockStmt = db.prepare(`
      UPDATE products
      SET basic_locked = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
    const tx = db.transaction(() => {
      for (const id of toLock) lockStmt.run(1, id)
      for (const id of toUnlock) lockStmt.run(0, id)
    })
    tx()
    scheduleAutoSync()
  }

  return {
    activated: false,
    limit: BASIC_PRODUCT_LIMIT,
    totalActive: rows.length,
    accessibleCount: target,
  }
}

export function getBasicProductFilter(alias = 'p') {
  if (isActivated()) return ''
  ensureBasicProductAccess()
  return ` AND COALESCE(${alias}.basic_locked, 0) = 0`
}

export function assertBasicProductAccessible(productId: string, db: Database.Database = getDb()) {
  const access = ensureBasicProductAccess(db)
  if (access.activated) return

  const row = db.prepare(`
    SELECT basic_locked
    FROM products
    WHERE id = ? AND deleted_at IS NULL AND is_active = 1
  `).get(productId) as { basic_locked?: number | null } | undefined

  if (!row || Number(row.basic_locked ?? 0) !== 0) {
    throw new Error('This product is locked on the Basic plan. Upgrade to Pro to access all products.')
  }
}

export function assertBasicProductCreationAllowed(db: Database.Database = getDb()) {
  const access = ensureBasicProductAccess(db)
  if (access.activated) return
  if (access.totalActive >= BASIC_PRODUCT_LIMIT && access.accessibleCount >= BASIC_PRODUCT_LIMIT) {
    throw new Error('This Basic account is limited to 300 unlocked products. Upgrade to Pro to add more products.')
  }
}
