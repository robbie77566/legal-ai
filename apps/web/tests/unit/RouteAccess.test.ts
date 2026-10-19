import { describe, it, expect } from 'vitest'
import { isAuthorized, accountKindOf } from '@/lib/route-access'
import * as middleware from '@/middleware'

/**
 * A1 — the web middleware's route matrix (persona_rollout_plan.md §5 A), one
 * row per persona, one column per surface. Staff and family rows are what
 * middleware.ts answered before the expand step; the PROFESSIONAL row and the
 * /counsel column are new. Workstream F retired /dashboard and /workspace
 * (the 2025 mocked build); the Team page is /ops/team and is gated with /ops.
 */
const PATHS = ['/counsel', '/qa', '/ops', '/ops/team', '/case/x', '/account'] as const
type Path = (typeof PATHS)[number]

const IDENTITIES = {
  anonymous: null,
  family: { role: 'CLIENT', accountKind: 'FAMILY' },
  professional: { role: 'CLIENT', accountKind: 'PROFESSIONAL' },
  admin: { role: 'ADMIN', accountKind: 'STAFF' },
  support: { role: 'SUPPORT', accountKind: 'STAFF' },
  reviewer: { role: 'ATTORNEY', accountKind: 'STAFF' },
} as const

const MATRIX: Record<keyof typeof IDENTITIES, Record<Path, boolean>> = {
  anonymous:    { '/counsel': false, '/qa': false, '/ops': false, '/ops/team': false, '/case/x': false, '/account': false },
  family:       { '/counsel': false, '/qa': false, '/ops': false, '/ops/team': false, '/case/x': true,  '/account': true },
  professional: { '/counsel': true,  '/qa': false, '/ops': false, '/ops/team': false, '/case/x': true,  '/account': true },
  admin:        { '/counsel': false, '/qa': true,  '/ops': true,  '/ops/team': true,  '/case/x': true,  '/account': true },
  // SUPPORT passes the middleware for every /ops page (UX gating); the API's /permissions routes are the real gate for Team.
  support:      { '/counsel': false, '/qa': false, '/ops': true,  '/ops/team': true,  '/case/x': true,  '/account': true },
  reviewer:     { '/counsel': false, '/qa': true,  '/ops': false, '/ops/team': false, '/case/x': true,  '/account': true },
}

describe('route matrix (web middleware authorized callback)', () => {
  for (const [who, token] of Object.entries(IDENTITIES) as [keyof typeof IDENTITIES, (typeof IDENTITIES)[keyof typeof IDENTITIES]][]) {
    for (const path of PATHS) {
      it(`${who} → ${path} = ${MATRIX[who][path]}`, () => {
        expect(isAuthorized(path, token)).toBe(MATRIX[who][path])
      })
    }
  }

  it('a PROFESSIONAL whose legacy role column says ATTORNEY is still refused every staff surface', () => {
    const token = { role: 'ATTORNEY', accountKind: 'PROFESSIONAL' }
    expect(isAuthorized('/qa', token)).toBe(false)
    expect(isAuthorized('/ops', token)).toBe(false)
    expect(isAuthorized('/ops/team', token)).toBe(false)
    expect(isAuthorized('/counsel/matters', token)).toBe(true)
  })

  it('a session issued before the expand step (no accountKind claim) keeps its old answers', () => {
    expect(isAuthorized('/qa', { role: 'ATTORNEY' })).toBe(true)
    expect(isAuthorized('/ops', { role: 'SUPPORT' })).toBe(true)
    expect(isAuthorized('/counsel', { role: 'ATTORNEY' })).toBe(false)
    expect(isAuthorized('/counsel', { role: 'CLIENT' })).toBe(false)
    expect(isAuthorized('/account', { role: 'CLIENT' })).toBe(true)
  })

  it('the retired /dashboard and /workspace routes are no longer staff surfaces in the matrix (workstream F)', () => {
    // Not matched by the middleware any more (middleware.ts config.matcher); a
    // request there is a plain Next 404, so the matrix has no row for them.
    const { config } = middleware
    const matchers = config.matcher as string[]
    expect(matchers.some((m) => m.startsWith('/dashboard'))).toBe(false)
    expect(matchers.some((m) => m.startsWith('/workspace'))).toBe(false)
    expect(matchers).toContain('/ops/:path*')
  })

  it('the middleware matches every /counsel page except /counsel/join (an invitation is accepted signed out)', () => {
    const matchers = (middleware.config.matcher as string[]).filter((m) => m.startsWith('/counsel'))
    // Next compiles matchers with path-to-regexp; the custom group below is the one we wrote.
    // The custom group is already a regular expression; anchor it and test.
    const matches = (path: string) => matchers.some((m) => (m === '/counsel' ? path === '/counsel' : new RegExp(`^${m}$`).test(path)))
    expect(matches('/counsel')).toBe(true)
    expect(matches('/counsel/matters/new')).toBe(true)
    expect(matches('/counsel/org')).toBe(true)
    expect(matches('/counsel/join')).toBe(false)
    expect(matches('/counsel/join/')).toBe(false)
    expect(matches('/counsel/joint')).toBe(true)
  })

  it('reads the kind from the role only when the claim is missing', () => {
    expect(accountKindOf({ role: 'CLIENT' })).toBe('FAMILY')
    expect(accountKindOf({ role: 'ADMIN' })).toBe('STAFF')
    expect(accountKindOf({ role: 'SUPPORT' })).toBe('STAFF')
    expect(accountKindOf({ role: 'CLIENT', accountKind: 'PROFESSIONAL' })).toBe('PROFESSIONAL')
    expect(accountKindOf({ role: 'ADMIN', accountKind: 'nonsense' })).toBe('STAFF')
  })
})
