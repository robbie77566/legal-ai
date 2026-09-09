import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 2026-09-09: signed in + visit the home URL → your own landing, not the sign-up pitch. */
const mocks = vi.hoisted(() => ({ session: null as unknown, redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@hg/auth', () => ({ authOptions: {} }))
vi.mock('@/components/site/BrandHome', () => ({ default: () => null }))

import Home from '@/app/(daybreak)/page'

describe('home route', () => {
  beforeEach(() => { mocks.redirect.mockClear() })

  it('signed in → redirects to /go (role-aware landing) before rendering anything', async () => {
    mocks.session = { user: { email: 'family@example.com' } }
    await expect(Home()).rejects.toThrow('REDIRECT:/go')
    expect(mocks.redirect).toHaveBeenCalledWith('/go')
  })

  it('signed out → renders the brand home, no redirect', async () => {
    mocks.session = null
    const el = await Home()
    expect(el).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
