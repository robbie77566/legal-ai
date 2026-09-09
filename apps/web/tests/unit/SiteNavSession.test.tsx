import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
import SiteNav from '@/components/site/SiteNav'

/** G-C3 / your_account U1: a signed-in family sees their name in the brand nav, and it opens their account. */
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => new Response('{"reviews":[]}', { status: 200 })) }))

describe('brand nav with a session', () => {
  it('replaces Sign in with the name pill (→ /account) and the CTA with Start another review', () => {
    const value = { data: { user: { name: 'Jo Whitfield', email: 'j@x.com' }, expires: '2027-01-01' }, status: 'authenticated', update: async () => null } as never
    render(<SessionContext.Provider value={value}><SiteNav /></SessionContext.Provider>)
    const pill = screen.getByTestId('nav-name')
    expect(pill).toHaveAttribute('href', '/account')
    expect(pill).toHaveTextContent('JW')
    expect(pill).toHaveTextContent('Jo')
    expect(screen.queryByTestId('nav-signin')).toBeNull()
    expect(screen.getByRole('link', { name: 'Start another review' })).toHaveAttribute('href', '/check')
  })

  it('a staff session goes through /go from the pill, never the family account page (review 2026-09-09)', () => {
    const value = { data: { user: { name: 'Robbie Bruce', email: 'r@x.com', role: 'ADMIN' }, expires: '2027-01-01' }, status: 'authenticated', update: async () => null } as never
    render(<SessionContext.Provider value={value}><SiteNav /></SessionContext.Provider>)
    expect(screen.getByTestId('nav-name')).toHaveAttribute('href', '/go')
  })
})
