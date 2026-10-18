/**
 * Annual and pilot allowances (plan §4): a plain ledger decremented once
 * per record at analysis start. The persistence slice stores the ledger as
 * `AllowanceLedger` rows; `decrementAllowance` returns a new ledger, never
 * mutates, and refuses with a typed reason at zero or outside the period.
 */
import type { OfficeTier } from './price-book'
import { addDaysUtc, addMonthsUtc, toMillis, type IsoDateTime } from './time'

export type AllowanceKind = 'PILOT' | 'PUBLIC_INTEREST' | 'OFFICE'

export interface AllowanceLedger {
  kind: AllowanceKind
  granted: number
  used: number
  /** Inclusive start of the period. */
  startsAt: IsoDateTime
  /** Exclusive end of the period; the pilot's end date, or the anniversary for annual plans. */
  resetsAt: IsoDateTime
  /** true for annual plans (`renewAllowance` yields the next period); a pilot ends instead. */
  renews: boolean
  tier?: OfficeTier
}

export const PILOT_RECORDS = 15
export const PILOT_DAYS = 90
export const PUBLIC_INTEREST_RECORDS_PER_YEAR = 25
export const OFFICE_TIERS: readonly OfficeTier[] = [50, 120, 250]

const iso = (at: IsoDateTime) => new Date(toMillis(at)).toISOString()

/** PD pilot: 15 records, free, for 90 days from `startedAt`. */
export function pilotAllowance(startedAt: IsoDateTime): AllowanceLedger {
  const startsAt = iso(startedAt)
  return { kind: 'PILOT', granted: PILOT_RECORDS, used: 0, startsAt, resetsAt: addDaysUtc(startsAt, PILOT_DAYS), renews: false }
}

/** Public-interest: 25 records a year at $0 from `yearStart`. */
export function publicInterestAllowance(yearStart: IsoDateTime): AllowanceLedger {
  const startsAt = iso(yearStart)
  return { kind: 'PUBLIC_INTEREST', granted: PUBLIC_INTEREST_RECORDS_PER_YEAR, used: 0, startsAt, resetsAt: addMonthsUtc(startsAt, 12), renews: true }
}

/** Office 50 / 120 / 250: that many records a year from `yearStart`. */
export function officeAllowance(tier: OfficeTier, yearStart: IsoDateTime): AllowanceLedger {
  if (!OFFICE_TIERS.includes(tier)) throw new RangeError(`pricing: unknown Office tier ${String(tier)}`)
  const startsAt = iso(yearStart)
  return { kind: 'OFFICE', tier, granted: tier, used: 0, startsAt, resetsAt: addMonthsUtc(startsAt, 12), renews: true }
}

export type AllowanceRefusalReason =
  /** `at` is before the period starts. */
  | 'NOT_STARTED'
  /** `at` is on or after `resetsAt`: the pilot has ended, or the annual plan needs `renewAllowance`. */
  | 'PERIOD_ENDED'
  /** Every granted record has been used. */
  | 'EXHAUSTED'

export type DecrementAllowanceResult =
  | { ok: true; ledger: AllowanceLedger; remaining: number }
  | { ok: false; reason: AllowanceRefusalReason; remaining: number }

export function allowanceRemaining(ledger: AllowanceLedger): number {
  return Math.max(0, ledger.granted - ledger.used)
}

/** Spends one record of the allowance at `at`, or refuses. Period checks come before the count. */
export function decrementAllowance(ledger: AllowanceLedger, at: IsoDateTime): DecrementAllowanceResult {
  const t = toMillis(at)
  const remaining = allowanceRemaining(ledger)
  if (t < toMillis(ledger.startsAt)) return { ok: false, reason: 'NOT_STARTED', remaining }
  if (t >= toMillis(ledger.resetsAt)) return { ok: false, reason: 'PERIOD_ENDED', remaining }
  if (remaining <= 0) return { ok: false, reason: 'EXHAUSTED', remaining: 0 }
  return { ok: true, ledger: { ...ledger, used: ledger.used + 1 }, remaining: remaining - 1 }
}

/**
 * The next period's ledger for a renewing plan (same grant, used reset to
 * zero, starting at the old `resetsAt`). null for a pilot: it converts to
 * an Office plan by hand, it never rolls over.
 */
export function renewAllowance(ledger: AllowanceLedger): AllowanceLedger | null {
  if (!ledger.renews) return null
  const startsAt = ledger.resetsAt
  return { ...ledger, used: 0, startsAt, resetsAt: addMonthsUtc(startsAt, 12) }
}
