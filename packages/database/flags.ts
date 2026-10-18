import prisma from './index'

/**
 * Feature flags (persona_rollout_plan.md §5 J, §7 "Flags, not branches").
 *
 * Every professional surface ships dark behind one of these keys; turning it
 * on is a row update, never a deploy. A per-tenant override wins over the
 * global value, so a surface can be lit for the founder's test organisation,
 * then the first external one, then everybody (the test-in-production
 * protocol, plan §7). Overrides are keyed by tenantId — what RLS scopes on
 * today; the Organisation model is 1:1 with Tenant.
 *
 * Reads go through an in-process cache with a 15-second TTL, so a flip is
 * live on every instance within 15 seconds without any cross-instance
 * signalling. The tables are system tables (no RLS) read on the owner
 * connection only; nothing here runs under withTenant.
 */

export const FLAG_KEYS = [
  'counsel_surfaces',
  'counsel_checkout',
  'offices',
  'record_desk',
  'clinic_inbox',
  'long_records',
] as const

export type FlagKey = (typeof FLAG_KEYS)[number]

export const isFlagKey = (key: unknown): key is FlagKey =>
  typeof key === 'string' && (FLAG_KEYS as readonly string[]).includes(key)

/** Refuses an unknown key before it reaches the database. */
export function assertFlagKey(key: unknown): asserts key is FlagKey {
  if (!isFlagKey(key)) throw new UnknownFlagKeyError(key)
}

export class UnknownFlagKeyError extends Error {
  readonly key: unknown
  constructor(key: unknown) {
    super(`Unknown feature flag: ${typeof key === 'string' ? key : String(key)}`)
    this.name = 'UnknownFlagKeyError'
    this.key = key
  }
}

export const FLAG_CACHE_TTL_MS = 15_000

interface FlagSnapshot {
  /** Global value per key; a key missing from the table reads as false. */
  global: Map<string, boolean>
  /** `${key}:${tenantId}` → override value. */
  overrides: Map<string, boolean>
  loadedAt: number
}

let snapshot: FlagSnapshot | null = null
let inflight: Promise<FlagSnapshot> | null = null

/** Drops the in-process cache; the next read goes to the database. */
export function __invalidateFlagCache() {
  snapshot = null
  inflight = null
}

const overrideKey = (key: string, tenantId: string) => `${key}:${tenantId}`

async function loadSnapshot(): Promise<FlagSnapshot> {
  const [flags, overrides] = await Promise.all([
    prisma.featureFlag.findMany({ select: { key: true, enabled: true } }),
    prisma.featureFlagOverride.findMany({ select: { flagKey: true, tenantId: true, enabled: true } }),
  ])
  return {
    global: new Map(flags.map((f) => [f.key, f.enabled])),
    overrides: new Map(overrides.map((o) => [overrideKey(o.flagKey, o.tenantId), o.enabled])),
    loadedAt: Date.now(),
  }
}

/** The cached snapshot, refreshed when older than the TTL. One load at a time. */
async function getSnapshot(): Promise<FlagSnapshot> {
  if (snapshot && Date.now() - snapshot.loadedAt < FLAG_CACHE_TTL_MS) return snapshot
  if (!inflight) {
    inflight = loadSnapshot()
      .then((s) => {
        snapshot = s
        return s
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

const effective = (s: FlagSnapshot, key: string, tenantId?: string) => {
  if (tenantId) {
    const o = s.overrides.get(overrideKey(key, tenantId))
    if (o !== undefined) return o
  }
  return s.global.get(key) ?? false
}

/**
 * Is `key` on for this tenant? Override wins over global; a key that is not
 * in the table is off. Unknown keys are refused rather than read as false, so
 * a typo in a route guard fails loudly in tests instead of shipping dark.
 */
export async function isFlagOn(key: FlagKey, tenantId?: string): Promise<boolean> {
  assertFlagKey(key)
  return effective(await getSnapshot(), key, tenantId)
}

export interface FlagView {
  key: FlagKey
  /** The global value. */
  enabled: boolean
  /** What this tenant actually gets (the override when one exists). */
  effective: boolean
  /** True when a tenant override is in force for this tenant. */
  overridden: boolean
}

/** Every known key with its global and effective value for `tenantId`. Cached. */
export async function listFlags(tenantId?: string): Promise<FlagView[]> {
  const s = await getSnapshot()
  return FLAG_KEYS.map((key) => {
    const o = tenantId ? s.overrides.get(overrideKey(key, tenantId)) : undefined
    const enabled = s.global.get(key) ?? false
    return { key, enabled, effective: o ?? enabled, overridden: o !== undefined }
  })
}

export interface FlagChange {
  key: FlagKey
  tenantId: string | null
  before: boolean | null
  after: boolean | null
}

/** Sets the global value. Returns before/after for the audit row. Uncached read. */
export async function setFlag(key: FlagKey, enabled: boolean, actorId: string): Promise<FlagChange> {
  assertFlagKey(key)
  const prev = await prisma.featureFlag.findUnique({ where: { key }, select: { enabled: true } })
  if (!prev) throw new UnknownFlagKeyError(key) // seeded by migration; absent means a bad deploy
  await prisma.featureFlag.update({ where: { key }, data: { enabled, updatedBy: actorId } })
  __invalidateFlagCache()
  return { key, tenantId: null, before: prev.enabled, after: enabled }
}

/** Sets (or replaces) a tenant override. `before` is the previous override, null when there was none. */
export async function setOverride(
  key: FlagKey,
  tenantId: string,
  enabled: boolean,
  note: string | null | undefined,
  actorId: string
): Promise<FlagChange> {
  assertFlagKey(key)
  const prev = await prisma.featureFlagOverride.findUnique({
    where: { flagKey_tenantId: { flagKey: key, tenantId } },
    select: { enabled: true },
  })
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_tenantId: { flagKey: key, tenantId } },
    create: { flagKey: key, tenantId, enabled, note: note ?? null, updatedBy: actorId },
    update: { enabled, note: note ?? null, updatedBy: actorId },
  })
  __invalidateFlagCache()
  return { key, tenantId, before: prev?.enabled ?? null, after: enabled }
}

/** Removes a tenant override so the global value applies again. `after` is null. */
export async function clearOverride(key: FlagKey, tenantId: string, _actorId: string): Promise<FlagChange> {
  assertFlagKey(key)
  const prev = await prisma.featureFlagOverride.findUnique({
    where: { flagKey_tenantId: { flagKey: key, tenantId } },
    select: { enabled: true },
  })
  if (prev) await prisma.featureFlagOverride.delete({ where: { flagKey_tenantId: { flagKey: key, tenantId } } })
  __invalidateFlagCache()
  return { key, tenantId, before: prev?.enabled ?? null, after: null }
}

export interface FlagOverrideView {
  tenantId: string
  enabled: boolean
  note: string | null
  updatedBy: string
  updatedAt: Date
}

export interface FlagAdminView {
  key: FlagKey
  enabled: boolean
  description: string
  updatedBy: string | null
  updatedAt: Date
  overrides: FlagOverrideView[]
}

/** The staff view: every flag with its description and override list. Uncached. */
export async function listFlagsForAdmin(): Promise<FlagAdminView[]> {
  const rows = await prisma.featureFlag.findMany({
    include: { overrides: { orderBy: { updatedAt: 'desc' } } },
  })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return FLAG_KEYS.flatMap((key) => {
    const r = byKey.get(key)
    if (!r) return []
    return [
      {
        key,
        enabled: r.enabled,
        description: r.description,
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
        overrides: r.overrides.map((o) => ({
          tenantId: o.tenantId,
          enabled: o.enabled,
          note: o.note,
          updatedBy: o.updatedBy,
          updatedAt: o.updatedAt,
        })),
      },
    ]
  })
}
