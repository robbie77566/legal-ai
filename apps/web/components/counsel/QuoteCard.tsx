'use client'

/**
 * The quote card (persona_rollout_plan.md §4, §5 B; GET /counsel/matters/:id/
 * quote): one card per decision kind — PAY with the rung and price, CREDIT,
 * ALLOWANCE with the remaining count, FREE, QUOTE_REQUIRED with the request
 * form, REFUSED with the reason. Accept → CARD goes to the Stripe Checkout
 * URL; the other methods start the pipeline at once and the page refreshes.
 */
import { useState } from 'react'
import { acceptQuote, requestQuote, type QuoteMethod } from '@/lib/api'
import { BUCKET_LABEL } from '@/lib/counsel'

export type QuoteDecisionView =
  | { kind: 'PAY'; cents: number; listCents: number; rung: string; sku: string; discountCents?: number; promoCode?: string; freeFirstRefused?: string }
  | { kind: 'CREDIT'; creditId: string; rung: string; sku: string }
  | { kind: 'ALLOWANCE'; remaining: number; rung: string; sku: string }
  | { kind: 'FREE'; reason: 'FIRST_REVIEW_FREE'; listCents: number; rung: string; sku: string }
  | { kind: 'QUOTE_REQUIRED'; from: number; sku: string }
  | { kind: 'REFUSED'; reason: 'NO_PRICE'; sku: string; allowanceRefused?: string }

export interface QuoteView {
  caseId: string
  status: string
  bucket: string
  meteredPages: { reporter: number; clerk: number; exhibit: number; total: number }
  decision: QuoteDecisionView
  methods: QuoteMethod[]
  allowance: { remaining: number; granted: number } | null
  credits: { live: number; unspent: number }
  promoRefused?: string
  quoteRequest?: { id: string; status: string; quotedCents: number | null; createdAt: string }
}

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

// packages/case-lifecycle/pricing/promotions.ts FirstReviewFreeRefusal, in counsel's words.
const FREE_FIRST_REFUSED: Record<string, string> = {
  NOT_OFFERED: '',
  BAR_NOT_VERIFIED: 'The free first review needs a verified bar number; a person is checking yours.',
  TOO_MANY_PAGES: 'The free first review covers up to 500 pages.',
  NOT_FIRST_REVIEW: 'The free first review applies before the first paid one.',
  MONTH_CAP_REACHED: 'The free first reviews for this month are taken; the next month opens more.',
}

export default function QuoteCard({ quote, onSettled }: { quote: QuoteView; onSettled: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [requested, setRequested] = useState(Boolean(quote.quoteRequest))
  const d = quote.decision

  const accept = async (method: QuoteMethod) => {
    setBusy(true)
    setError('')
    try {
      const res = await acceptQuote(quote.caseId, method)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string }
      if (!res.ok) throw new Error(body.error === 'METHOD_NOT_AVAILABLE' ? 'That way of paying is not open for this record any more — refresh the quote.' : body.error ?? 'Could not accept the quote — try again.')
      if (method === 'CARD' && body.url) {
        window.location.href = body.url
        return
      }
      await onSettled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the quote — try again.')
    } finally {
      setBusy(false)
    }
  }

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await requestQuote(quote.caseId, note.trim() || undefined)
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Could not send the request — try again.')
      setRequested(true)
      await onSettled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request — try again.')
    } finally {
      setBusy(false)
    }
  }

  const pages = `${quote.meteredPages.reporter.toLocaleString('en-US')} reporter's-record pages · ${BUCKET_LABEL[quote.bucket] ?? quote.bucket}`
  const button = 'mt-4 rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40'

  return (
    <section data-testid="quote-card" data-kind={d.kind} className="rounded-xl border-2 border-db-accent bg-db-surface p-5">
      <h2 className="font-db-serif text-xl font-semibold">Quote</h2>
      <p className="mt-1 text-sm text-db-muted">{pages}</p>
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--db-urgent)' }}>{error}</p>}

      {d.kind === 'PAY' && (
        <div>
          <p className="mt-3 font-db-serif text-3xl font-bold" data-testid="quote-price">
            {usd(d.cents)}
            {d.discountCents ? <span className="ml-2 text-base font-normal text-db-muted"><s>{usd(d.listCents)}</s> with {d.promoCode}</span> : null}
          </p>
          <p className="text-sm text-db-muted">Counsel Review {d.rung.charAt(0) + d.rung.slice(1).toLowerCase()}. Card by Stripe Checkout; the review starts when the payment lands.</p>
          {d.freeFirstRefused && FREE_FIRST_REFUSED[d.freeFirstRefused] && <p className="mt-2 text-xs text-db-muted">{FREE_FIRST_REFUSED[d.freeFirstRefused]}</p>}
          {quote.promoRefused && <p className="mt-2 text-xs text-db-muted">{quote.promoRefused}</p>}
          <button type="button" disabled={busy} onClick={() => void accept('CARD')} className={button} data-testid="quote-accept">
            {busy ? 'Opening checkout…' : `Pay ${usd(d.cents)} and start the review`}
          </button>
        </div>
      )}

      {d.kind === 'CREDIT' && (
        <div>
          <p className="mt-3 font-db-serif text-3xl font-bold" data-testid="quote-price">1 pack credit</p>
          <p className="text-sm text-db-muted">A {d.rung.toLowerCase()} credit from your five-record pack covers this record; {quote.credits.live} unspent after this one.</p>
          <button type="button" disabled={busy} onClick={() => void accept('CREDIT')} className={button} data-testid="quote-accept">
            {busy ? 'Starting…' : 'Use a credit and start the review'}
          </button>
        </div>
      )}

      {d.kind === 'ALLOWANCE' && (
        <div>
          <p className="mt-3 font-db-serif text-3xl font-bold" data-testid="quote-price">Covered by your allowance</p>
          <p className="text-sm text-db-muted">{d.remaining} record{d.remaining === 1 ? '' : 's'} left after this one.</p>
          <button type="button" disabled={busy} onClick={() => void accept('ALLOWANCE')} className={button} data-testid="quote-accept">
            {busy ? 'Starting…' : 'Use the allowance and start the review'}
          </button>
        </div>
      )}

      {d.kind === 'FREE' && (
        <div>
          <p className="mt-3 font-db-serif text-3xl font-bold" data-testid="quote-price">Free <span className="text-base font-normal text-db-muted"><s>{usd(d.listCents)}</s></span></p>
          <p className="text-sm text-db-muted">Your first review, free with a verified bar number.</p>
          <button type="button" disabled={busy} onClick={() => void accept('FREE')} className={button} data-testid="quote-accept">
            {busy ? 'Starting…' : 'Start the free review'}
          </button>
        </div>
      )}

      {d.kind === 'QUOTE_REQUIRED' && (
        <div>
          <p className="mt-3 font-db-serif text-3xl font-bold" data-testid="quote-price">By quote, from {usd(d.from)}</p>
          <p className="text-sm text-db-muted">Records over 1,500 reporter&rsquo;s-record pages are priced by hand until the volume split ships. Nothing runs until you accept the price.</p>
          {requested ? (
            <p className="mt-3 rounded-lg bg-db-accent-soft px-3 py-2 text-sm" data-testid="quote-requested">
              {quote.quoteRequest?.status === 'QUOTED' && quote.quoteRequest.quotedCents !== null
                ? `Quoted at ${usd(quote.quoteRequest.quotedCents)} — we will email the next step.`
                : 'Quote requested. An admin answers by email, usually within a working day.'}
            </p>
          ) : (
            <form onSubmit={request} className="mt-3">
              <label className="block text-sm">
                <span className="font-semibold">Anything that bears on the price (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-2" data-testid="quote-note" />
              </label>
              <button type="submit" disabled={busy} className={button} data-testid="quote-request">
                {busy ? 'Sending…' : 'Request a quote'}
              </button>
            </form>
          )}
        </div>
      )}

      {d.kind === 'REFUSED' && (
        <div>
          <p className="mt-3 font-db-serif text-2xl font-bold" data-testid="quote-price">No price for this record</p>
          <p className="text-sm text-db-muted">
            {quote.allowance
              ? 'The organisation\'s allowance is used up for this period; the owner can ask about an office plan.'
              : 'Your organisation has no plan that covers this record yet; the owner can ask about one.'}
          </p>
        </div>
      )}
    </section>
  )
}
