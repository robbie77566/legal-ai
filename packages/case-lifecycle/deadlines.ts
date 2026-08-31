/**
 * FR-5 deadline engine — launch-blocking precision, counsel-reviewed
 * vectors in tests/deadline-vectors.
 *
 * Pure civil-date math (YYYY-MM-DD strings, America/Chicago semantics):
 * a legal date is NEVER derived by timezone-converting a timestamp
 * (system design §"Legal deadline computation"). No I/O, no clocks —
 * `asOf` is an input, so every posture is replayable and testable.
 *
 * Encoded rules (PRD FR-5):
 *  - Finality (AEDPA §2244(d)(1)(A)): conclusion of direct review or
 *    expiration of time to seek it —
 *      · no appeal: judgment + 30 days (TRAP 26.2(a)(1) notice window),
 *        or + 90 when a motion for new trial was filed;
 *      · appeal, no PDR: court-of-appeals judgment + 30 (TRAP 68.2(a));
 *      · PDR disposed: + 90 days (certiorari window — included per FR-5);
 *      · certiorari petition filed: the denial/disposition date controls.
 *  - AEDPA 1-year: counts days elapsed BEFORE a properly filed state writ,
 *    is TOLLED while that writ is pending, and is NOT tolled after the CCA
 *    disposes of it (the classic fatal miscalculation: filing state habeas
 *    at month 11 and assuming a fresh year afterward).
 *  - Art. 11.07 has no statutory deadline, but laches can bar stale
 *    applications (Ex parte Perez) — old convictions carry an urgency
 *    note, never "unlimited time".
 *
 * Everything here is an ESTIMATE for attorney verification: outputs carry
 * `basis` strings and the report must render the FR-5 disclaimer.
 */

export type CivilDate = string; // YYYY-MM-DD

const MS_DAY = 86_400_000;
const AEDPA_DAYS = 365;
const LACHES_URGENCY_YEARS = 5;

function toUtcNoon(d: CivilDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`not a civil date: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function addDays(d: CivilDate, days: number): CivilDate {
  return new Date(toUtcNoon(d) + days * MS_DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: CivilDate, b: CivilDate): number {
  return Math.round((toUtcNoon(b) - toUtcNoon(a)) / MS_DAY);
}

export interface StateWritPeriod {
  filedDate: CivilDate;
  /** CCA disposition (denial/dismissal); undefined = still pending. */
  disposedDate?: CivilDate;
}

export interface DeadlineInputs {
  /** Sentencing / judgment date (oral pronouncement date). */
  judgmentDate: CivilDate;
  motionForNewTrialFiled?: boolean;
  /** Court of appeals judgment date, when a direct appeal was taken. */
  coaJudgmentDate?: CivilDate;
  /** PDR disposition (refused/denied/dismissed) date, when one was filed. */
  pdrDisposedDate?: CivilDate;
  /** Certiorari disposition date, when a petition was filed. */
  certDisposedDate?: CivilDate;
  /** Properly filed Art. 11.07 (or equivalent) applications, in order. */
  stateWrits?: StateWritPeriod[];
  asOf: CivilDate;
}

export interface DeadlinePosture {
  finalityDate: CivilDate;
  finalityBasis: string;
  aedpa: {
    daysElapsed: number;
    daysTolled: number;
    daysRemaining: number; // clamped at 0
    expired: boolean;
    /** Estimated expiry, only meaningful while nothing is pending. */
    estimatedExpiryDate: CivilDate | null;
    tollingNow: boolean;
    copyKey: 'aedpa.running' | 'aedpa.tolled' | 'aedpa.expired';
  };
  lachesUrgency: boolean;
  asOf: CivilDate;
  disclaimerKey: 'deadline.verify_with_attorney';
}

export function computeFinality(i: DeadlineInputs): { date: CivilDate; basis: string } {
  if (i.certDisposedDate) {
    return { date: i.certDisposedDate, basis: 'Certiorari disposition date (petition was filed).' };
  }
  if (i.pdrDisposedDate) {
    return {
      date: addDays(i.pdrDisposedDate, 90),
      basis: 'PDR disposition + 90-day certiorari window (Sup. Ct. R. 13).',
    };
  }
  if (i.coaJudgmentDate) {
    return {
      date: addDays(i.coaJudgmentDate, 30),
      basis: 'Court of appeals judgment + 30-day PDR window (TRAP 68.2(a)).',
    };
  }
  const days = i.motionForNewTrialFiled ? 90 : 30;
  return {
    date: addDays(i.judgmentDate, days),
    basis: i.motionForNewTrialFiled
      ? 'Judgment + 90-day notice-of-appeal window (motion for new trial filed; TRAP 26.2(a)(2)).'
      : 'Judgment + 30-day notice-of-appeal window (TRAP 26.2(a)(1)).',
  };
}

export function computeDeadlinePosture(i: DeadlineInputs): DeadlinePosture {
  const finality = computeFinality(i);

  // Tolled days: overlap of each properly-filed writ's pendency with
  // [finality, asOf]. Time after a disposition never tolls (FR-5).
  let tolled = 0;
  let tollingNow = false;
  for (const w of i.stateWrits ?? []) {
    const start = Math.max(diffDays(finality.date, w.filedDate), 0);
    const endRaw = w.disposedDate ? diffDays(finality.date, w.disposedDate) : diffDays(finality.date, i.asOf);
    const end = Math.min(endRaw, diffDays(finality.date, i.asOf));
    if (end > start) tolled += end - start;
    if (!w.disposedDate && diffDays(w.filedDate, i.asOf) >= 0) tollingNow = true;
  }

  const gross = Math.max(diffDays(finality.date, i.asOf), 0);
  const elapsed = Math.max(gross - tolled, 0);
  const remaining = Math.max(AEDPA_DAYS - elapsed, 0);
  const expired = remaining === 0;

  return {
    finalityDate: finality.date,
    finalityBasis: finality.basis,
    aedpa: {
      daysElapsed: elapsed,
      daysTolled: tolled,
      daysRemaining: remaining,
      expired,
      estimatedExpiryDate: expired || tollingNow ? null : addDays(i.asOf, remaining),
      tollingNow,
      copyKey: expired ? 'aedpa.expired' : tollingNow ? 'aedpa.tolled' : 'aedpa.running',
    },
    lachesUrgency: diffDays(finality.date, i.asOf) > LACHES_URGENCY_YEARS * 365,
    asOf: i.asOf,
    disclaimerKey: 'deadline.verify_with_attorney',
  };
}
