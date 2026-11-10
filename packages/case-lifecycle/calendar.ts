/**
 * Business-day calendar (ENG-9): ONE calendar backs the FR-5 deadline engine
 * and the staff Record Desk SLA — two calendars would eventually disagree in
 * public. The family turnaround promise is clock time (LAUNCH_SLA_HOURS). America/Chicago civil dates; US federal + Texas state holidays.
 *
 * Legal dates are civil DATE values (YYYY-MM-DD) — never derived by
 * timezone-converting a timestamp at render (§11a.4).
 */

/**
 * The family turnaround promise (founder decision 2026-11-10, replacing the
 * 10-business-day launch SLA): the report is expected two hours after the
 * family marks their records complete, clock time, every day. The promise
 * holds only while delivery is automatic (AUTO_APPROVE=1, runbook).
 */
export const LAUNCH_SLA_HOURS = 2

/** The staff SLA for Record Desk requests (persona_rollout_plan.md §5 G), in business days. */
export const RECORD_DESK_SLA_BUSINESS_DAYS = 10

// Fixed-date holidays observed (shifted to Monday/Friday when on a weekend)
// plus floating federal holidays, 2026–2028. Extend annually; the FR-5
// engine's counsel-signed vectors will pin these (M4 remainder).
const HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-11-11', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-11', '2027-11-25', '2027-12-24',
  // 2028
  '2028-01-01', '2028-01-17', '2028-02-21', '2028-05-29', '2028-06-19',
  '2028-07-04', '2028-09-04', '2028-11-10', '2028-11-23', '2028-12-25',
  // Texas state (Confederate Heroes' Day excluded by choice; TX Independence,
  // San Jacinto, Emancipation/Juneteenth already above, LBJ Day skeleton):
  '2026-03-02', '2026-04-21', '2027-03-02', '2027-04-21', '2028-03-02', '2028-04-21',
])

const DAY_MS = 86_400_000

const toCivil = (d: Date): string => d.toISOString().slice(0, 10)

export function isBusinessDay(civilDate: string): boolean {
  const d = new Date(`${civilDate}T00:00:00Z`)
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !HOLIDAYS.has(civilDate)
}

/** Add N business days to a civil date (exclusive of the start date). */
export function addBusinessDays(civilStart: string, days: number): string {
  let d = new Date(`${civilStart}T00:00:00Z`)
  let remaining = days
  while (remaining > 0) {
    d = new Date(d.getTime() + DAY_MS)
    if (isBusinessDay(toCivil(d))) remaining--
  }
  return toCivil(d)
}

/** The customer's expected-ready moment from an SLA-start timestamp: start plus the promised hours. */
export function expectedReadyAt(slaStartedAt: Date, hours = LAUNCH_SLA_HOURS): Date {
  return new Date(slaStartedAt.getTime() + hours * 3_600_000)
}

/**
 * The expected-ready moment in the family's words, Central time (the only
 * zone the product speaks): "3:45 PM Central today", or with the date when
 * it is not today. Shared by the API (emails) and the web (status, case
 * home, account) so the two never disagree.
 */
export function formatReadyBy(value: Date | string, now: Date = new Date()): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  // A civil DATE stored at 00:00Z (a staff-set delay date) has no time of day.
  if (d.toISOString().endsWith('T00:00:00.000Z')) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  }
  const tz = 'America/Chicago'
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const sameDay = d.toLocaleDateString('en-CA', { timeZone: tz }) === now.toLocaleDateString('en-CA', { timeZone: tz })
  if (sameDay) return `${time} Central today`
  const day = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: tz })
  return `${time} Central on ${day}`
}

/**
 * Business days elapsed from one civil date to another (exclusive of the
 * start, inclusive of the end); 0 when `civilEnd` is not after `civilStart`.
 * The staff SLA for Record Desk requests (persona_rollout_plan.md §5 G) is
 * counted on this calendar.
 */
export function businessDaysBetween(civilStart: string, civilEnd: string): number {
  let d = new Date(`${civilStart}T00:00:00Z`)
  const end = new Date(`${civilEnd}T00:00:00Z`)
  let n = 0
  while (d.getTime() < end.getTime()) {
    d = new Date(d.getTime() + DAY_MS)
    if (isBusinessDay(toCivil(d))) n++
  }
  return n
}
