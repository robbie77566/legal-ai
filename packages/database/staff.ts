import type { AccountKind, Role, StaffGrantKind } from '@prisma/client'

/**
 * Identity expand step (persona_rollout_plan.md §5 A): the bridge between the
 * old single `Role` column and the target model (`accountKind` + a SET of
 * `StaffGrant` rows). Every caller goes through these helpers so nothing
 * depends on whether the backfill, the swap or the contract step has run.
 *
 *  - Before the backfill: no grant rows exist → the Role says what a staff
 *    member may do (exactly what the gates do today).
 *  - After it: the grant rows are the truth, and a revoked grant (revokedAt
 *    set) takes effect on the next request, not the next sign-in.
 *  - After the contract step: Role is gone and only the rows remain.
 */

export const STAFF_ROLES: ReadonlySet<Role> = new Set<Role>([
  'ADMIN',
  'SUPPORT',
  'ATTORNEY',
  'INVESTIGATOR',
  'VIEWER',
])

/** The grant a legacy Role maps to (staff_console.md §1). INVESTIGATOR and VIEWER have no console surface. */
export function grantKindForRole(role: Role): StaffGrantKind | null {
  switch (role) {
    case 'ADMIN':
      return 'ADMIN'
    case 'SUPPORT':
      return 'SUPPORT'
    case 'ATTORNEY':
      return 'REVIEWER'
    default:
      return null
  }
}

export interface GrantLike {
  kind: StaffGrantKind
  revokedAt: Date | null
}

export interface StaffLike {
  role: Role
  accountKind?: AccountKind | null
  grants?: GrantLike[] | null
}

/**
 * The set of grants a person effectively holds. Grant rows, when any exist
 * for the person (revoked ones included), are authoritative; with no rows at
 * all the legacy Role decides. A PROFESSIONAL or FAMILY account never holds a
 * staff grant whatever its Role column says.
 */
export function effectiveStaffGrants(user: StaffLike): StaffGrantKind[] {
  if (effectiveAccountKind(user) !== 'STAFF') return []
  const rows = user.grants ?? []
  if (rows.length > 0) {
    return Array.from(new Set(rows.filter((g) => g.revokedAt === null).map((g) => g.kind)))
  }
  const fromRole = grantKindForRole(user.role)
  return fromRole ? [fromRole] : []
}

/**
 * Which surface a person belongs to. The stored accountKind wins; a row still
 * at the column default (FAMILY) with a staff Role is a staff account created
 * by a code path from before the expand step, and is treated as STAFF — the
 * same answer the migration's backfill gives it.
 */
export function effectiveAccountKind(user: { role: Role; accountKind?: AccountKind | null }): AccountKind {
  if (user.accountKind && user.accountKind !== 'FAMILY') return user.accountKind
  return STAFF_ROLES.has(user.role) ? 'STAFF' : 'FAMILY'
}

/** ADMIN is a superset of SUPPORT by construction (staff_console.md §1). */
export function hasGrant(grants: readonly StaffGrantKind[], kind: StaffGrantKind): boolean {
  if (grants.includes(kind)) return true
  return kind === 'SUPPORT' && grants.includes('ADMIN')
}
