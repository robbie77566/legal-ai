/**
 * W3 — authorize() calls the sign-in recorder at every exit with the right
 * outcome, and passes the caller's IP and user agent from the request
 * headers NextAuth v4 hands it. The recorder itself is tested in
 * packages/auth/tests/sign-in-events.test.ts; here it is a mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() }))
const recorder = vi.hoisted(() => ({ recordSignInAttempt: vi.fn() }))
vi.mock('@hg/database', () => ({ default: { user: { findFirst: db.findFirst, update: db.update, findUnique: db.findUnique } } }))
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('@hg/auth/sign-in-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hg/auth/sign-in-events')>()),
  recordSignInAttempt: recorder.recordSignInAttempt,
}))
// bcrypt at cost 12 is ~300ms a compare; the hash shape is all authorize() needs here.
vi.mock('bcryptjs', () => ({
  default: { hashSync: () => 'hash:__dummy__', compare: async (p: string, h: string) => h === `hash:${p}` },
}))

import { authOptions } from '@hg/auth/auth-options'

type Authorize = (c: Record<string, string>, req?: { headers?: Record<string, string> }) => Promise<unknown>
const provider = authOptions.providers[0] as unknown as { authorize?: Authorize; options?: { authorize: Authorize } }
const authorize = provider.options?.authorize ?? provider.authorize!

const REQ = { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone)' } }
const USER = { id: 'u1', email: 'maria@example.com', name: 'Maria', tenantId: 't1', role: 'CLIENT', accountKind: 'FAMILY', passwordHash: 'hash:Correct1!', loginCount: 0, createdAt: new Date() }

beforeEach(() => {
  db.findFirst.mockReset()
  db.update.mockReset().mockResolvedValue({})
  recorder.recordSignInAttempt.mockReset().mockResolvedValue({ recorded: true, firstSignIn: false, alerted: false })
})

const lastCall = () => recorder.recordSignInAttempt.mock.calls.at(-1)![0]

describe('authorize() → recordSignInAttempt at every exit', () => {
  it('success: SUCCESS with the user row (loginCount as it was) and the IP / user agent from the headers', async () => {
    db.findFirst.mockResolvedValue(USER)
    const result = await authorize({ email: 'Maria@Example.com', password: 'Correct1!' }, REQ)
    expect(result).toMatchObject({ id: 'u1', email: 'maria@example.com' })
    expect(recorder.recordSignInAttempt).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual({ email: 'maria@example.com', user: USER, outcome: 'SUCCESS', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)' })
    // The recorder reads loginCount BEFORE the increment: it ran first.
    expect(recorder.recordSignInAttempt.mock.invocationCallOrder[0]).toBeLessThan(db.update.mock.invocationCallOrder[0])
    expect(db.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lastLoginAt: expect.any(Date), loginCount: { increment: 1 } } })
  })

  it('wrong password: BAD_PASSWORD with the user, returns null', async () => {
    db.findFirst.mockResolvedValue({ ...USER, email: 'bad@example.com' })
    expect(await authorize({ email: 'bad@example.com', password: 'nope' }, REQ)).toBeNull()
    expect(lastCall()).toMatchObject({ email: 'bad@example.com', outcome: 'BAD_PASSWORD', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)' })
    expect(lastCall().user.id).toBe('u1')
    expect(db.update).not.toHaveBeenCalled()
  })

  it('no account: UNKNOWN_EMAIL with no user, the address as typed (lower-cased)', async () => {
    db.findFirst.mockResolvedValue(null)
    expect(await authorize({ email: 'Nobody@Example.com', password: 'x' }, REQ)).toBeNull()
    expect(lastCall()).toEqual({ email: 'nobody@example.com', user: null, outcome: 'UNKNOWN_EMAIL', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)' })
  })

  it('an account with no password set (invite not finished): NO_PASSWORD with the user', async () => {
    db.findFirst.mockResolvedValue({ ...USER, id: 'u2', email: 'invited@example.com', passwordHash: null })
    expect(await authorize({ email: 'invited@example.com', password: 'x' }, REQ)).toBeNull()
    expect(lastCall()).toMatchObject({ email: 'invited@example.com', outcome: 'NO_PASSWORD' })
    expect(lastCall().user.id).toBe('u2')
  })

  it('rate-limited: RATE_LIMITED recorded once per limited attempt, no lookup, then the RateLimit error', async () => {
    db.findFirst.mockResolvedValue({ ...USER, email: 'locked@example.com' })
    for (let i = 0; i < 5; i++) await authorize({ email: 'locked@example.com', password: 'wrong' }, REQ)
    expect(recorder.recordSignInAttempt).toHaveBeenCalledTimes(5)
    expect(recorder.recordSignInAttempt.mock.calls.every(([c]) => c.outcome === 'BAD_PASSWORD')).toBe(true)
    db.findFirst.mockClear()
    await expect(authorize({ email: 'locked@example.com', password: 'wrong' }, REQ)).rejects.toThrow(/^RateLimit:\d+$/)
    expect(recorder.recordSignInAttempt).toHaveBeenCalledTimes(6)
    expect(lastCall()).toEqual({ email: 'locked@example.com', user: undefined, outcome: 'RATE_LIMITED', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)' })
    expect(db.findFirst).not.toHaveBeenCalled()
    await expect(authorize({ email: 'locked@example.com', password: 'wrong' }, REQ)).rejects.toThrow(/RateLimit/)
    expect(recorder.recordSignInAttempt).toHaveBeenCalledTimes(7)
  })

  it('x-real-ip is the fallback; no request at all (the api integration tests call authorize bare) → nulls', async () => {
    db.findFirst.mockResolvedValue({ ...USER, email: 'real@example.com' })
    await authorize({ email: 'real@example.com', password: 'Correct1!' }, { headers: { 'x-real-ip': '198.51.100.7' } })
    expect(lastCall()).toMatchObject({ outcome: 'SUCCESS', ip: '198.51.100.7', userAgent: null })
    await authorize({ email: 'real@example.com', password: 'Correct1!' })
    expect(lastCall()).toMatchObject({ outcome: 'SUCCESS', ip: null, userAgent: null })
  })

  it('missing credentials return null without recording (there is no address to log)', async () => {
    expect(await authorize({ email: '', password: '' }, REQ)).toBeNull()
    expect(recorder.recordSignInAttempt).not.toHaveBeenCalled()
  })

  it('a database outage throws ServiceUnavailable and records nothing (the log is in that database)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.findFirst.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(authorize({ email: 'down@example.com', password: 'x' }, REQ)).rejects.toThrow('ServiceUnavailable')
    expect(recorder.recordSignInAttempt).not.toHaveBeenCalled()
  })
})
