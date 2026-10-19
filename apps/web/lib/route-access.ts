/**
 * Route protection matrix for the web middleware (auth design §12.4, system
 * design §10.2, persona_rollout_plan.md §5 A). A pure function so the matrix
 * is unit-tested row by row; middleware.ts only feeds it the token and path.
 * The API re-enforces the same matrix per route and is the real gate.
 *
 *  - /counsel               : PROFESSIONAL only (except /counsel/join, which the
 *                             middleware does not match: an invitation is
 *                             accepted signed out, token-verified by the API)
 *  - /ops                   : ADMIN | SUPPORT (the API narrows SUPPORT to reads + unblocking actions)
 *  - /qa                    : ADMIN | ATTORNEY
 *  - /case, /account, /cases: any authenticated user
 *
 * /dashboard and /workspace (the 2025 mocked build) were removed by workstream
 * F; the Team page lives at /ops/team and is gated with the rest of /ops.
 *
 * A PROFESSIONAL is never authorised for a staff surface, whatever the legacy
 * `role` column says: Role.ATTORNEY is a staff reviewer, not a customer.
 */
const STAFF_ROLES = new Set(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER'])
const STAFF_PATHS = ['/ops', '/qa']

export interface RouteIdentity {
  role?: unknown
  accountKind?: unknown
}

/** FAMILY | PROFESSIONAL | STAFF; a token issued before the expand step has no claim and is read from its role. */
export function accountKindOf(token: RouteIdentity): 'FAMILY' | 'PROFESSIONAL' | 'STAFF' {
  const kind = token.accountKind
  if (kind === 'PROFESSIONAL' || kind === 'STAFF' || kind === 'FAMILY') return kind
  const role = typeof token.role === 'string' ? token.role : ''
  return STAFF_ROLES.has(role) || role === 'SUPPORT' ? 'STAFF' : 'FAMILY'
}

export function isAuthorized(path: string, token: RouteIdentity | null | undefined): boolean {
  if (!token) return false
  const role = typeof token.role === 'string' ? token.role : ''
  const kind = accountKindOf(token)

  if (path.startsWith('/counsel')) return kind === 'PROFESSIONAL'
  if (kind === 'PROFESSIONAL' && STAFF_PATHS.some((p) => path.startsWith(p))) return false

  if (path.startsWith('/ops')) return role === 'ADMIN' || role === 'SUPPORT'
  if (path.startsWith('/qa')) return role === 'ADMIN' || role === 'ATTORNEY'
  return true // /case, /account, /cases — authentication is the only requirement here
}
