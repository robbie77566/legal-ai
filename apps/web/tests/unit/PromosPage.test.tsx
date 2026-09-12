import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/promos' }))
import PromosPage from '@/app/ops/promos/page'

/** An expired code showed 'active' (2026-09-12). Status is now what the family will get. */
const PROMOS = [
  { id: 'p1', code: 'SNOT26', amountOffCents: 29900, maxRedemptions: 5, redeemedCount: 2, expiresAt: '2026-09-10T00:00:00Z', active: true, createdAt: '2026-09-05T00:00:00Z' },
  { id: 'p2', code: 'FULL', amountOffCents: 29900, maxRedemptions: 2, redeemedCount: 2, expiresAt: null, active: true, createdAt: '2026-09-05T00:00:00Z' },
  { id: 'p3', code: 'LIVE', amountOffCents: 5000, maxRedemptions: null, redeemedCount: 0, expiresAt: null, active: true, createdAt: '2026-09-05T00:00:00Z' },
  { id: 'p4', code: 'OFF', amountOffCents: 5000, maxRedemptions: null, redeemedCount: 0, expiresAt: null, active: false, createdAt: '2026-09-05T00:00:00Z' },
]
const calls: Array<{ url: string; init?: RequestInit }> = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => PROMOS } as Response }))
})

describe('promos page', () => {
  it('status reflects expiry and cap, not just the active flag; extend posts a future expiry', async () => {
    render(<PromosPage />)
    expect(await screen.findByTestId('promo-status-SNOT26')).toHaveTextContent('EXPIRED')
    expect(screen.getByTestId('promo-status-FULL')).toHaveTextContent('USED UP')
    expect(screen.getByTestId('promo-status-LIVE')).toHaveTextContent('active')
    expect(screen.getByTestId('promo-status-OFF')).toHaveTextContent('off')
    fireEvent.click(screen.getByTestId('promo-extend-SNOT26'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/promos/p1') && c.init?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/ops/promos/p1'))!.init!.body))
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
  })
})
