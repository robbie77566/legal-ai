/**
 * Cross-subdomain session cookie (launch blocker found 2026-09-02): with no
 * cookie config, NextAuth issues a HOST-ONLY cookie — set by www, never sent
 * to api.snotnoselegal.com, so every prod API call would 401 after sign-in.
 * Dev hides it (localhost ports share a jar). COOKIE_DOMAIN drives the fix,
 * and must change nothing when unset (dev/LAN).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@hg/database', () => ({ default: { user: { findUnique: vi.fn() } } }))
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('session cookie domain (COOKIE_DOMAIN)', () => {
  it('prod: sets the parent-domain __Secure- cookie so api.* receives it', async () => {
    vi.stubEnv('COOKIE_DOMAIN', '.snotnoselegal.com')
    const { authOptions } = await import('@hg/auth/auth-options')
    const st = authOptions.cookies?.sessionToken
    expect(st?.name).toBe('__Secure-next-auth.session-token')
    expect(st?.options?.domain).toBe('.snotnoselegal.com')
    expect(st?.options?.secure).toBe(true)
    expect(st?.options?.httpOnly).toBe(true)
  })

  it('dev (unset): NextAuth defaults stand — no domain attribute to break localhost/LAN', async () => {
    vi.stubEnv('COOKIE_DOMAIN', '')
    const { authOptions } = await import('@hg/auth/auth-options')
    expect(authOptions.cookies).toBeUndefined()
  })
})
