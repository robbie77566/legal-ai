/**
 * The single pricing decision the api will make when a record is metered
 * (the QUOTED state of plan §5 B). Precedence, in order:
 *
 *   0. LONG record for a professional audience → QUOTE_REQUIRED (no
 *      allowance, credit or promo can buy a record the engine cannot
 *      yet split). Families are never refused: flat price + overage.
 *   1. Allowance (pilot / public-interest / Office) → ALLOWANCE.
 *   2. Prepaid credit of the rung or higher → CREDIT.
 *   3. Free first review → FREE.
 *   4. Paid: the rung price, less a partner code on the first paid review → PAY.
 *
 * A refused step falls through and its reason rides on the final result
 * (`allowanceRefused`, `creditRefused`, `freeFirstRefused`) so the UI can
 * say why. When no price row exists for the audience (an office or clinic
 * past its allowance), the answer is REFUSED rather than a guessed price.
 */
import type { RecordBucket } from './buckets'
import { decrementAllowance, type AllowanceLedger, type AllowanceRefusalReason } from './allowances'
import { consumeCredit, type Credit, type CreditRefusalReason } from './credits'
import { priceForBucket, type Audience, type PriceBook, type Sku } from './price-book'
import { applyPromo, type FirstReviewFreeInput, type FirstReviewFreeRefusal } from './promotions'
import type { IsoDateTime } from './time'

export interface QuotePromoInput {
  firstReview?: FirstReviewFreeInput
  partnerCode?: string | null
  isFirstPaid?: boolean
}

export interface QuoteForRecordInput {
  book: PriceBook
  audience: Audience
  bucket: RecordBucket
  at: IsoDateTime
  /** The buyer's unspent credits; the result carries the updated set when one is consumed. */
  credits?: readonly Credit[]
  /** The organisation's current ledger; the result carries the decremented ledger when it covers the record. */
  allowance?: AllowanceLedger
  /** Attorney promotions; ignored for other audiences. */
  promo?: QuotePromoInput
}

interface Refusals {
  allowanceRefused?: AllowanceRefusalReason
  creditRefused?: CreditRefusalReason
  freeFirstRefused?: FirstReviewFreeRefusal | 'NOT_OFFERED'
}

export type QuoteDecision =
  | ({ kind: 'PAY'; cents: number; listCents: number; rung: RecordBucket; sku: Sku; discountCents?: number; promoCode?: string } & Refusals)
  | ({ kind: 'CREDIT'; creditId: string; credits: Credit[]; rung: RecordBucket; sku: Sku } & Refusals)
  | { kind: 'ALLOWANCE'; remaining: number; ledger: AllowanceLedger; rung: RecordBucket; sku: Sku }
  | ({ kind: 'FREE'; reason: 'FIRST_REVIEW_FREE'; listCents: number; rung: RecordBucket; sku: Sku } & Refusals)
  | { kind: 'QUOTE_REQUIRED'; from: number; sku: Sku }
  | ({ kind: 'REFUSED'; reason: 'NO_PRICE'; sku: Sku } & Refusals)

/** Drops undefined keys so decisions serialise and compare cleanly. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function quoteForRecord({ book, audience, bucket, at, credits, allowance, promo }: QuoteForRecordInput): QuoteDecision {
  const price = priceForBucket(book, bucket, audience, at)
  // 0. Long records are a quote for every professional audience.
  if (price.kind === 'QUOTE_REQUIRED') return { kind: 'QUOTE_REQUIRED', from: price.from, sku: price.sku }
  const sku = price.sku
  const refusals: Refusals = {}

  // 1. Allowance.
  if (allowance) {
    const r = decrementAllowance(allowance, at)
    if (r.ok) return { kind: 'ALLOWANCE', remaining: r.remaining, ledger: r.ledger, rung: bucket, sku }
    refusals.allowanceRefused = r.reason
  }

  // 2. Credits (packs exist only for purchasable rungs; a family LONG record has none).
  if (credits && bucket !== 'LONG') {
    const r = consumeCredit(credits, { rung: bucket, at })
    if (r.ok) return compact({ kind: 'CREDIT', creditId: r.credit.id, credits: r.credits, rung: bucket, sku, ...refusals })
    refusals.creditRefused = r.reason
  }

  // 3–4. A price is needed from here on.
  if (price.kind === 'NO_PRICE') return compact({ kind: 'REFUSED', reason: 'NO_PRICE', sku, ...refusals })

  if (audience === 'ATTORNEY' && promo) {
    const p = applyPromo({ cents: price.cents, firstReview: promo.firstReview, partnerCode: promo.partnerCode, isFirstPaid: promo.isFirstPaid })
    if (p.kind === 'FREE_FIRST') return compact({ kind: 'FREE', reason: 'FIRST_REVIEW_FREE', listCents: p.listCents, rung: bucket, sku, ...refusals })
    if (p.kind === 'PARTNER_CODE') {
      return compact({ kind: 'PAY', cents: p.cents, listCents: p.listCents, rung: bucket, sku, discountCents: p.discountCents, promoCode: p.code, ...refusals, freeFirstRefused: p.freeFirstRefused })
    }
    return compact({ kind: 'PAY', cents: p.cents, listCents: p.listCents, rung: bucket, sku, ...refusals, freeFirstRefused: p.freeFirstRefused })
  }

  return compact({ kind: 'PAY', cents: price.cents, listCents: price.cents, rung: bucket, sku, ...refusals })
}
