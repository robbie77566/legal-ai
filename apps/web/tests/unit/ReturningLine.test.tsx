import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => new Response('{"reviews":[]}', { status: 200 })) }))
import BrandHome from '@/components/site/BrandHome'
import DaybreakLanding from '@/app/(daybreak)/review/page'

/** 2026-09-09: "the landing page no longer has a sign-in" — the nav link was
 *  small, grey, and gone once signed in. Both landings now carry an explicit
 *  line under the hero button, and it flips to the way back when signed in. */
describe('returning-customer line on the landings', () => {
  it('brand home: "Already have an account? Sign in" under the hero AND the footer CTA', () => {
    render(<BrandHome />)
    const lines = screen.getAllByTestId('hero-returning')
    expect(lines.length).toBe(2)
    for (const l of lines) expect(l).toHaveTextContent(/Already have an account\? Sign in/)
    for (const a of screen.getAllByTestId('hero-signin')) expect(a).toHaveAttribute('href', '/auth/signin')
  })

  it('conversion landing (/review): the line sits under the hero button', () => {
    render(<DaybreakLanding />)
    expect(screen.getByTestId('hero-returning')).toHaveTextContent(/Already have an account\? Sign in/)
    expect(screen.getByTestId('hero-signin')).toHaveAttribute('href', '/auth/signin')
  })

  it('signed in: becomes the way back to their reviews, never a dead "Sign in"', () => {
    const value = { data: { user: { name: 'Jo', email: 'j@x.com' }, expires: '2027-01-01' }, status: 'authenticated', update: async () => null } as never
    render(<SessionContext.Provider value={value}><BrandHome /></SessionContext.Provider>)
    expect(screen.queryByTestId('hero-signin')).toBeNull()
    const back = screen.getAllByTestId('hero-reviews')
    expect(back[0]).toHaveAttribute('href', '/cases')
    expect(screen.getAllByTestId('hero-returning')[0]).toHaveTextContent(/signed in.*go to your reviews/)
  })
})
