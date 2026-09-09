import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
import FamilyNav from '@/components/daybreak/FamilyNav'

/** your_account U1/U2: the name is the signed-in signal and the door; the desktop menu names each review. */
const signOut = vi.fn()
vi.mock('next-auth/react', async (orig) => ({ ...(await orig<typeof import('next-auth/react')>()), signOut: (...a: unknown[]) => signOut(...a) }))
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ reviews: [{ id: 'c1', title: 'Travis County · 2019' }] }), { status: 200 })),
}))

const session = (user: object | null) =>
  ({ data: user ? { user, expires: '2027-01-01' } : null, status: user ? 'authenticated' : 'unauthenticated', update: async () => null }) as never

describe('FamilyNav', () => {
  it('signed out: Sign in', () => {
    render(<SessionContext.Provider value={session(null)}><FamilyNav /></SessionContext.Provider>)
    expect(screen.getByTestId('nav-signin')).toHaveAttribute('href', '/auth/signin')
    expect(screen.queryByTestId('nav-name')).toBeNull()
  })

  it('signed in: the name links to /account; the menu lists each review, settings and sign out', async () => {
    render(<SessionContext.Provider value={session({ name: 'Jo Whitfield', email: 'jo@example.com' })}><FamilyNav /></SessionContext.Provider>)
    const pills = screen.getAllByTestId('nav-name')
    expect(pills.length).toBeGreaterThan(0)
    pills.forEach((p) => expect(p).toHaveAttribute('href', '/account'))
    fireEvent.click(screen.getByTestId('account-menu-button'))
    const menu = await screen.findByTestId('account-menu')
    await waitFor(() => expect(menu).toHaveTextContent('Travis County · 2019'))
    expect(screen.getByRole('menuitem', { name: 'Travis County · 2019' })).toHaveAttribute('href', '/case/c1')
    expect(screen.getByRole('menuitem', { name: 'Account & settings' })).toHaveAttribute('href', '/account#settings')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })

  it('falls back to the email handle when there is no name', () => {
    render(<SessionContext.Provider value={session({ email: 'jo@example.com' })}><FamilyNav /></SessionContext.Provider>)
    expect(screen.getAllByTestId('nav-name')[0]).toHaveTextContent('jo')
  })
})
