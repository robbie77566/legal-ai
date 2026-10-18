/**
 * Promotions (plan §4) as pure rules. The promo engine (persistence slice)
 * supplies the counts — redemptions this month, prior reviews, whether the
 * code is a partner code — and these functions decide. Order in
 * `applyPromo`: a free first review beats a partner code; the partner code
 * is for the first PAID review, so a free one does not spend it.
 */
import type { IsoDateTime } from './time'

export const FIRST_REVIEW_FREE_MAX_PAGES = 500
export const PARTNER_CODE_DISCOUNT_PERCENT = 15

export interface FirstReviewFreeInput {
  /** When the bar number was verified; null/undefined = not verified. */
  barVerifiedAt?: IsoDateTime | null
  /** Reporter's-record pages (the same count that sets the bucket). */
  meteredPages: number
  priorPaidReviews: number
  /** Free reviews already taken by this attorney (defaults to 0). */
  priorFreeReviews?: number
  /** Redemptions across all attorneys this calendar month. */
  monthRedemptions: number
  /** The promo engine's `maxRedemptionsPerMonth`. */
  monthCap: number
}

export type FirstReviewFreeRefusal = 'BAR_NOT_VERIFIED' | 'TOO_MANY_PAGES' | 'NOT_FIRST_REVIEW' | 'MONTH_CAP_REACHED'

export type FirstReviewFreeResult = { eligible: true } | { eligible: false; reason: FirstReviewFreeRefusal }

/** First review free: ≤500 reporter pages, verified bar number, nothing paid or free before, under the monthly cap. */
export function firstReviewFree(input: FirstReviewFreeInput): FirstReviewFreeResult {
  if (!input.barVerifiedAt) return { eligible: false, reason: 'BAR_NOT_VERIFIED' }
  if (input.meteredPages > FIRST_REVIEW_FREE_MAX_PAGES) return { eligible: false, reason: 'TOO_MANY_PAGES' }
  if (input.priorPaidReviews > 0 || (input.priorFreeReviews ?? 0) > 0) return { eligible: false, reason: 'NOT_FIRST_REVIEW' }
  if (input.monthRedemptions >= input.monthCap) return { eligible: false, reason: 'MONTH_CAP_REACHED' }
  return { eligible: true }
}

export interface PartnerCodeInput {
  /** A code the promo engine has already matched to a bar partner; empty/null = none. */
  code?: string | null
  /** True when this would be the attorney's first paid review. */
  isFirstPaid: boolean
  cents: number
  /** Defaults to 15. */
  percent?: number
}

export type PartnerCodeRefusal = 'NO_CODE' | 'NOT_FIRST_PAID' | 'NOTHING_TO_DISCOUNT'

export type PartnerCodeResult =
  | { applied: true; code: string; percent: number; discountCents: number; cents: number }
  | { applied: false; reason: PartnerCodeRefusal; cents: number }

/** Bar-partner code: 15% off the first paid review, rounded to the cent. */
export function partnerCodeDiscount({ code, isFirstPaid, cents, percent = PARTNER_CODE_DISCOUNT_PERCENT }: PartnerCodeInput): PartnerCodeResult {
  if (!code) return { applied: false, reason: 'NO_CODE', cents }
  if (!isFirstPaid) return { applied: false, reason: 'NOT_FIRST_PAID', cents }
  if (cents <= 0) return { applied: false, reason: 'NOTHING_TO_DISCOUNT', cents }
  const discountCents = Math.round((cents * percent) / 100)
  return { applied: true, code, percent, discountCents, cents: cents - discountCents }
}

export interface ApplyPromoInput {
  /** The list price being discounted. */
  cents: number
  /** Omit when the free first review is not offered to this buyer. */
  firstReview?: FirstReviewFreeInput
  partnerCode?: string | null
  /** Defaults to false. */
  isFirstPaid?: boolean
}

export type ApplyPromoResult =
  | { kind: 'FREE_FIRST'; cents: 0; listCents: number }
  | { kind: 'PARTNER_CODE'; cents: number; listCents: number; discountCents: number; code: string; freeFirstRefused: FirstReviewFreeRefusal | 'NOT_OFFERED' }
  | { kind: 'NONE'; cents: number; listCents: number; freeFirstRefused: FirstReviewFreeRefusal | 'NOT_OFFERED'; partnerRefused: PartnerCodeRefusal }

/** Free first review, else partner code, else the list price — with each refusal reason for the UI. */
export function applyPromo({ cents, firstReview, partnerCode, isFirstPaid = false }: ApplyPromoInput): ApplyPromoResult {
  const free = firstReview ? firstReviewFree(firstReview) : ({ eligible: false, reason: 'NOT_OFFERED' } as const)
  if (free.eligible) return { kind: 'FREE_FIRST', cents: 0, listCents: cents }
  const partner = partnerCodeDiscount({ code: partnerCode, isFirstPaid, cents })
  if (partner.applied) {
    return { kind: 'PARTNER_CODE', cents: partner.cents, listCents: cents, discountCents: partner.discountCents, code: partner.code, freeFirstRefused: free.reason }
  }
  return { kind: 'NONE', cents, listCents: cents, freeFirstRefused: free.reason, partnerRefused: partner.reason }
}
