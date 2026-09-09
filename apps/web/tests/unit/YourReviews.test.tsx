import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
import AccountPage from '@/app/(daybreak)/account/page'

/** Your account (your_account spec): the signed-in home replaces "Your reviews" (US-11). */
const ME = {
  user: { name: 'Jo Whitfield', email: 'jo@example.com', pendingEmail: null, passwordChangedAt: '2026-06-02T00:00:00Z', memberSince: '2026-06-01T00:00:00Z' },
  reviews: [
    { id: 'c1', title: 'Brazoria County · 2017', status: 'READY', stage: { stage: 'report_ready' }, expectedReadyAt: null, factsLine: 'Trial · Direct appeal: yes', documents: 4, pages: 812, reportVersions: [{ versionNo: 1, renderedAt: '2026-09-01' }], shareLink: { createdAt: '2026-09-02', expiresAt: '2026-10-02', revokedAt: null, opens: 2 }, clinicConsent: false },
    { id: 'c2', title: 'Review started 2026-08-31', status: 'AWAITING_DOCS', stage: { stage: 'collecting_documents' }, expectedReadyAt: '2026-09-14', factsLine: '', documents: 1, pages: 0, reportVersions: [], shareLink: null, clinicConsent: false },
  ],
  payments: [{ id: 'p1', kind: 'REVIEW', amountCents: 29900, refundedCents: 0, status: 'SUCCEEDED', free: false, promoCode: null, cardBrand: 'visa', cardLast4: '4242', receiptUrl: 'https://pay.stripe.com/r/1', caseId: 'c1', caseTitle: 'Brazoria County · 2017', createdAt: '2026-08-30T00:00:00Z' }],
  refunds: [],
  acks: [{ ackAt: '2026-08-30T00:00:00Z', version: 'v3' }],
  deletionRequest: null,
}
const calls: Array<{ url: string; init?: RequestInit }> = []
vi.mock('@/lib/api', () => ({
  API_URL: 'http://api.test',
  apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url === '/me' && !init) return new Response(JSON.stringify(ME), { status: 200 })
    if (url === '/me' && init?.method === 'PATCH') return new Response(JSON.stringify({ ok: true, name: 'Josephine' }), { status: 200 })
    if (url === '/me/delete-request') return new Response(JSON.stringify({ ok: true, requestedAt: '2026-09-08' }), { status: 200 })
    return new Response('{}', { status: 200 })
  }),
}))
const update = vi.fn(async () => null)
vi.mock('next-auth/react', async (orig) => ({ ...(await orig<typeof import('next-auth/react')>()), useSession: () => ({ data: null, status: 'authenticated', update }), signOut: vi.fn() }))

const wrap = (ui: React.ReactElement) =>
  render(<SessionContext.Provider value={{ data: { user: ME.user, expires: '2027-01-01' }, status: 'authenticated', update } as never}>{ui}</SessionContext.Provider>)

describe('Your account', () => {
  it('greets by first name and lists every review with one stage-appropriate primary action, plus start-another', async () => {
    wrap(<AccountPage />)
    await waitFor(() => expect(screen.getAllByTestId('case-card')).toHaveLength(2))
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello, Jo.')
    expect(screen.getByText('Brazoria County · 2017')).toBeInTheDocument()
    expect(screen.getByText(/Trial · Direct appeal: yes/)).toBeInTheDocument()
    expect(screen.getByText('See your report')).toHaveAttribute('href', '/case/c1/report')
    expect(screen.getByText('Continue your checklist')).toHaveAttribute('href', '/case/c2/documents')
    expect(screen.getByText(/Start another review/)).toHaveAttribute('href', '/check')
  })

  it('shows payments with brand/last4 and a receipt, sharing state, terms, and the export link', async () => {
    wrap(<AccountPage />)
    const pay = await screen.findByTestId('payments')
    expect(pay).toHaveTextContent('Visa ····4242')
    expect(pay).toHaveTextContent('$299.00')
    expect(screen.getByRole('link', { name: 'Receipt' })).toHaveAttribute('href', 'https://pay.stripe.com/r/1')
    expect(screen.getByTestId('sharing')).toHaveTextContent(/opened 2 times/)
    expect(screen.getByTestId('sharing')).toHaveTextContent(/version v3/)
    expect(screen.getByTestId('export-link')).toHaveAttribute('href', 'http://api.test/me/export')
  })

  it('renames inline and refreshes the session so the nav pill follows', async () => {
    wrap(<AccountPage />)
    await screen.findByTestId('account')
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0])
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Josephine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ name: 'Josephine' }))
    expect(calls.some((c) => c.url === '/me' && c.init?.method === 'PATCH')).toBe(true)
    expect(await screen.findByTestId('notice')).toHaveTextContent('Name updated.')
  })

  it('deletion is a two-step request, not a button', async () => {
    wrap(<AccountPage />)
    await screen.findByTestId('your-data')
    expect(calls.filter((c) => c.url === '/me/delete-request')).toHaveLength(0)
    fireEvent.click(screen.getByTestId('delete-request'))
    fireEvent.click(screen.getByTestId('delete-confirm'))
    await waitFor(() => expect(calls.filter((c) => c.url === '/me/delete-request')).toHaveLength(1))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/Deletion requested/)
  })
})
