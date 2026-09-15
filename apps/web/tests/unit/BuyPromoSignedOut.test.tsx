import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The first-time buyer: no account yet. This is the NORMAL state on the
// disclosure step, where the promo field lives.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(async () => ({ error: undefined })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams('') }))
import BuyPage from '@/app/(daybreak)/buy/page'

/**
 * The bug: the promo field sits on the disclosure step, which comes BEFORE
 * account creation, but /checkout/promo/validate required a session and
 * answered 401. A family with an early-adopter code — the spec's driving use
 * case, and by definition people with no account — could not apply it, and
 * the error told them to sign in "below", where no sign-in existed.
 */
let promoCalls: Array<{ auth: boolean }> = []
beforeEach(() => {
  promoCalls = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/checkout/promo/validate')) {
      promoCalls.push({ auth: Boolean((init?.headers as Record<string, string>)?.Cookie) })
      return { ok: true, status: 200, json: async () => ({ code: 'EARLYBIRD', amountOffCents: 29900, newTotalCents: 0 }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({ ackedAt: null }) } as Response
  }))
})

describe('buy page — promo before the account exists', () => {
  const applyCode = async (code: string) => {
    render(<BuyPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Have a promo code/ }))
    fireEvent.change(screen.getByPlaceholderText('Enter code'), { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  }

  it('applies a code while signed out and shows the new total', async () => {
    await applyCode('EARLYBIRD')
    await waitFor(() => expect(screen.getByText(/EARLYBIRD/)).toBeInTheDocument())
    // A 100%-off code reads as Free, not "$0".
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(promoCalls).toHaveLength(1)
  })

  it('never tells a signed-out visitor to sign in first', async () => {
    await applyCode('EARLYBIRD')
    await waitFor(() => expect(screen.getByText(/EARLYBIRD/)).toBeInTheDocument())
    expect(screen.queryByText(/Please sign in/i)).toBeNull()
    expect(screen.queryByText(/before adding a code/i)).toBeNull()
  })

  it('the applied code is removable, returning the price to $299', async () => {
    await applyCode('EARLYBIRD')
    await waitFor(() => expect(screen.getByText(/EARLYBIRD/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    await waitFor(() => expect(screen.getByText('$299')).toBeInTheDocument())
  })
})
