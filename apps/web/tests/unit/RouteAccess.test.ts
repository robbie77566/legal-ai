import { describe, it, expect } from 'vitest'
import { isAuthorized, accountKindOf } from '@/lib/route-access'

/**
 * A1 — the web middleware's route matrix (persona_rollout_plan.md §5 A), one
 * row per persona, one column per surface. Staff and family rows are what
 * middleware.ts answered before the expand step; the PROFESSIONAL row and the
 * /counsel column are new.
 */
const PATHS = ['/counsel', '/qa', '/ops', '/dashboard', '/case/x', '/account'] as const
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
  anonymous:    { '/counsel': false, '/qa': false, '/ops': false, '/dashboard': false, '/case/x': false, '/account': false },
  family:       { '/counsel': false, '/qa': false, '/ops': false, '/dashboard': false, '/case/x': true,  '/account': true },
  professional: { '/counsel': true,  '/qa': false, '/ops': false, '/dashboard': false, '/case/x': true,  '/account': true },
  admin:        { '/counsel': false, '/qa': true,  '/ops': true,  '/dashboard': true,  '/case/x': true,  '/account': true },
  support:      { '/counsel': false, '/qa': false, '/ops': true,  '/dashboard': false, '/case/x': true,  '/account': true },
  reviewer:     { '/counsel': false, '/qa': true,  '/ops': false, '/dashboard': true,  '/case/x': true,  '/account': true },
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
    expect(isAuthorized('/dashboard', token)).toBe(false)
    expect(isAuthorized('/workspace', token)).toBe(false)
    expect(isAuthorized('/counsel/matters', token)).toBe(true)
  })

  it('a session issued before the expand step (no accountKind claim) keeps its old answers', () => {
    expect(isAuthorized('/qa', { role: 'ATTORNEY' })).toBe(true)
    expect(isAuthorized('/ops', { role: 'SUPPORT' })).toBe(true)
    expect(isAuthorized('/counsel', { role: 'ATTORNEY' })).toBe(false)
    expect(isAuthorized('/counsel', { role: 'CLIENT' })).toBe(false)
    expect(isAuthorized('/account', { role: 'CLIENT' })).toBe(true)
  })

  it('reads the kind from the role only when the claim is missing', () => {
    expect(accountKindOf({ role: 'CLIENT' })).toBe('FAMILY')
    expect(accountKindOf({ role: 'ADMIN' })).toBe('STAFF')
    expect(accountKindOf({ role: 'SUPPORT' })).toBe('STAFF')
    expect(accountKindOf({ role: 'CLIENT', accountKind: 'PROFESSIONAL' })).toBe('PROFESSIONAL')
    expect(accountKindOf({ role: 'ADMIN', accountKind: 'nonsense' })).toBe('STAFF')
  })
})
