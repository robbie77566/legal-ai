import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { email: 'admin@snotnoselegal.com', role: 'ADMIN' } }, status: 'authenticated' }), signIn: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams('') }))
import BuyPage from '@/app/(daybreak)/buy/page'

/** 2026-09-12: an admin testing a fresh code saw "That code isn't valid" three
 *  times — the API had returned 403 for the STAFF session. Say so. */
let status = 403
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.endsWith('/checkout/promo/validate')) return { ok: false, status, json: async () => ({ error: 'Consumer purchases only' }) } as Response
    return { ok: true, status: 200, json: async () => ({ ackedAt: null }) } as Response
  }))
})

describe('buy page — promo errors', () => {
  const apply = async (code: string) => {
    render(<BuyPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Have a promo code/ }))
    fireEvent.change(screen.getByPlaceholderText('Enter code'), { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
  }
  it('403 (staff session) says sign out and try as a customer — not "isn\'t valid"', async () => {
    status = 403
    await apply('SNOT99')
    await waitFor(() => expect(screen.getByText(/signed in as a staff account/)).toBeInTheDocument())
    expect(screen.queryByText(/isn.t valid/)).toBeNull()
  })
  it('a real rejection still reads "That code isn\'t valid"', async () => {
    status = 400
    await apply('NOPE')
    await waitFor(() => expect(screen.getByText(/That code isn.t valid/)).toBeInTheDocument())
  })
})
