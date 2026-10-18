/**
 * The TRAP clock: runs the vector table (trap-chain.ts) over a matter's
 * dates and returns ordered steps with due dates, status and the
 * jurisdictional label the packet prints next to each.
 *
 * Pure: `today` is an input (deadlines.ts conventions), so every clock is
 * replayable. Everything is an ESTIMATE for counsel's verification — the
 * vectors are unsigned until counsel signs them (README.md) and every
 * result carries the FR-5 disclaimer key.
 *
 * Status rules (acceptance E3):
 *  - done     the step's filing date is present (`late` when after the due date);
 *  - missed   no filing and the due date is before `today`;
 *  - open     no filing and the due date is today or later;
 *  - not_yet  the trigger date is not recorded.
 * Optional acts (motion for new trial, reply brief, rehearing) that expired
 * unfiled are dropped rather than reported missed. An extension window
 * (26.3, 68.2(c)) is emitted only while it matters: never after an on-time
 * filing; `done` when the late filing fell inside it; `missed` otherwise.
 * `missedJurisdictional` is true when any jurisdictional step is missed, or
 * was filed late without its extension window being met.
 */
import { diffDays, type CivilDate } from '../deadlines';
import { VEHICLES, type Vehicle } from './vehicles';
import {
  DIRECT_APPEAL_CHAIN,
  WRIT_11_07_CHAIN,
  type DateField,
  type Extension,
  type TrapRule,
  type TrapVector,
  type VectorConfidence,
  type VectorFamily,
  type VectorId,
} from './trap-chain';
import { computeDue, HOLIDAY_TABLE_COVERAGE } from './rule-4-1';

export type StepStatus = 'done' | 'open' | 'missed' | 'not_yet';

export interface TrapClockInputs {
  vehicle: Vehicle;
  /** Fallback trigger when the sentencing date is not recorded (TRAP 26.2 counts from sentencing in open court). */
  judgmentSignedAt?: CivilDate;
  sentenceImposedAt?: CivilDate;
  motionForNewTrialFiledAt?: CivilDate;
  noticeOfAppealFiledAt?: CivilDate;
  /** The LATER of the clerk's record and the reporter's record (TRAP 38.6(a)). */
  recordFiledAt?: CivilDate;
  briefFiledAt?: CivilDate;
  stateBriefFiledAt?: CivilDate;
  replyBriefFiledAt?: CivilDate;
  coaJudgmentAt?: CivilDate;
  rehearingFiledAt?: CivilDate;
  rehearingDeniedAt?: CivilDate;
  pdrFiledAt?: CivilDate;
  postAffirmanceLetterFiledAt?: CivilDate;
  // Art. 11.07 chain
  applicationReceivedByStateAt?: CivilDate;
  stateAnswerFiledAt?: CivilDate;
  designationOrderAt?: CivilDate;
  findingsEnteredAt?: CivilDate;
  recordTransmittedAt?: CivilDate;
  today: CivilDate;
}

// Every DateField the table can name must be an input (compile-time check).
type _InputsCoverFields = TrapClockInputs extends Partial<Record<DateField, CivilDate>> ? true : never;
const _inputsCoverFields: _InputsCoverFields = true;
void _inputsCoverFields;

export interface TrapStep {
  id: VectorId;
  family: VectorFamily;
  rule: TrapRule;
  subdivision?: string;
  label: string;
  /** Null while the trigger has not happened (status not_yet). */
  due: CivilDate | null;
  rawDue: CivilDate | null;
  rolled: boolean;
  rollReason?: string;
  basis: string;
  status: StepStatus;
  filedAt?: CivilDate;
  late: boolean;
  jurisdictional: boolean;
  confidence: VectorConfidence;
  signedBy?: string;
  extension?: Extension;
  isExtension: boolean;
  optional: boolean;
  note: string;
}

export interface TrapClock {
  vehicle: Vehicle;
  asOf: CivilDate;
  steps: TrapStep[];
  nextDue?: { id: VectorId; rule: TrapRule; due: CivilDate; daysLeft: number };
  missedJurisdictional: boolean;
  /** Steps whose vector is not counsel-signed — the packet's disclaimer count. */
  unsignedCount: number;
  notes: string[];
  disclaimerKey: 'deadline.verify_with_attorney';
}

const DATE_FIELDS: readonly DateField[] = [
  'sentenceImposedAt',
  'motionForNewTrialFiledAt',
  'noticeOfAppealFiledAt',
  'recordFiledAt',
  'briefFiledAt',
  'stateBriefFiledAt',
  'replyBriefFiledAt',
  'coaJudgmentAt',
  'rehearingFiledAt',
  'rehearingDeniedAt',
  'pdrFiledAt',
  'postAffirmanceLetterFiledAt',
  'applicationReceivedByStateAt',
  'stateAnswerFiledAt',
  'designationOrderAt',
  'findingsEnteredAt',
  'recordTransmittedAt',
];

function vectorsFor(vehicle: Vehicle): readonly TrapVector[] {
  const chain = VEHICLES[vehicle].chain;
  if (chain === 'pdr') return DIRECT_APPEAL_CHAIN.filter((v) => v.pdrClock);
  if (chain === '11.07') return WRIT_11_07_CHAIN;
  return DIRECT_APPEAL_CHAIN;
}

export function computeTrapClock(i: TrapClockInputs): TrapClock {
  const spec = VEHICLES[i.vehicle];
  const notes: string[] = [];
  const base = (): TrapClock => ({
    vehicle: i.vehicle,
    asOf: i.today,
    steps: [],
    missedJurisdictional: false,
    unsignedCount: 0,
    notes,
    disclaimerKey: 'deadline.verify_with_attorney',
  });

  if (spec.refused) {
    notes.push(`${spec.label}: refused — ${spec.refusedReason ?? 'outside the Counsel Review'}.`);
    return base();
  }
  if (!spec.chain) {
    notes.push(
      i.vehicle === '2254'
        ? 'No TRAP steps for a §2254 petition: use exhaustionMap() for the AEDPA year (computeDeadlinePosture) and the exhaustion posture.'
        : `No vector table is modelled for ${spec.label} yet; the January slice covers the direct-appeal and Art. 11.07 chains.`,
    );
    return base();
  }

  // Inputs, with the sentencing fallback.
  const dates: Partial<Record<DateField, CivilDate>> = {};
  for (const f of DATE_FIELDS) if (i[f]) dates[f] = i[f];
  let sentenceLabel = 'the day sentence was imposed or suspended in open court';
  if (!dates.sentenceImposedAt && i.judgmentSignedAt) {
    dates.sentenceImposedAt = i.judgmentSignedAt;
    sentenceLabel = 'the judgment signed date (sentencing date not recorded — TRAP 26.2 counts from sentencing in open court; verify)';
    notes.push('Sentencing date not recorded: the judgment-signed date stands in for TRAP 26.2 and 35.2. Verify against the reporter\'s record of sentencing.');
  }

  // Applicability: was the motion for new trial timely (21.4)? was a rehearing motion timely (49.1)?
  let mntMode: 'timely' | 'none' = 'none';
  if (dates.motionForNewTrialFiledAt && dates.sentenceImposedAt) {
    const mntDue = computeDue(dates.sentenceImposedAt, 30).due;
    if (dates.motionForNewTrialFiledAt <= mntDue) mntMode = 'timely';
    else notes.push(`Motion for new trial filed ${dates.motionForNewTrialFiledAt}, after the TRAP 21.4 deadline ${mntDue}: it does not open the 90-day notice-of-appeal window.`);
  }
  let rehearingMode: 'filed' | 'none' = 'none';
  if (dates.rehearingFiledAt || dates.rehearingDeniedAt) {
    rehearingMode = 'filed';
    if (dates.rehearingFiledAt && dates.coaJudgmentAt) {
      const rhDue = computeDue(dates.coaJudgmentAt, 15).due;
      if (dates.rehearingFiledAt > rhDue) {
        rehearingMode = 'none';
        notes.push(`Motion for rehearing filed ${dates.rehearingFiledAt}, after the TRAP 49.1 deadline ${rhDue}: an untimely motion does not move the PDR trigger (68.2(a)), which stays at the court of appeals' judgment.`);
      }
    }
  }

  const steps: TrapStep[] = [];
  const dueByFamily = new Map<VectorFamily, CivilDate>();
  const baseByFamily = new Map<VectorFamily, TrapStep>();
  let outsideTable = false;

  for (const v of vectorsFor(i.vehicle)) {
    if (v.applies?.motionForNewTrial && v.applies.motionForNewTrial !== mntMode) continue;
    if (v.applies?.rehearing && v.applies.rehearing !== rehearingMode) continue;

    const parent = v.extensionOf ? baseByFamily.get(v.extensionOf) : undefined;
    if (v.extensionOf) {
      // Only while it matters: parent missed, open, or filed late.
      if (!parent || parent.status === 'not_yet' || (parent.status === 'done' && !parent.late)) continue;
    }

    let triggerDate: CivilDate | undefined;
    let triggerLabel = v.trigger.label;
    if (v.trigger.kind === 'input') {
      triggerDate = dates[v.trigger.field];
      if (v.trigger.field === 'sentenceImposedAt') triggerLabel = sentenceLabel;
    } else {
      triggerDate = dueByFamily.get(v.trigger.family);
    }
    const filedAt = v.filedField ? dates[v.filedField] : undefined;

    const common = {
      id: v.id,
      family: v.family,
      rule: v.rule,
      subdivision: v.subdivision,
      label: v.label,
      jurisdictional: v.jurisdictional,
      confidence: v.confidence,
      signedBy: v.signedBy,
      extension: v.extension,
      isExtension: Boolean(v.extensionOf),
      optional: Boolean(v.optional),
      note: v.note,
    };

    if (!triggerDate) {
      steps.push({
        ...common,
        due: null,
        rawDue: null,
        rolled: false,
        basis: `${v.days} days after ${v.trigger.label} — not yet recorded.`,
        status: 'not_yet',
        late: false,
      });
      continue;
    }

    const d = computeDue(triggerDate, v.days);
    if (!d.holidaysKnown) outsideTable = true;
    if (!v.extensionOf) dueByFamily.set(v.family, d.due);

    let status: StepStatus;
    let late = false;
    if (filedAt) {
      late = filedAt > d.due;
      // A filing after the extension window is a miss, not a late success.
      status = v.extensionOf && late ? 'missed' : 'done';
    } else if (d.due < i.today) {
      if (v.optional) continue;
      status = 'missed';
    } else {
      status = 'open';
    }

    const basis =
      `${v.rule}${v.subdivision ?? ''}: ${v.days} days after ${triggerLabel} (${triggerDate})` +
      (d.rolled ? `; ${d.rawDue} fell on a ${d.rollReason}, extended under TRAP 4.1(a)` : '') +
      (filedAt ? `; filed ${filedAt}${late ? ' (late)' : ''}` : '') +
      '.';

    const step: TrapStep = {
      ...common,
      due: d.due,
      rawDue: d.rawDue,
      rolled: d.rolled,
      rollReason: d.rollReason,
      basis,
      status,
      filedAt,
      late,
    };
    steps.push(step);
    if (!v.extensionOf) baseByFamily.set(v.family, step);
  }

  if (outsideTable) {
    notes.push(`A due date falls outside the Texas legal-holiday table (${HOLIDAY_TABLE_COVERAGE.from} to ${HOLIDAY_TABLE_COVERAGE.to}): only weekends were rolled; check the court's holiday calendar.`);
  }

  const open = steps.filter((s): s is TrapStep & { due: CivilDate } => s.status === 'open' && s.due !== null).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const next = open[0];

  const extensionMet = (s: TrapStep) => steps.some((e) => e.isExtension && e.family === s.family && e.status === 'done');
  const missedJurisdictional = steps.some(
    (s) => s.jurisdictional && (s.status === 'missed' || (s.status === 'done' && s.late && !s.isExtension && !extensionMet(s))),
  );

  return {
    ...base(),
    steps,
    nextDue: next ? { id: next.id, rule: next.rule, due: next.due, daysLeft: diffDays(i.today, next.due) } : undefined,
    missedJurisdictional,
    unsignedCount: steps.filter((s) => s.confidence !== 'signed').length,
  };
}
