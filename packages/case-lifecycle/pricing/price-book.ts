/**
 * The price book (persona rollout plan §4): every price, pack, promotion
 * and allowance as plain data keyed by audience and SKU, with effective
 * dates. The persistence slice stores and loads rows of exactly this shape;
 * nothing here reads the environment. The family rows equal the api's
 * `PRICES_CENTS` defaults (29900 / 4900 / 9900) — the family path keeps
 * its env-driven override until it is pointed at a stored book.
 */
import type { IsoDateTime } from './time'
import { toMillis } from './time'
import type { RecordBucket, Rung } from './buckets'

export const AUDIENCES = ['FAMILY', 'ATTORNEY', 'OFFICE', 'CLINIC'] as const
export type Audience = (typeof AUDIENCES)[number]

export const SKUS = [
  // Families (unchanged)
  'REVIEW',
  'OVERAGE',
  // Everyone
  'RERUN',
  // Counsel ladder
  'COUNSEL_SHORT',
  'COUNSEL_STANDARD',
  'COUNSEL_EXTENDED',
  'COUNSEL_LONG',
  // Prepaid packs (five records of one rung)
  'PACK_SHORT',
  'PACK_STANDARD',
  'PACK_EXTENDED',
  // Promotions
  'FIRST_REVIEW_FREE',
  'PARTNER_CODE',
  // Allowances
  'OFFICE_50',
  'OFFICE_120',
  'OFFICE_250',
  'PD_PILOT',
  'PUBLIC_INTEREST',
] as const
export type Sku = (typeof SKUS)[number]

export type OfficeTier = 50 | 120 | 250

/** Non-price terms a row may carry. `cents` is always the amount charged for the SKU itself. */
export type RowTerms =
  /** `cents` is a floor for a quote, not a price; the row is never purchasable. */
  | { kind: 'QUOTE_FROM' }
  /** A prepaid pack: `cents` is the discounted total for `records` credits of `rung`. */
  | { kind: 'PACK'; rung: Rung; records: number; discountPercent: number; expiryMonths: number }
  | { kind: 'FREE_FIRST'; maxPages: number; requiresBarVerification: true; monthCap: number }
  | { kind: 'PARTNER_CODE'; discountPercent: number; firstPaidOnly: true }
  /** An allowance plan: `cents` buys `records` records over `periodDays`. */
  | { kind: 'ALLOWANCE'; records: number; periodDays: number; tier?: OfficeTier }

export interface PriceBookRow {
  audience: Audience
  sku: Sku
  cents: number
  currency: 'usd'
  /** Name of the env var holding the Stripe Price id for this row (set by the persistence slice). */
  stripePriceEnv?: string
  /** ISO date or date-time; the row is in effect from this instant (inclusive). */
  effectiveFrom: IsoDateTime
  /** Exclusive end; absent = open-ended. */
  effectiveTo?: IsoDateTime
  label: string
  /** false = never sold through checkout (quotes, pure terms rows). Defaults to true. */
  purchasable?: boolean
  terms?: RowTerms
}

export interface PriceBook {
  rows: readonly PriceBookRow[]
}

const PRO_FROM = '2026-01-01'
const FAMILY_FROM = '2025-01-01'

const usd = (
  audience: Audience,
  sku: Sku,
  cents: number,
  label: string,
  extra: Partial<Omit<PriceBookRow, 'audience' | 'sku' | 'cents' | 'label'>> = {},
): PriceBookRow => ({
  audience,
  sku,
  cents,
  currency: 'usd',
  effectiveFrom: audience === 'FAMILY' ? FAMILY_FROM : PRO_FROM,
  label,
  ...extra,
})

const rerun = (audience: Audience) => usd(audience, 'RERUN', 9900, 'Re-run with new documents')
const officePlans = (audience: Audience): PriceBookRow[] => [
  usd(audience, 'OFFICE_50', 900000, 'Office 50 — 50 records a year, unlimited users, ACH invoice', { terms: { kind: 'ALLOWANCE', records: 50, periodDays: 365, tier: 50 } }),
  usd(audience, 'OFFICE_120', 1800000, 'Office 120 — 120 records a year, unlimited users, ACH invoice', { terms: { kind: 'ALLOWANCE', records: 120, periodDays: 365, tier: 120 } }),
  usd(audience, 'OFFICE_250', 3000000, 'Office 250 — 250 records a year, unlimited users, ACH invoice', { terms: { kind: 'ALLOWANCE', records: 250, periodDays: 365, tier: 250 } }),
]

/** Five-record pack total = 5 × rung × 90%: 67050 / 112050 / 157050. */
const pack = (sku: Sku, rung: Rung, cents: number, label: string): PriceBookRow =>
  usd('ATTORNEY', sku, cents, label, { terms: { kind: 'PACK', rung, records: 5, discountPercent: 10, expiryMonths: 12 }, stripePriceEnv: `STRIPE_PRICE_${sku}` })

/** Default monthly cap on free first reviews; the promo engine's `maxRedemptionsPerMonth` overrides it. */
export const FIRST_REVIEW_FREE_MONTH_CAP = 10

export const DEFAULT_PRICE_BOOK: PriceBook = Object.freeze({
  rows: Object.freeze([
    // Families — unchanged (plan §4: "$299 (open: $349)"; the $349 alternative is not a row until decided).
    usd('FAMILY', 'REVIEW', 29900, 'Family Case Review — up to 5,000 pages'),
    usd('FAMILY', 'OVERAGE', 4900, 'Additional pages (+2,500)'),
    rerun('FAMILY'),

    // Attorneys — the counsel ladder by reporter's-record length.
    usd('ATTORNEY', 'COUNSEL_SHORT', 14900, 'Counsel Review Short (<100 pages)', { stripePriceEnv: 'STRIPE_PRICE_COUNSEL_SHORT' }),
    usd('ATTORNEY', 'COUNSEL_STANDARD', 24900, 'Counsel Review Standard (100–500 pages)', { stripePriceEnv: 'STRIPE_PRICE_COUNSEL_STANDARD' }),
    usd('ATTORNEY', 'COUNSEL_EXTENDED', 34900, 'Counsel Review Extended (501–1,500 pages)', { stripePriceEnv: 'STRIPE_PRICE_COUNSEL_EXTENDED' }),
    usd('ATTORNEY', 'COUNSEL_LONG', 49900, 'Long record (>1,500 pages) — quote from $499', { purchasable: false, terms: { kind: 'QUOTE_FROM' } }),
    rerun('ATTORNEY'),
    pack('PACK_SHORT', 'SHORT', 67050, 'Five-record pack, Short rung (10% off, 12 months)'),
    pack('PACK_STANDARD', 'STANDARD', 112050, 'Five-record pack, Standard rung (10% off, 12 months)'),
    pack('PACK_EXTENDED', 'EXTENDED', 157050, 'Five-record pack, Extended rung (10% off, 12 months)'),
    usd('ATTORNEY', 'FIRST_REVIEW_FREE', 0, 'First review free (≤500 pages, verified bar number, monthly cap)', {
      purchasable: false,
      terms: { kind: 'FREE_FIRST', maxPages: 500, requiresBarVerification: true, monthCap: FIRST_REVIEW_FREE_MONTH_CAP },
    }),
    usd('ATTORNEY', 'PARTNER_CODE', 0, 'Bar-partner code — 15% off the first paid review', {
      purchasable: false,
      terms: { kind: 'PARTNER_CODE', discountPercent: 15, firstPaidOnly: true },
    }),

    // Public defender offices — annual allowances by quote, and the free pilot.
    ...officePlans('OFFICE'),
    usd('OFFICE', 'PD_PILOT', 0, 'PD pilot — 15 records, 90 days, free', { purchasable: false, terms: { kind: 'ALLOWANCE', records: 15, periodDays: 90 } }),
    rerun('OFFICE'),

    // Clinics — 25 records a year at $0, then Office rates.
    usd('CLINIC', 'PUBLIC_INTEREST', 0, 'Public-interest — 25 records a year at $0', { purchasable: false, terms: { kind: 'ALLOWANCE', records: 25, periodDays: 365 } }),
    ...officePlans('CLINIC'),
    rerun('CLINIC'),
  ]),
})

export interface ResolvePriceQuery {
  audience: Audience
  sku: Sku
  at: IsoDateTime
}

/**
 * The row in effect for an audience and SKU at `at` (effectiveFrom ≤ at <
 * effectiveTo). When several rows overlap, the one with the latest
 * effectiveFrom wins, so a dated replacement row supersedes its predecessor
 * without editing it. Returns null when nothing is in effect.
 */
export function resolvePrice(book: PriceBook, { audience, sku, at }: ResolvePriceQuery): PriceBookRow | null {
  const t = toMillis(at)
  let best: PriceBookRow | null = null
  for (const row of book.rows) {
    if (row.audience !== audience || row.sku !== sku) continue
    const from = toMillis(row.effectiveFrom)
    if (from > t) continue
    if (row.effectiveTo !== undefined && toMillis(row.effectiveTo) <= t) continue
    if (best === null || from > toMillis(best.effectiveFrom)) best = row
  }
  return best
}

/** Bucket → counsel SKU. Families are not on the ladder (see `priceForBucket`). */
export const COUNSEL_SKU_FOR_BUCKET: Readonly<Record<RecordBucket, Sku>> = Object.freeze({
  SHORT: 'COUNSEL_SHORT',
  STANDARD: 'COUNSEL_STANDARD',
  EXTENDED: 'COUNSEL_EXTENDED',
  LONG: 'COUNSEL_LONG',
})

export const LONG_RECORD_QUOTE_FROM_CENTS = 49900

export type BucketPrice =
  | { kind: 'PRICE'; audience: Audience; sku: Sku; rung: RecordBucket; cents: number; row: PriceBookRow }
  /** Long records are not sold to professionals until the volume split ships: a quote request, from this floor. */
  | { kind: 'QUOTE_REQUIRED'; from: number; sku: Sku }
  /** The book has no per-record row for this audience (offices and clinics are allowance-funded). */
  | { kind: 'NO_PRICE'; audience: Audience; sku: Sku }

/**
 * Maps a bucket to its rung price. FAMILY always resolves to the flat
 * REVIEW row (the bucket is informational; the overage rule is separate).
 * Every professional audience gets the counsel ladder and the LONG refusal:
 * a LONG record is `QUOTE_REQUIRED` with `from` = the COUNSEL_LONG floor in
 * the book (49900 by default) even when no COUNSEL_LONG row is in effect.
 */
export function priceForBucket(book: PriceBook, bucket: RecordBucket, audience: Audience, at: IsoDateTime): BucketPrice {
  if (audience === 'FAMILY') {
    const row = resolvePrice(book, { audience, sku: 'REVIEW', at })
    return row ? { kind: 'PRICE', audience, sku: 'REVIEW', rung: bucket, cents: row.cents, row } : { kind: 'NO_PRICE', audience, sku: 'REVIEW' }
  }
  const sku = COUNSEL_SKU_FOR_BUCKET[bucket]
  if (bucket === 'LONG') {
    const floor = resolvePrice(book, { audience, sku, at }) ?? resolvePrice(book, { audience: 'ATTORNEY', sku, at })
    return { kind: 'QUOTE_REQUIRED', from: floor?.cents ?? LONG_RECORD_QUOTE_FROM_CENTS, sku }
  }
  const row = resolvePrice(book, { audience, sku, at })
  if (!row || row.purchasable === false) return { kind: 'NO_PRICE', audience, sku }
  return { kind: 'PRICE', audience, sku, rung: bucket, cents: row.cents, row }
}
