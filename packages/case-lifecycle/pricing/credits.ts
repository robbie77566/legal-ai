/**
 * Prepaid five-record packs (plan §4): five credits of one rung, 10% off
 * five rung prices, valid twelve months. Credits are plain records the
 * persistence slice stores as `Credit` rows; consumption returns a new
 * array (nothing is mutated) so the caller can persist the diff.
 */
import { RUNGS, type Rung } from './buckets'
import { DEFAULT_PRICE_BOOK, resolvePrice, type PriceBook } from './price-book'
import { addMonthsUtc, toMillis, type IsoDateTime } from './time'

export const PACK_RECORDS = 5
export const PACK_DISCOUNT_PERCENT = 10
export const PACK_EXPIRY_MONTHS = 12

export interface Credit {
  id: string
  rung: Rung
  issuedAt: IsoDateTime
  expiresAt: IsoDateTime
  /** null while unspent. */
  consumedAt: IsoDateTime | null
  packId: string | null
}

export interface IssuePackInput {
  rung: Rung
  purchasedAt: IsoDateTime
  /** Stable id for the pack; credit ids are `${packId}-1..5`. Defaults to a deterministic name from rung and date. */
  packId?: string
  /** Book to price the rung from; defaults to DEFAULT_PRICE_BOOK. */
  book?: PriceBook
}

export interface IssuedPack {
  packId: string
  rung: Rung
  records: number
  credits: Credit[]
  /** Five rung prices before the discount. */
  listCents: number
  discountPercent: number
  discountCents: number
  /** What the attorney pays. */
  totalCents: number
  issuedAt: IsoDateTime
  expiresAt: IsoDateTime
}

const RUNG_SKU = { SHORT: 'COUNSEL_SHORT', STANDARD: 'COUNSEL_STANDARD', EXTENDED: 'COUNSEL_EXTENDED' } as const

export function issuePackCredits({ rung, purchasedAt, packId, book = DEFAULT_PRICE_BOOK }: IssuePackInput): IssuedPack {
  if (!RUNGS.includes(rung)) throw new RangeError(`pricing: a pack cannot be issued for rung ${String(rung)}`)
  const row = resolvePrice(book, { audience: 'ATTORNEY', sku: RUNG_SKU[rung], at: purchasedAt })
  if (!row) throw new RangeError(`pricing: no ${rung} rung price in effect at ${purchasedAt}`)
  const listCents = row.cents * PACK_RECORDS
  const discountCents = Math.round((listCents * PACK_DISCOUNT_PERCENT) / 100)
  const issuedAt = new Date(toMillis(purchasedAt)).toISOString()
  const expiresAt = addMonthsUtc(issuedAt, PACK_EXPIRY_MONTHS)
  const id = packId ?? `pack-${rung.toLowerCase()}-${issuedAt}`
  const credits: Credit[] = Array.from({ length: PACK_RECORDS }, (_, i) => ({
    id: `${id}-${i + 1}`,
    rung,
    issuedAt,
    expiresAt,
    consumedAt: null,
    packId: id,
  }))
  return {
    packId: id,
    rung,
    records: PACK_RECORDS,
    credits,
    listCents,
    discountPercent: PACK_DISCOUNT_PERCENT,
    discountCents,
    totalCents: listCents - discountCents,
    issuedAt,
    expiresAt,
  }
}

export type CreditRefusalReason =
  /** No unspent credit at all — the sixth record on a five-pack. */
  | 'PACK_EXHAUSTED'
  /** Unspent credits exist but every one has expired at `at`. */
  | 'EXPIRED'
  /** Live credits exist but none is issued yet at `at`. */
  | 'NOT_YET_VALID'
  /** Live credits exist but all are of a lower rung than the record. */
  | 'RUNG_TOO_LOW'

export type ConsumeCreditResult =
  | { ok: true; credit: Credit; credits: Credit[] }
  | { ok: false; reason: CreditRefusalReason }

const RUNG_RANK: Record<Rung, number> = { SHORT: 0, STANDARD: 1, EXTENDED: 2 }

/**
 * Spends one credit for a record of `rung` at `at`.
 *
 * Rung-matching rule: a credit covers a record of its own rung or any lower
 * rung (a STANDARD credit may pay for a SHORT record), never a higher one.
 * Among the candidates the exact rung is preferred, then the next rung up,
 * so a bigger credit is not burnt while a matching one exists; within a
 * rung the soonest-expiring credit goes first, then the earliest issued,
 * then id order for determinism. A credit is live when
 * issuedAt ≤ at < expiresAt — at the expiry instant it is already expired.
 */
export function consumeCredit(credits: readonly Credit[], { rung, at }: { rung: Rung; at: IsoDateTime }): ConsumeCreditResult {
  const t = toMillis(at)
  const unspent = credits.filter((c) => c.consumedAt === null)
  if (unspent.length === 0) return { ok: false, reason: 'PACK_EXHAUSTED' }
  const unexpired = unspent.filter((c) => toMillis(c.expiresAt) > t)
  if (unexpired.length === 0) return { ok: false, reason: 'EXPIRED' }
  const live = unexpired.filter((c) => toMillis(c.issuedAt) <= t)
  if (live.length === 0) return { ok: false, reason: 'NOT_YET_VALID' }
  const need = RUNG_RANK[rung]
  const covering = live.filter((c) => RUNG_RANK[c.rung] >= need)
  if (covering.length === 0) return { ok: false, reason: 'RUNG_TOO_LOW' }
  covering.sort(
    (a, b) =>
      RUNG_RANK[a.rung] - RUNG_RANK[b.rung] ||
      toMillis(a.expiresAt) - toMillis(b.expiresAt) ||
      toMillis(a.issuedAt) - toMillis(b.issuedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const chosen = covering[0]!
  const consumed: Credit = { ...chosen, consumedAt: new Date(t).toISOString() }
  return { ok: true, credit: consumed, credits: credits.map((c) => (c === chosen ? consumed : c)) }
}
