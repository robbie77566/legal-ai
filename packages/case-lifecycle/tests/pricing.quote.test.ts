import { describe, it, expect } from 'vitest'
import {
  quoteForRecord,
  issuePackCredits,
  pilotAllowance,
  publicInterestAllowance,
  officeAllowance,
  decrementAllowance,
  DEFAULT_PRICE_BOOK,
  type AllowanceLedger,
} from '../index'

const at = '2026-03-01T00:00:00.000Z'
const book = DEFAULT_PRICE_BOOK
const freeFirst = { barVerifiedAt: '2026-01-05T00:00:00.000Z', meteredPages: 300, priorPaidReviews: 0, monthRedemptions: 0, monthCap: 20 }

function exhausted(ledger: AllowanceLedger): AllowanceLedger {
  let l = ledger
  for (let i = 0; i < ledger.granted; i++) {
    const r = decrementAllowance(l, at)
    if (!r.ok) throw new Error('unexpected')
    l = r.ledger
  }
  return l
}

describe('B5 — quoteForRecord precedence: LONG refusal → allowance → credit → free first → paid', () => {
  it('an attorney with nothing in hand pays the rung price', () => {
    expect(quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'SHORT', at })).toMatchObject({ kind: 'PAY', cents: 14900, rung: 'SHORT', sku: 'COUNSEL_SHORT', listCents: 14900 })
    expect(quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'STANDARD', at })).toMatchObject({ kind: 'PAY', cents: 24900, rung: 'STANDARD' })
    expect(quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'EXTENDED', at })).toMatchObject({ kind: 'PAY', cents: 34900, rung: 'EXTENDED' })
  })

  it('LONG is refused for attorneys with a quote from 49900, before any allowance, credit or promo is considered', () => {
    const credits = issuePackCredits({ rung: 'EXTENDED', purchasedAt: '2026-01-01T00:00:00.000Z' }).credits
    const q = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'LONG', at, credits, promo: { firstReview: freeFirst, partnerCode: 'TCDLA', isFirstPaid: true } })
    expect(q).toEqual({ kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' })
    const office = quoteForRecord({ book, audience: 'OFFICE', bucket: 'LONG', at, allowance: officeAllowance(50, '2026-01-01T00:00:00.000Z') })
    expect(office).toEqual({ kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' })
  })

  it('a FAMILY LONG record is NOT refused: families keep the flat price and the overage rule', () => {
    expect(quoteForRecord({ book, audience: 'FAMILY', bucket: 'LONG', at })).toMatchObject({ kind: 'PAY', cents: 29900, sku: 'REVIEW' })
    expect(quoteForRecord({ book, audience: 'FAMILY', bucket: 'SHORT', at })).toMatchObject({ kind: 'PAY', cents: 29900, sku: 'REVIEW' })
  })

  it('allowance beats credits and promos', () => {
    const allowance = pilotAllowance('2026-02-01T00:00:00.000Z')
    const credits = issuePackCredits({ rung: 'STANDARD', purchasedAt: '2026-01-01T00:00:00.000Z' }).credits
    const q = quoteForRecord({ book, audience: 'OFFICE', bucket: 'STANDARD', at, allowance, credits })
    expect(q).toMatchObject({ kind: 'ALLOWANCE', remaining: 14, ledger: { kind: 'PILOT', used: 1 } })
  })

  it('an exhausted allowance falls through to credits, then to paid, and is reported', () => {
    const allowance = exhausted(publicInterestAllowance('2026-01-01T00:00:00.000Z'))
    const credits = issuePackCredits({ rung: 'STANDARD', purchasedAt: '2026-01-01T00:00:00.000Z', packId: 'p' }).credits
    const withCredit = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'STANDARD', at, allowance, credits })
    expect(withCredit).toMatchObject({ kind: 'CREDIT', creditId: 'p-1', allowanceRefused: 'EXHAUSTED' })
    const paid = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'STANDARD', at, allowance })
    expect(paid).toMatchObject({ kind: 'PAY', cents: 24900, allowanceRefused: 'EXHAUSTED' })
  })

  it('a clinic past its 25 free records with no Office plan is refused: no per-record price for that audience', () => {
    const allowance = exhausted(publicInterestAllowance('2026-01-01T00:00:00.000Z'))
    expect(quoteForRecord({ book, audience: 'CLINIC', bucket: 'STANDARD', at, allowance })).toEqual({ kind: 'REFUSED', reason: 'NO_PRICE', allowanceRefused: 'EXHAUSTED', sku: 'COUNSEL_STANDARD' })
    expect(quoteForRecord({ book, audience: 'OFFICE', bucket: 'STANDARD', at })).toEqual({ kind: 'REFUSED', reason: 'NO_PRICE', sku: 'COUNSEL_STANDARD' })
  })

  it('credit beats the free first review; the credit returned is marked consumed', () => {
    const credits = issuePackCredits({ rung: 'STANDARD', purchasedAt: '2026-01-01T00:00:00.000Z', packId: 'p' }).credits
    const q = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'STANDARD', at, credits, promo: { firstReview: freeFirst } })
    expect(q.kind).toBe('CREDIT')
    if (q.kind !== 'CREDIT') return
    expect(q.creditId).toBe('p-1')
    expect(q.credits.find((c) => c.id === 'p-1')?.consumedAt).toBe(at)
    expect(q.credits.filter((c) => c.consumedAt === null)).toHaveLength(4)
  })

  it('a wallet with no usable credit falls through to the free first review, then to paid', () => {
    const credits = issuePackCredits({ rung: 'SHORT', purchasedAt: '2026-01-01T00:00:00.000Z' }).credits
    expect(quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'STANDARD', at, credits, promo: { firstReview: freeFirst } }))
      .toMatchObject({ kind: 'FREE', reason: 'FIRST_REVIEW_FREE', creditRefused: 'RUNG_TOO_LOW', listCents: 24900 })
    expect(quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'EXTENDED', at, credits, promo: { firstReview: { ...freeFirst, meteredPages: 900 } } }))
      .toMatchObject({ kind: 'PAY', cents: 34900, creditRefused: 'RUNG_TOO_LOW', freeFirstRefused: 'TOO_MANY_PAGES' })
  })

  it('free first review beats the partner code; the partner code applies to a first paid review', () => {
    const free = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'SHORT', at, promo: { firstReview: freeFirst, partnerCode: 'TCDLA', isFirstPaid: true } })
    expect(free).toMatchObject({ kind: 'FREE', reason: 'FIRST_REVIEW_FREE' })
    const partner = quoteForRecord({ book, audience: 'ATTORNEY', bucket: 'SHORT', at, promo: { firstReview: { ...freeFirst, priorPaidReviews: 1 }, partnerCode: 'TCDLA', isFirstPaid: true } })
    expect(partner).toMatchObject({ kind: 'PAY', cents: 12665, listCents: 14900, discountCents: 2235, promoCode: 'TCDLA', freeFirstRefused: 'NOT_FIRST_REVIEW' })
  })

  it('promotions are for attorneys only: a family with a partner code pays the family price', () => {
    expect(quoteForRecord({ book, audience: 'FAMILY', bucket: 'SHORT', at, promo: { firstReview: freeFirst, partnerCode: 'TCDLA', isFirstPaid: true } }))
      .toMatchObject({ kind: 'PAY', cents: 29900, listCents: 29900 })
  })

  it('a book with no row for the audience and sku refuses rather than guessing', () => {
    expect(quoteForRecord({ book: { rows: [] }, audience: 'ATTORNEY', bucket: 'SHORT', at })).toEqual({ kind: 'REFUSED', reason: 'NO_PRICE', sku: 'COUNSEL_SHORT' })
    expect(quoteForRecord({ book: { rows: [] }, audience: 'FAMILY', bucket: 'SHORT', at })).toEqual({ kind: 'REFUSED', reason: 'NO_PRICE', sku: 'REVIEW' })
  })
})
