/**
 * Record buckets (persona rollout plan §4). The bucket is set from the
 * reporter's-record page count alone; the clerk's record and exhibits are
 * metered (returned) but never move the bucket. Families are not bucketed
 * for price — they pay the flat review price and today's overage rule, which
 * `familyOverage` reproduces as a pure function so later code has one place.
 */

export const RECORD_BUCKETS = ['SHORT', 'STANDARD', 'EXTENDED', 'LONG'] as const
export type RecordBucket = (typeof RECORD_BUCKETS)[number]

/** A rung that can be bought outright (LONG is quote-only). */
export type Rung = Exclude<RecordBucket, 'LONG'>
export const RUNGS: readonly Rung[] = ['SHORT', 'STANDARD', 'EXTENDED']

export interface BucketBoundary {
  min: number
  /** null = open-ended */
  max: number | null
}

/** Inclusive reporter-page ranges: SHORT < 100, STANDARD 100–500, EXTENDED 501–1,500, LONG > 1,500. */
export const BUCKET_BOUNDARIES: Readonly<Record<RecordBucket, BucketBoundary>> = Object.freeze({
  SHORT: { min: 0, max: 99 },
  STANDARD: { min: 100, max: 500 },
  EXTENDED: { min: 501, max: 1500 },
  LONG: { min: 1501, max: null },
})

export interface RecordPages {
  /** Reporter's-record pages — the only count that sets the bucket. */
  reporterPages: number
  clerkPages?: number
  exhibitPages?: number
}

export interface MeteredPages {
  reporter: number
  clerk: number
  exhibit: number
  total: number
}

export interface RecordClassification {
  bucket: RecordBucket
  meteredPages: MeteredPages
  boundaries: Readonly<Record<RecordBucket, BucketBoundary>>
}

function pageCount(label: string, n: number | undefined): number {
  const v = n ?? 0
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`pricing: ${label} must be a non-negative integer, got ${String(n)}`)
  return v
}

export function bucketForReporterPages(reporterPages: number): RecordBucket {
  const pages = pageCount('reporterPages', reporterPages)
  for (const bucket of RECORD_BUCKETS) {
    const b = BUCKET_BOUNDARIES[bucket]
    if (pages >= b.min && (b.max === null || pages <= b.max)) return bucket
  }
  return 'LONG' // unreachable: the table covers every non-negative integer
}

export function classifyRecord(pages: RecordPages): RecordClassification {
  const reporter = pageCount('reporterPages', pages.reporterPages)
  const clerk = pageCount('clerkPages', pages.clerkPages)
  const exhibit = pageCount('exhibitPages', pages.exhibitPages)
  return {
    bucket: bucketForReporterPages(reporter),
    meteredPages: { reporter, clerk, exhibit, total: reporter + clerk + exhibit },
    boundaries: BUCKET_BOUNDARIES,
  }
}

/** Today's family terms: 5,000 pages included, then $49 per 2,500-page block. */
export const FAMILY_INCLUDED_PAGES = 5000
export const FAMILY_OVERAGE_BLOCK_PAGES = 2500
export const FAMILY_OVERAGE_BLOCK_CENTS = 4900

export interface FamilyOverage {
  meteredPages: number
  includedPages: number
  blockPages: number
  blockCents: number
  purchasedBlocks: number
  /** Pages covered so far: included + purchased blocks. */
  allowance: number
  /** Blocks still to buy before the record can be marked complete. */
  blocksNeeded: number
  cents: number
}

/**
 * The family overage rule as it runs today in the intake overage gate (ENG-3):
 * a partial block is never charged for pages not received — crossing page
 * 5,001 starts one block. `meteredPages` is the deduplicated billable total
 * across every document (families are not split by record kind). This is
 * NOT wired into the family path; the api keeps its own gate until the
 * persistence slice adopts it.
 */
export function familyOverage(meteredPages: number, purchasedBlocks = 0): FamilyOverage {
  const pages = pageCount('meteredPages', meteredPages)
  const bought = pageCount('purchasedBlocks', purchasedBlocks)
  const allowance = FAMILY_INCLUDED_PAGES + bought * FAMILY_OVERAGE_BLOCK_PAGES
  const blocksNeeded = pages > allowance ? Math.ceil((pages - allowance) / FAMILY_OVERAGE_BLOCK_PAGES) : 0
  return {
    meteredPages: pages,
    includedPages: FAMILY_INCLUDED_PAGES,
    blockPages: FAMILY_OVERAGE_BLOCK_PAGES,
    blockCents: FAMILY_OVERAGE_BLOCK_CENTS,
    purchasedBlocks: bought,
    allowance,
    blocksNeeded,
    cents: blocksNeeded * FAMILY_OVERAGE_BLOCK_CENTS,
  }
}
