/**
 * Regression: the passwordChangedAt session-kill guard must never fire on the
 * INITIAL sign-in (token.iat doesn't exist yet, so the baseline read 0 and any
 * account that had ever changed its password got a 500 at encode — live bug,
 * 2026-09-01), and forced invalidation must strip identity / expire the
 * session rather than return null (null makes next-auth's encode throw).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('@hg/database', () => ({ default: { user: { findUnique } } }))
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))

import { authOptions } from '@hg/auth/auth-options'

const jwtCb = authOptions.callbacks!.jwt!
const sessionCb = authOptions.callbacks!.session!

const USER = { id: 'u1', tenantId: 't1', role: 'CLIENT' }
const nowSec = Math.floor(Date.now() / 1000)

beforeEach(() => findUnique.mockReset())

describe('auth session invalidation (passwordChangedAt)', () => {
  it('initial sign-in succeeds even when the password was changed in the past', async () => {
    // The DB says the password changed an hour ago; authorize() just verified
    // the NEW password, so this brand-new session must survive.
    findUnique.mockResolvedValue({ passwordChangedAt: new Date(Date.now() - 3600_000), name: 'R' })
    const token = await jwtCb({ token: {}, user: USER } as any)
    expect(token).toBeTruthy()
    expect((token as any).id).toBe('u1')
    expect((token as any).passwordAcknowledgedAt).toBeGreaterThanOrEqual(nowSec)
  })

  it('a stale session (iat before the change) is invalidated WITHOUT returning null', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: new Date(), name: 'R' })
    const token = await jwtCb({ token: { id: 'u1', iat: nowSec - 7200 } } as any)
    // Must be an object (null crashes next-auth encode with an empty 500)…
    expect(token).toBeTypeOf('object')
    expect(token).not.toBeNull()
    // …with the identity stripped so the session callback expires it.
    expect((token as any).id).toBeUndefined()
  })

  it('a session that acknowledged the change survives refresh', async () => {
    findUnique.mockResolvedValue({ passwordChangedAt: new Date(), name: 'R' })
    const token = await jwtCb({
      token: { id: 'u1', iat: nowSec - 7200, passwordAcknowledgedAt: nowSec + 5 },
    } as any)
    expect((token as any).id).toBe('u1')
  })

  it('session callback expires an identity-less token instead of exposing a live session', async () => {
    const session = await sessionCb({
      session: { user: { email: 'x@y.z' }, expires: new Date(Date.now() + 3600_000).toISOString() },
      token: {},
    } as any)
    expect(new Date((session as any).expires).getTime()).toBeLessThan(Date.now())
    expect((session as any).user?.id).toBeUndefined()
  })
})
