/**
 * TRAP 4.1(a) computation of time, as recalled (confidence: proposed until
 * counsel signs the vector table that exercises it):
 *
 *   "The day of an act, event, or default after which a designated period
 *   begins to run is not included when computing a period prescribed or
 *   allowed by these rules, by court order, or by statute. The last day of
 *   the period is included, but if that day is a Saturday, Sunday, or legal
 *   holiday, the period extends to the end of the next day that is not a
 *   Saturday, Sunday, or legal holiday."
 *
 * Pure civil-date math on YYYY-MM-DD strings (deadlines.ts conventions): no
 * timestamps, no timezone conversion, no clocks.
 *
 * LIMITATIONS (documented, deliberate):
 *  - "Legal holiday" is taken from Tex. Gov't Code §662.003 (national and
 *    state holidays) for 2026–2027 only. Outside that range only weekends
 *    roll, and the clock attaches a warning note.
 *  - Texas does not move a state holiday that falls on a weekend, and the
 *    table does not add federal "observed" days (e.g. Friday 2026-07-03). A
 *    court may nevertheless be closed that day; TRAP 4.1(b) (clerk's office
 *    closed or inaccessible) and county closure orders — which Texas courts
 *    have treated as legal holidays for the parallel civil rule (Miller
 *    Brewing Co. v. Villarreal) — are NOT modelled. Counsel verifies the
 *    court's own calendar before relying on a rolled date.
 *  - Art. 11.07 and TRAP 73 periods are counted the same way; whether a
 *    court treats them as TRAP 4.1 periods is for counsel to confirm.
 *
 * This table is intentionally separate from calendar.ts (the SLA business-
 * day calendar): that one answers "when will the report be ready" and may
 * add company closures; this one answers "what day does the rule say" and
 * is the artifact counsel signs.
 */
import { addDays, type CivilDate } from '../deadlines';

export const HOLIDAY_TABLE_COVERAGE = { from: '2026-01-01', to: '2027-12-31' } as const;

export const HOLIDAY_TABLE_CONFIDENCE: 'signed' | 'proposed' = 'proposed';

/** Tex. Gov't Code §662.003 holidays, 2026–2027. Weekend-dated entries are kept for completeness. */
export const TEXAS_LEGAL_HOLIDAYS: Readonly<Record<string, string>> = {
  // 2026
  '2026-01-01': "New Year's Day",
  '2026-01-19': "Martin Luther King, Jr. Day / Confederate Heroes Day",
  '2026-02-16': "Presidents' Day",
  '2026-03-02': 'Texas Independence Day',
  '2026-04-21': 'San Jacinto Day',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Emancipation Day (Juneteenth)',
  '2026-07-04': 'Independence Day (Saturday)',
  '2026-08-27': 'Lyndon Baines Johnson Day',
  '2026-09-07': 'Labor Day',
  '2026-11-11': 'Veterans Day',
  '2026-11-26': 'Thanksgiving Day',
  '2026-11-27': 'Day after Thanksgiving',
  '2026-12-24': 'Christmas Eve',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Day after Christmas (Saturday)',
  // 2027
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'Martin Luther King, Jr. Day',
  '2027-01-19': 'Confederate Heroes Day',
  '2027-02-15': "Presidents' Day",
  '2027-03-02': 'Texas Independence Day',
  '2027-04-21': 'San Jacinto Day',
  '2027-05-31': 'Memorial Day',
  '2027-06-19': 'Emancipation Day (Juneteenth) (Saturday)',
  '2027-07-04': 'Independence Day (Sunday)',
  '2027-08-27': 'Lyndon Baines Johnson Day',
  '2027-09-06': 'Labor Day',
  '2027-11-11': 'Veterans Day',
  '2027-11-25': 'Thanksgiving Day',
  '2027-11-26': 'Day after Thanksgiving',
  '2027-12-24': 'Christmas Eve',
  '2027-12-25': 'Christmas Day (Saturday)',
  '2027-12-26': 'Day after Christmas (Sunday)',
};

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function dayOfWeek(d: CivilDate): (typeof DOW)[number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`not a civil date: ${d}`);
  return DOW[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay()];
}

export function isWeekend(d: CivilDate): boolean {
  const w = dayOfWeek(d);
  return w === 'Saturday' || w === 'Sunday';
}

export function isLegalHoliday(d: CivilDate): boolean {
  return Object.prototype.hasOwnProperty.call(TEXAS_LEGAL_HOLIDAYS, d);
}

export function holidayTableCovers(d: CivilDate): boolean {
  return d >= HOLIDAY_TABLE_COVERAGE.from && d <= HOLIDAY_TABLE_COVERAGE.to;
}

export interface RolledDate {
  date: CivilDate;
  rolled: boolean;
  /** What the raw last day fell on (the first obstacle met). */
  reason?: string;
}

/** TRAP 4.1(a): extend to the next day that is not a Saturday, Sunday or legal holiday. */
export function rollForward(d: CivilDate): RolledDate {
  let date = d;
  let reason: string | undefined;
  for (let guard = 0; guard < 14; guard++) {
    const w = dayOfWeek(date);
    const obstacle = w === 'Saturday' || w === 'Sunday' ? w : isLegalHoliday(date) ? `legal holiday: ${TEXAS_LEGAL_HOLIDAYS[date]}` : null;
    if (!obstacle) break;
    reason ??= obstacle;
    date = addDays(date, 1);
  }
  return reason ? { date, rolled: true, reason } : { date, rolled: false };
}

export interface DueDate {
  /** Trigger + days, before any roll. */
  rawDue: CivilDate;
  /** After TRAP 4.1(a). */
  due: CivilDate;
  rolled: boolean;
  rollReason?: string;
  /** False when rawDue is outside the holiday table — the caller warns. */
  holidaysKnown: boolean;
}

/**
 * Count `days` calendar days from the trigger (the trigger day itself is
 * excluded, which `addDays` already does — trigger + 1 is day one) and
 * roll the last day forward under TRAP 4.1(a).
 */
export function computeDue(trigger: CivilDate, days: number): DueDate {
  const rawDue = addDays(trigger, days);
  const r = rollForward(rawDue);
  return { rawDue, due: r.date, rolled: r.rolled, rollReason: r.reason, holidaysKnown: holidayTableCovers(rawDue) };
}
