import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
import SiteNav from '@/components/site/SiteNav'

/** G-C3: a signed-in family gets a way back to their reviews from the brand nav. */
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))

describe('brand nav with a session', () => {
  it('replaces Sign in with Your reviews and the CTA with Start another review', () => {
    const value = { data: { user: { email: 'j@x.com' }, expires: '2027-01-01' }, status: 'authenticated', update: async () => null } as never
    render(<SessionContext.Provider value={value}><SiteNav /></SessionContext.Provider>)
    expect(screen.getByTestId('nav-reviews')).toHaveAttribute('href', '/cases')
    expect(screen.queryByTestId('nav-signin')).toBeNull()
    expect(screen.getByRole('link', { name: 'Start another review' })).toHaveAttribute('href', '/check')
  })
})
