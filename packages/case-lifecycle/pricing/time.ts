/**
 * UTC date arithmetic for the pricing rules. Everything here is pure and
 * works on ISO-8601 strings so the records stay plain and serialisable.
 */

export type IsoDateTime = string

export function toMillis(iso: IsoDateTime): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new RangeError(`pricing: not an ISO date: ${iso}`)
  return ms
}

/** Calendar months later, day-of-month clamped to the target month's length (Jan 31 + 1 → Feb 28/29). */
export function addMonthsUtc(iso: IsoDateTime, months: number): IsoDateTime {
  const d = new Date(toMillis(iso))
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d.toISOString()
}

export function addDaysUtc(iso: IsoDateTime, days: number): IsoDateTime {
  return new Date(toMillis(iso) + days * 86_400_000).toISOString()
}
