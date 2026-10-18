import { describe, it, expect } from 'vitest'
import { firstReviewFree, partnerCodeDiscount, applyPromo } from '../index'

const verified = { barVerifiedAt: '2026-01-05T00:00:00.000Z', meteredPages: 320, priorPaidReviews: 0, monthRedemptions: 3, monthCap: 20 }

describe('first review free (≤500 pages, verified bar number, monthly cap)', () => {
  it('eligible when every condition holds', () => {
    expect(firstReviewFree(verified)).toEqual({ eligible: true })
    expect(firstReviewFree({ ...verified, meteredPages: 500 })).toEqual({ eligible: true })
    expect(firstReviewFree({ ...verified, monthRedemptions: 19 })).toEqual({ eligible: true })
  })
  it('refuses, with the first failing reason, when a condition fails', () => {
    expect(firstReviewFree({ ...verified, barVerifiedAt: null })).toEqual({ eligible: false, reason: 'BAR_NOT_VERIFIED' })
    expect(firstReviewFree({ ...verified, barVerifiedAt: undefined })).toEqual({ eligible: false, reason: 'BAR_NOT_VERIFIED' })
    expect(firstReviewFree({ ...verified, meteredPages: 501 })).toEqual({ eligible: false, reason: 'TOO_MANY_PAGES' })
    expect(firstReviewFree({ ...verified, priorPaidReviews: 1 })).toEqual({ eligible: false, reason: 'NOT_FIRST_REVIEW' })
    expect(firstReviewFree({ ...verified, priorFreeReviews: 1 })).toEqual({ eligible: false, reason: 'NOT_FIRST_REVIEW' })
    expect(firstReviewFree({ ...verified, monthRedemptions: 20 })).toEqual({ eligible: false, reason: 'MONTH_CAP_REACHED' })
    expect(firstReviewFree({ ...verified, monthCap: 0 })).toEqual({ eligible: false, reason: 'MONTH_CAP_REACHED' })
  })
})

describe('bar-partner code: 15% off the first paid review', () => {
  it('takes exactly 15% off each rung', () => {
    expect(partnerCodeDiscount({ code: 'TCDLA', isFirstPaid: true, cents: 14900 })).toEqual({ applied: true, code: 'TCDLA', percent: 15, discountCents: 2235, cents: 12665 })
    expect(partnerCodeDiscount({ code: 'HCCLA', isFirstPaid: true, cents: 24900 })).toMatchObject({ applied: true, discountCents: 3735, cents: 21165 })
    expect(partnerCodeDiscount({ code: 'SBOT', isFirstPaid: true, cents: 34900 })).toMatchObject({ applied: true, discountCents: 5235, cents: 29665 })
  })
  it('does not apply without a code, after the first paid review, or on a zero price', () => {
    expect(partnerCodeDiscount({ code: null, isFirstPaid: true, cents: 14900 })).toEqual({ applied: false, reason: 'NO_CODE', cents: 14900 })
    expect(partnerCodeDiscount({ code: '', isFirstPaid: true, cents: 14900 })).toEqual({ applied: false, reason: 'NO_CODE', cents: 14900 })
    expect(partnerCodeDiscount({ code: 'TCDLA', isFirstPaid: false, cents: 14900 })).toEqual({ applied: false, reason: 'NOT_FIRST_PAID', cents: 14900 })
    expect(partnerCodeDiscount({ code: 'TCDLA', isFirstPaid: true, cents: 0 })).toEqual({ applied: false, reason: 'NOTHING_TO_DISCOUNT', cents: 0 })
  })
})

describe('applyPromo: free first review beats the partner code', () => {
  it('an eligible first review is free even with a partner code in hand', () => {
    expect(applyPromo({ cents: 24900, firstReview: verified, partnerCode: 'TCDLA', isFirstPaid: true })).toEqual({ kind: 'FREE_FIRST', cents: 0, listCents: 24900 })
  })
  it('otherwise the partner code applies', () => {
    expect(applyPromo({ cents: 24900, firstReview: { ...verified, meteredPages: 900 }, partnerCode: 'TCDLA', isFirstPaid: true }))
      .toEqual({ kind: 'PARTNER_CODE', cents: 21165, listCents: 24900, discountCents: 3735, code: 'TCDLA', freeFirstRefused: 'TOO_MANY_PAGES' })
  })
  it('with nothing applicable the list price stands, with the refusal reasons for the UI', () => {
    expect(applyPromo({ cents: 24900, firstReview: { ...verified, priorPaidReviews: 2 }, partnerCode: 'TCDLA', isFirstPaid: false }))
      .toEqual({ kind: 'NONE', cents: 24900, listCents: 24900, freeFirstRefused: 'NOT_FIRST_REVIEW', partnerRefused: 'NOT_FIRST_PAID' })
    expect(applyPromo({ cents: 24900 })).toEqual({ kind: 'NONE', cents: 24900, listCents: 24900, freeFirstRefused: 'NOT_OFFERED', partnerRefused: 'NO_CODE' })
  })
})
