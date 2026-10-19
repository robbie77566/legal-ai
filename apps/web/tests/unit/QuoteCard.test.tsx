import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuoteCard, { type QuoteView } from '@/components/counsel/QuoteCard'

/**
 * F3 — the quote card renders every decision kind the pure pricing rule can
 * answer (packages/case-lifecycle/pricing/quote.ts): PAY with the rung and
 * price, CREDIT, ALLOWANCE with the remaining count, FREE, QUOTE_REQUIRED
 * with the request form, REFUSED. Accepting CARD goes to the Checkout URL.
 */
const view = (decision: QuoteView['decision'], extra: Partial<QuoteView> = {}): QuoteView => ({
  caseId: 'case_1',
  status: 'QUOTED',
  bucket: 'STANDARD',
  meteredPages: { reporter: 412, clerk: 88, exhibit: 0, total: 500 },
  decision,
  methods: [],
  allowance: null,
  credits: { live: 0, unspent: 0 },
  ...extra,
})

const calls: Array<{ url: string; body: unknown }> = []
let answer: { status: number; body: unknown } = { status: 200, body: { ok: true } }
beforeEach(() => {
  calls.length = 0
  answer = { status: 200, body: { ok: true } }
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as Response
  }))
})

describe('<QuoteCard />', () => {
  it('PAY: the rung and the price, and accept goes to Stripe Checkout', async () => {
    answer = { status: 200, body: { ok: true, method: 'CARD', url: 'https://checkout.stripe.test/s_1' } }
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { assign(v) } }, writable: true })
    render(<QuoteCard quote={view({ kind: 'PAY', cents: 24900, listCents: 24900, rung: 'STANDARD', sku: 'COUNSEL_STANDARD' })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-card')).toHaveAttribute('data-kind', 'PAY')
    expect(screen.getByTestId('quote-price')).toHaveTextContent('$249')
    expect(screen.getByText(/Counsel Review Standard/)).toBeInTheDocument()
    expect(screen.getByText(/412 reporter's-record pages/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('quote-accept'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/s_1'))
    expect(calls[0].url).toMatch(/\/counsel\/matters\/case_1\/quote\/accept$/)
    expect(calls[0].body).toEqual({ method: 'CARD' })
  })

  it('PAY with a partner code shows the list price struck through', () => {
    render(<QuoteCard quote={view({ kind: 'PAY', cents: 21165, listCents: 24900, rung: 'STANDARD', sku: 'COUNSEL_STANDARD', discountCents: 3735, promoCode: 'TCDLA15' })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-price')).toHaveTextContent('$211.65')
    expect(screen.getByTestId('quote-price')).toHaveTextContent('$249')
    expect(screen.getByTestId('quote-price')).toHaveTextContent('TCDLA15')
  })

  it('CREDIT: one pack credit, and accept starts the review at once', async () => {
    const onSettled = vi.fn()
    render(<QuoteCard quote={view({ kind: 'CREDIT', creditId: 'cr_1', rung: 'STANDARD', sku: 'COUNSEL_STANDARD' }, { credits: { live: 3, unspent: 3 } })} onSettled={onSettled} />)
    expect(screen.getByTestId('quote-card')).toHaveAttribute('data-kind', 'CREDIT')
    expect(screen.getByTestId('quote-price')).toHaveTextContent('1 pack credit')
    fireEvent.click(screen.getByTestId('quote-accept'))
    await waitFor(() => expect(onSettled).toHaveBeenCalled())
    expect(calls[0].body).toEqual({ method: 'CREDIT' })
  })

  it('ALLOWANCE: covered, with the records remaining', () => {
    render(<QuoteCard quote={view({ kind: 'ALLOWANCE', remaining: 14, rung: 'SHORT', sku: 'COUNSEL_SHORT' })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-price')).toHaveTextContent('Covered by your allowance')
    expect(screen.getByText('14 records left after this one.')).toBeInTheDocument()
    expect(screen.getByTestId('quote-accept')).toHaveTextContent('Use the allowance')
  })

  it('FREE: the first review, free, with the list price struck', () => {
    render(<QuoteCard quote={view({ kind: 'FREE', reason: 'FIRST_REVIEW_FREE', listCents: 14900, rung: 'SHORT', sku: 'COUNSEL_SHORT' })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-price')).toHaveTextContent('Free')
    expect(screen.getByTestId('quote-price')).toHaveTextContent('$149')
    expect(screen.getByTestId('quote-accept')).toHaveTextContent('Start the free review')
  })

  it('QUOTE_REQUIRED: from $499 and a request form that posts the note', async () => {
    render(<QuoteCard quote={view({ kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' }, { bucket: 'LONG', meteredPages: { reporter: 1800, clerk: 0, exhibit: 0, total: 1800 } })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-price')).toHaveTextContent('By quote, from $499')
    fireEvent.change(screen.getByTestId('quote-note'), { target: { value: 'Two trials consolidated.' } })
    fireEvent.click(screen.getByTestId('quote-request'))
    expect(await screen.findByTestId('quote-requested')).toHaveTextContent('Quote requested')
    expect(calls[0].url).toMatch(/\/quote\/request$/)
    expect(calls[0].body).toEqual({ note: 'Two trials consolidated.' })
  })

  it('QUOTE_REQUIRED already answered shows the admin\'s price', () => {
    render(<QuoteCard quote={view({ kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' }, { quoteRequest: { id: 'q1', status: 'QUOTED', quotedCents: 62500, createdAt: '2026-10-19T00:00:00Z' } })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-requested')).toHaveTextContent('Quoted at $625')
  })

  it('REFUSED: no price, and why', () => {
    render(<QuoteCard quote={view({ kind: 'REFUSED', reason: 'NO_PRICE', sku: 'COUNSEL_STANDARD' }, { allowance: { remaining: 0, granted: 15 } })} onSettled={() => {}} />)
    expect(screen.getByTestId('quote-price')).toHaveTextContent('No price for this record')
    expect(screen.getByText(/allowance is used up/)).toBeInTheDocument()
    expect(screen.queryByTestId('quote-accept')).toBeNull()
  })

  it('a method the api no longer offers is reported, not swallowed', async () => {
    answer = { status: 409, body: { error: 'METHOD_NOT_AVAILABLE' } }
    render(<QuoteCard quote={view({ kind: 'FREE', reason: 'FIRST_REVIEW_FREE', listCents: 14900, rung: 'SHORT', sku: 'COUNSEL_SHORT' })} onSettled={() => {}} />)
    fireEvent.click(screen.getByTestId('quote-accept'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not open for this record any more/)
  })
})
