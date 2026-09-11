import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MoneyPage from '@/app/ops/money/page'

/** Money page (payments_and_refunds spec): tiles from /ops/payments/summary,
 *  the ledger from /ops/payments, and the refund dialog posting a chosen
 *  reason and amount to /ops/payments/:id/refund. */

const SUMMARY = {
  stripe: 'live',
  period: { days: 30, from: '2026-08-08T00:00:00Z' },
  testMode: { included: false, hiddenCount: 5 },
  totals: {
    sold: 29, freeCount: 3, collectedCents: 867100, refundedCents: 89700, netCents: 777400,
    refundRate: 0.104, refundCount: 3, partialCount: 1, costUsd: 312.4, costPerCaseUsd: 10.77, marginPct: 0.96, needsDecision: 1,
  },
  weeks: [{ weekOf: '2026-08-31', sold: 7, collectedCents: 209300, refundedCents: 29900, netCents: 179400, costUsd: 78.1 }],
  disputes: [{ id: 'p_d', caseId: 'c_d', caseTitle: 'Nguyen — Harris County record', customerEmail: 't@x.com', kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900, refundedCents: 0, remainingCents: 29900, promoCode: null, free: false, disputeStatus: 'open', disputedAt: '2026-09-05T10:00:00Z', refundedAt: null, createdAt: '2026-09-01T10:00:00Z', stripeId: 'cs_d', paymentIntentId: 'pi_d' }],
  requests: [{ id: 'q_1', caseId: 'c_w', caseTitle: 'Whitfield — Travis County record', type: 'REFUND', reason: 'unreadable_record', note: 'clerk has nothing better', amountCents: null, requestedByEmail: 'dana@snotnoselegal.com', createdAt: '2026-09-06T14:02:00Z' }],
  recentRefunds: [{ id: 'r1', caseTitle: 'Castillo — Nueces County record', customerEmail: 'r@x.com', amountCents: 14900, partial: true, reason: 'unreadable_record', issuedByEmail: 'robbie@snotnoselegal.com', createdAt: '2026-09-03T16:10:00Z' }],
  reconciliation: { checked: 29, healed: 0, ranAt: '2026-09-07T12:00:00Z', trigger: 'schedule' },
}
const PAYMENTS = {
  total: 2,
  rows: [
    { id: 'p_1', stripeId: 'cs_1', paymentIntentId: 'pi_1', caseId: 'c_1', caseTitle: 'Whitfield — Travis County record', customerEmail: 'j@x.com', kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900, refundedCents: 0, remainingCents: 29900, promoCode: null, free: false, disputeStatus: null, disputedAt: null, refundedAt: null, createdAt: '2026-09-06T14:02:00Z' },
    { id: 'p_2', stripeId: 'promo_FAMILY50_x', paymentIntentId: null, caseId: 'c_2', caseTitle: 'Ramirez — Bexar County record', customerEmail: 'm@x.com', kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0, refundedCents: 0, remainingCents: 0, promoCode: 'FAMILY50', free: true, disputeStatus: null, disputedAt: null, refundedAt: null, createdAt: '2026-09-02T11:27:00Z' },
  ],
}
const SPEND = { weeks: 12, from: '2026-06-19T00:00:00Z', totalUsd: 61.4, cases: 3, perCaseUsd: 20.47, rows: [
  { weekOf: '2026-09-07', cases: 2, modelUsd: 40.2, ocrUsd: 1.1, otherUsd: 0, totalUsd: 41.3, perCaseUsd: 20.65, byProvider: { 'claude-fable-5-1': 40.2 } },
  { weekOf: '2026-08-31', cases: 1, modelUsd: 17.34, ocrUsd: 2.76, otherUsd: 0, totalUsd: 20.1, perCaseUsd: 20.1, byProvider: { 'claude-opus-5': 17.34 } },
] }
const calls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    const body = u.includes('/purge-test') ? { ok: true, payments: 5, refunds: 0, amountCents: 149500 }
      : u.includes('/ops/costs') ? SPEND
      : u.includes('/ops/payments/summary') ? SUMMARY
      : u.includes('/decide') ? { ok: true, decision: 'APPROVED', result: { amountCents: 29900 } }
      : u.includes('/refund') ? { ok: true, amountCents: 14900, caseTransitioned: false }
      : u.includes('/ops/payments') ? PAYMENTS
      : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('money page', () => {
  it('shows the six numbers, the Stripe mode, and the ledger with an honest free row', async () => {
    render(<MoneyPage />)
    expect(await screen.findByTestId('tile-collected')).toHaveTextContent('$8,671.00')
    expect(screen.getByTestId('tile-refund-rate')).toHaveTextContent('10.4%')
    expect(screen.getByTestId('tile-needs-a-decision')).toHaveTextContent('1')
    expect(screen.getByTestId('stripe-mode')).toHaveTextContent('STRIPE LIVE')
    expect(screen.getByTestId('needs-decision')).toHaveTextContent(/Dispute — Nguyen/)
    expect(screen.getByTestId('request-q_1')).toHaveTextContent(/Refund request — Whitfield.*dana@snotnoselegal.com · unreadable record/)
    expect(screen.getByTestId('recent-refunds')).toHaveTextContent(/\$149\.00 partial/)
    const table = await screen.findByTestId('payments-table')
    await waitFor(() => expect(table).toHaveTextContent(/Whitfield/))
    expect(table).toHaveTextContent(/nothing to refund/)
    expect(table).toHaveTextContent(/FAMILY50/)
  })

  it('refund dialog posts the chosen reason and a partial amount, then reports the outcome', async () => {
    render(<MoneyPage />)
    fireEvent.click(await screen.findByTestId('refund-p_1'))
    const dialog = screen.getByTestId('refund-dialog')
    expect(dialog).toHaveTextContent(/Full refund — \$299\.00/)
    const confirm = screen.getByTestId('refund-confirm')
    expect(confirm).toBeDisabled() // no reason yet

    fireEvent.change(screen.getByLabelText('Partial amount'), { target: { value: '149' } })
    fireEvent.click(screen.getByLabelText('Unreadable record'))
    expect(confirm).not.toBeDisabled()
    expect(confirm).toHaveTextContent('Refund $149.00')
    fireEvent.click(confirm)

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/ops/payments/p_1/refund') && c.init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post!.init!.body))).toEqual({ reason: 'unreadable_record', amountCents: 14900 })
    })
    expect(await screen.findByTestId('notice')).toHaveTextContent(/Refunded \$149\.00/)
  })

  it('approving a support request posts the decision (after a confirm)', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<MoneyPage />)
    fireEvent.click(await screen.findByTestId('approve-q_1'))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/ops/requests/q_1/decide') && c.init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post!.init!.body))).toEqual({ decision: 'APPROVED' })
    })
  })

  it('status filter and search hit the ledger endpoint with the right query', async () => {
    render(<MoneyPage />)
    await screen.findByTestId('payments-table')
    fireEvent.click(screen.getByRole('button', { name: 'Refunded' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/payments?status=refunded'))).toBe(true))
  })

  it('spend by week (incurred): model/OCR/total/per-case per week, with the period total in the heading', async () => {
    render(<MoneyPage />)
    const t = await screen.findByTestId('spend-by-week')
    await waitFor(() => expect(t).toHaveTextContent(/\$40\.20/))
    expect(t).toHaveTextContent(/\$41\.30/)
    expect(t).toHaveTextContent(/\$20\.65/)
    expect(screen.getByText(/last 12 weeks: \$61\.40 across 3 cases/)).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/ops/costs?weeks=12'))).toBe(true)
  })

  it('test-mode payments: hidden by default with a count, toggle re-fetches with includeTest=1, purge needs the typed phrase', async () => {
    render(<MoneyPage />)
    const bar = await screen.findByTestId('test-mode-bar')
    expect(bar).toHaveTextContent(/5 Stripe test-mode payments hidden/)
    expect(calls.some((c) => c.url.includes('/ops/payments/summary?days=30') && !c.url.includes('includeTest'))).toBe(true)
    fireEvent.click(screen.getByTestId('toggle-test'))
    await waitFor(() => expect(calls.some((c) => c.url.includes('/ops/payments/summary?days=30&includeTest=1'))).toBe(true))
    await waitFor(() => expect(calls.some((c) => /\/ops\/payments\?.*includeTest=1/.test(c.url))).toBe(true))
    const purge = screen.getByTestId('purge-test')
    expect(purge).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Purge confirmation'), { target: { value: 'PURGE TEST' } })
    expect(purge).not.toBeDisabled()
    fireEvent.click(purge)
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/payments/purge-test') && c.init?.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.url.endsWith('/ops/payments/purge-test'))!
    expect(JSON.parse(String(post.init?.body))).toEqual({ confirm: 'PURGE TEST' })
    expect(await screen.findByTestId('notice')).toHaveTextContent(/Purged 5 test-mode payment\(s\) \(\$1,495\.00\)/)
  })
})
