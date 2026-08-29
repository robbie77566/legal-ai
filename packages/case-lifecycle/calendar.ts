/**
 * Business-day calendar (ENG-9): ONE calendar backs both the SLA promise and
 * the FR-5 deadline engine — two calendars would eventually disagree in
 * public. America/Chicago civil dates; US federal + Texas state holidays.
 *
 * Legal dates are civil DATE values (YYYY-MM-DD) — never derived by
 * timezone-converting a timestamp at render (§11a.4).
 */

export const LAUNCH_SLA_BUSINESS_DAYS = 10 // PO decision, Aug 2026 (PRD §10.1 resolved)

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

/** The customer's expected-ready civil date from an SLA-start timestamp. */
export function expectedReadyDate(slaStartedAt: Date, n = LAUNCH_SLA_BUSINESS_DAYS): string {
  // America/Chicago civil date of the start moment
  const civil = slaStartedAt.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return addBusinessDays(civil, n)
}
