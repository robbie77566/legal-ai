/**
 * The TRAP vector table — the artifact counsel signs (persona rollout plan
 * §5 E: "TRAP vectors counsel-signed").
 *
 * EVERY vector is `confidence: 'proposed'` until a Texas appellate lawyer
 * reads the rule text against it and sets `confidence: 'signed'` and
 * `signedBy` in a founder-merged change (see README.md). The packet prints
 * the unsigned disclaimer from `unsignedVectors()`.
 *
 * Rule numbers follow the plan (26.2, 26.3, 35.2, 38.6, 49.1, 68.2, 73.4,
 * 73.5). Where the text as recalled here is uncertain the `note` says so.
 * The labels "jurisdictional" / "discretionary" follow the plan's framing:
 * jurisdictional = miss it without a timely extension and the court cannot
 * reach the merits; discretionary = the court can extend or excuse it.
 *
 * Days are calendar days counted under TRAP 4.1(a) (rule-4-1.ts). The
 * trigger is either an input date or the (rolled) due date of an earlier
 * vector in the same family.
 */
import type { VectorChain } from './vehicles';

export type TrapRule =
  | 'TRAP 21.4'
  | 'TRAP 26.2'
  | 'TRAP 26.3'
  | 'TRAP 35.2'
  | 'TRAP 38.6'
  | 'TRAP 48.4'
  | 'TRAP 49.1'
  | 'TRAP 68.2'
  | 'Art. 11.07 §3(b)'
  | 'Art. 11.07 §3(c)'
  | 'TRAP 73.4'
  | 'TRAP 73.5';

export type VectorId =
  | 'mnt'
  | 'noa'
  | 'noa_mnt'
  | 'noa_ext'
  | 'record'
  | 'record_mnt'
  | 'brief'
  | 'state_brief'
  | 'reply_brief'
  | 'rehearing'
  | 'pdr'
  | 'pdr_after_rehearing'
  | 'pdr_ext'
  | 'post_affirmance_notice'
  | 'state_answer'
  | 'designation'
  | 'resolution_180'
  | 'transmittal_181';

/** Variants of one deadline (30/90-day notice of appeal) share a family so extensions can point at "whichever applied". */
export type VectorFamily = 'mnt' | 'noa' | 'record' | 'brief' | 'state_brief' | 'reply_brief' | 'rehearing' | 'pdr' | 'post_affirmance_notice' | 'state_answer' | 'designation' | 'resolution_180' | 'transmittal_181';

/** Input date fields of computeTrapClock a vector may point at. */
export type DateField =
  | 'sentenceImposedAt'
  | 'motionForNewTrialFiledAt'
  | 'noticeOfAppealFiledAt'
  | 'recordFiledAt'
  | 'briefFiledAt'
  | 'stateBriefFiledAt'
  | 'replyBriefFiledAt'
  | 'coaJudgmentAt'
  | 'rehearingFiledAt'
  | 'rehearingDeniedAt'
  | 'pdrFiledAt'
  | 'postAffirmanceLetterFiledAt'
  | 'applicationReceivedByStateAt'
  | 'stateAnswerFiledAt'
  | 'designationOrderAt'
  | 'findingsEnteredAt'
  | 'recordTransmittedAt';

export type Trigger =
  | { kind: 'input'; field: DateField; label: string }
  | { kind: 'due'; family: VectorFamily; label: string };

/** 'calendar' = calendar days under TRAP 4.1(a) with weekend/holiday roll-forward. (The only rule the table uses today.) */
export type CountingRule = 'calendar';

export type VectorConfidence = 'signed' | 'proposed';

export interface Extension {
  rule: string;
  /** Fixed window in days after the deadline, when the rule gives one. */
  days?: number;
  condition: string;
}

export interface Applicability {
  /** 'timely' = a motion for new trial was filed within TRAP 21.4's 30 days; 'none' = no timely motion. */
  motionForNewTrial?: 'timely' | 'none';
  /** 'filed' = a motion for rehearing was filed (PDR runs from its overruling); 'none' = no motion. */
  rehearing?: 'filed' | 'none';
}

export interface TrapVector {
  id: VectorId;
  family: VectorFamily;
  chain: VectorChain;
  /** Also part of the PDR-only clock (vehicle 'pdr_clock'). */
  pdrClock?: boolean;
  rule: TrapRule;
  subdivision?: string;
  label: string;
  trigger: Trigger;
  days: number;
  countingRule: CountingRule;
  extension?: Extension;
  /** This vector IS the extension window of another family (emitted only when that one is late or missed). */
  extensionOf?: VectorFamily;
  /** Input date that marks the step done. */
  filedField?: DateField;
  applies?: Applicability;
  /** An optional act (motion for new trial, reply brief, rehearing): an unfiled, expired optional step is dropped, not reported missed. */
  optional?: boolean;
  jurisdictional: boolean;
  confidence: VectorConfidence;
  signedBy?: string;
  note: string;
}

const sentence: Trigger = { kind: 'input', field: 'sentenceImposedAt', label: 'the day sentence was imposed or suspended in open court' };

export const DIRECT_APPEAL_CHAIN: readonly TrapVector[] = [
  {
    id: 'mnt',
    family: 'mnt',
    chain: 'direct_appeal',
    rule: 'TRAP 21.4',
    subdivision: '(a)',
    label: 'Motion for new trial',
    trigger: sentence,
    days: 30,
    countingRule: 'calendar',
    filedField: 'motionForNewTrialFiledAt',
    optional: true,
    jurisdictional: false,
    confidence: 'proposed',
    note: 'Not an appellate deadline, but the 90-day notice-of-appeal window (26.2(a)(2)) exists only if the motion was TIMELY under 21.4(a); a late motion is a nullity and does not extend time. Listed so the engine can test timeliness. The motion is overruled by operation of law 75 days after sentencing if not ruled on (TRAP 21.8), which is why the record period in 35.2(b) is 120 days.',
  },
  {
    id: 'noa',
    family: 'noa',
    chain: 'direct_appeal',
    rule: 'TRAP 26.2',
    subdivision: '(a)(1)',
    label: 'Notice of appeal (no timely motion for new trial)',
    trigger: sentence,
    days: 30,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 26.3', days: 15, condition: 'Within 15 days after the deadline, file the notice of appeal in the trial court AND a motion complying with TRAP 10.5(b) in the court of appeals (both acts within the window: Olivo v. State).' },
    filedField: 'noticeOfAppealFiledAt',
    applies: { motionForNewTrial: 'none' },
    jurisdictional: true,
    confidence: 'proposed',
    note: '"Within 30 days after the day sentence is imposed or suspended in open court, or after the day the trial court enters an appealable order." Jurisdictional: a late notice without a 26.3 extension deprives the court of appeals of jurisdiction (Slaton v. State; Olivo v. State); the only cure is an out-of-time appeal by 11.07 writ. When the sentencing date is unknown the clock falls back to the judgment-signed date and says so.',
  },
  {
    id: 'noa_mnt',
    family: 'noa',
    chain: 'direct_appeal',
    rule: 'TRAP 26.2',
    subdivision: '(a)(2)',
    label: 'Notice of appeal (timely motion for new trial filed)',
    trigger: sentence,
    days: 90,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 26.3', days: 15, condition: 'Within 15 days after the deadline, file the notice of appeal in the trial court AND a TRAP 10.5(b) motion in the court of appeals.' },
    filedField: 'noticeOfAppealFiledAt',
    applies: { motionForNewTrial: 'timely' },
    jurisdictional: true,
    confidence: 'proposed',
    note: '"Within 90 days after the day sentence is imposed or suspended in open court if the defendant timely files a motion for new trial." The 90 days run from sentencing, not from the ruling on the motion.',
  },
  {
    id: 'noa_ext',
    family: 'noa',
    chain: 'direct_appeal',
    rule: 'TRAP 26.3',
    label: 'Extension window for the notice of appeal',
    trigger: { kind: 'due', family: 'noa', label: 'the notice-of-appeal deadline' },
    days: 15,
    countingRule: 'calendar',
    extensionOf: 'noa',
    filedField: 'noticeOfAppealFiledAt',
    jurisdictional: true,
    confidence: 'proposed',
    note: 'The court of appeals may extend the time to file the notice of appeal if, within 15 days after the deadline, the notice is filed in the trial court and a 10.5(b) motion in the court of appeals. In criminal cases the implied-motion rule of Verburgt v. Dorner does NOT apply (Olivo): both filings must happen inside the window. Emitted only when the notice was not filed on time.',
  },
  {
    id: 'record',
    family: 'record',
    chain: 'direct_appeal',
    rule: 'TRAP 35.2',
    subdivision: '(a)',
    label: 'Appellate record due (no motion for new trial)',
    trigger: sentence,
    days: 60,
    countingRule: 'calendar',
    applies: { motionForNewTrial: 'none' },
    filedField: 'recordFiledAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 60 days after the day sentence is imposed or suspended in open court, or the order appealed from has been signed, if a motion for new trial is not filed." The clerk\'s and reporter\'s duty, not the appellant\'s; a late record is handled under TRAP 35.3 and 37.3, never by dismissal of a criminal appeal.',
  },
  {
    id: 'record_mnt',
    family: 'record',
    chain: 'direct_appeal',
    rule: 'TRAP 35.2',
    subdivision: '(b)',
    label: 'Appellate record due (timely motion for new trial)',
    trigger: sentence,
    days: 120,
    countingRule: 'calendar',
    applies: { motionForNewTrial: 'timely' },
    filedField: 'recordFiledAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 120 days after the day sentence is imposed or suspended in open court ... if a timely motion for new trial is filed and denied." The 60-days-after-an-order-granting-a-new-trial variant (35.2(c) as recalled) is not modelled: a granted motion ends the appeal.',
  },
  {
    id: 'brief',
    family: 'brief',
    chain: 'direct_appeal',
    rule: 'TRAP 38.6',
    subdivision: '(a)',
    label: "Appellant's brief due",
    trigger: { kind: 'input', field: 'recordFiledAt', label: 'the later of the clerk\'s record and the reporter\'s record being filed' },
    days: 30,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 38.6(d)', condition: 'On a motion complying with TRAP 10.5(b); the court may extend on motion filed before or (as recalled) reasonably after the due date. A criminal appeal is not dismissed for want of a brief — TRAP 38.8(b) sends it back to the trial court for an abandonment hearing instead.' },
    filedField: 'briefFiledAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 30 days — 20 days in an accelerated appeal — after the later of: (1) the date the clerk\'s record was filed; or (2) the date the reporter\'s record was filed." Pass `recordFiledAt` as the LATER of the two. Accelerated appeals (20 days) are not modelled; the persona doc notes 38.6 was not transcribed from the rule text in its pass.',
  },
  {
    id: 'state_brief',
    family: 'state_brief',
    chain: 'direct_appeal',
    rule: 'TRAP 38.6',
    subdivision: '(b)',
    label: "State's (appellee's) brief due",
    trigger: { kind: 'input', field: 'briefFiledAt', label: "the appellant's brief being filed" },
    days: 30,
    countingRule: 'calendar',
    filedField: 'stateBriefFiledAt',
    optional: true,
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 30 days after the date the appellant\'s brief was filed." The State\'s step; listed because the reply-brief window runs from it. Optional for status purposes: the State may not brief.',
  },
  {
    id: 'reply_brief',
    family: 'reply_brief',
    chain: 'direct_appeal',
    rule: 'TRAP 38.6',
    subdivision: '(c)',
    label: 'Reply brief (optional)',
    trigger: { kind: 'input', field: 'stateBriefFiledAt', label: "the State's brief being filed" },
    days: 20,
    countingRule: 'calendar',
    filedField: 'replyBriefFiledAt',
    optional: true,
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 20 days after the date the appellee\'s brief was filed." Optional: an expired, unfiled reply window is dropped from the clock, not reported as missed.',
  },
  {
    id: 'rehearing',
    family: 'rehearing',
    chain: 'direct_appeal',
    pdrClock: true,
    rule: 'TRAP 49.1',
    label: 'Motion for rehearing in the court of appeals (optional)',
    trigger: { kind: 'input', field: 'coaJudgmentAt', label: "the court of appeals' judgment or order being rendered" },
    days: 15,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 49.8', days: 15, condition: 'A motion to extend filed within 15 days after the last day for filing the motion for rehearing (as recalled).' },
    filedField: 'rehearingFiledAt',
    optional: true,
    jurisdictional: false,
    confidence: 'proposed',
    note: '"A motion for rehearing may be filed within 15 days after the court of appeals\' judgment or order is rendered." Not a prerequisite to a PDR (TRAP 49.9 as recalled) — discretionary. Filing one moves the PDR trigger to the day it is overruled (68.2(a)).',
  },
  {
    id: 'pdr',
    family: 'pdr',
    chain: 'direct_appeal',
    pdrClock: true,
    rule: 'TRAP 68.2',
    subdivision: '(a)',
    label: 'Petition for discretionary review due',
    trigger: { kind: 'input', field: 'coaJudgmentAt', label: "the court of appeals' judgment being rendered" },
    days: 30,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 68.2(c)', days: 15, condition: 'A motion complying with TRAP 10.5(b) filed in the Court of Criminal Appeals within 15 days after the last day for filing the petition.' },
    filedField: 'pdrFiledAt',
    applies: { rehearing: 'none' },
    jurisdictional: true,
    confidence: 'proposed',
    note: '"Must be filed within 30 days after either the day the court of appeals\' judgment was rendered or the day the last timely motion for rehearing or timely motion for en banc reconsideration was overruled." Filed with the CCA clerk (68.3). Labelled jurisdictional per the plan: the CCA dismisses an untimely petition absent a 68.2(c) extension; the cure is an out-of-time PDR by 11.07 writ (which the CCA grants weekly for TRAP 48.4 failures). Subdivision letters (a)/(c) as recalled.',
  },
  {
    id: 'pdr_after_rehearing',
    family: 'pdr',
    chain: 'direct_appeal',
    pdrClock: true,
    rule: 'TRAP 68.2',
    subdivision: '(a)',
    label: 'Petition for discretionary review due (after rehearing overruled)',
    trigger: { kind: 'input', field: 'rehearingDeniedAt', label: 'the last timely motion for rehearing being overruled' },
    days: 30,
    countingRule: 'calendar',
    extension: { rule: 'TRAP 68.2(c)', days: 15, condition: 'A TRAP 10.5(b) motion filed in the Court of Criminal Appeals within 15 days after the last day for filing the petition.' },
    filedField: 'pdrFiledAt',
    applies: { rehearing: 'filed' },
    jurisdictional: true,
    confidence: 'proposed',
    note: 'Same rule as `pdr`; the trigger is the overruling of a TIMELY motion for rehearing. An untimely rehearing motion does not move the trigger — the clock checks the rehearing filing against 49.1 and falls back to the judgment date when it was late.',
  },
  {
    id: 'pdr_ext',
    family: 'pdr',
    chain: 'direct_appeal',
    pdrClock: true,
    rule: 'TRAP 68.2',
    subdivision: '(c)',
    label: 'Extension window for the petition for discretionary review',
    trigger: { kind: 'due', family: 'pdr', label: 'the PDR deadline' },
    days: 15,
    countingRule: 'calendar',
    extensionOf: 'pdr',
    filedField: 'pdrFiledAt',
    jurisdictional: true,
    confidence: 'proposed',
    note: 'The CCA may extend the time to file a PDR if a 10.5(b) motion is filed within 15 days after the last day for filing. Emitted only when the petition was not filed on time.',
  },
  {
    id: 'post_affirmance_notice',
    family: 'post_affirmance_notice',
    chain: 'direct_appeal',
    pdrClock: true,
    rule: 'TRAP 48.4',
    label: 'Post-affirmance notice to the defendant (certified mail) and certification',
    trigger: { kind: 'input', field: 'coaJudgmentAt', label: "the court of appeals' opinion being handed down" },
    days: 5,
    countingRule: 'calendar',
    filedField: 'postAffirmanceLetterFiledAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: 'Within five days after the opinion is handed down, appellate counsel sends the defendant a copy of the opinion and judgment with notice of the right to file a pro se PDR, by certified mail, return receipt requested, and files a letter certifying compliance (as recalled). Discretionary for the appeal but the single most common source of out-of-time PDR writs. The 48.4 checklist itself is the February slice.',
  },
];

const stateReceipt: Trigger = { kind: 'input', field: 'applicationReceivedByStateAt', label: 'the day the State received the application' };

export const WRIT_11_07_CHAIN: readonly TrapVector[] = [
  {
    id: 'state_answer',
    family: 'state_answer',
    chain: '11.07',
    rule: 'Art. 11.07 §3(b)',
    label: "State's answer due",
    trigger: stateReceipt,
    days: 15,
    countingRule: 'calendar',
    filedField: 'stateAnswerFiledAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: 'The attorney representing the State "shall answer the application not later than the 15th day after the date the copy of the application is received" (as recalled; the persona doc carries this period as secondary). The State\'s clock, listed because §3(c) runs from its expiry.',
  },
  {
    id: 'designation',
    family: 'designation',
    chain: '11.07',
    rule: 'Art. 11.07 §3(c)',
    label: 'Convicting court decides whether controverted, unresolved facts exist',
    trigger: { kind: 'due', family: 'state_answer', label: "the expiry of the State's time to answer" },
    days: 20,
    countingRule: 'calendar',
    filedField: 'designationOrderAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: '"Within 20 days of the expiration of the time in which the state is allowed to answer" the court decides whether there are controverted, previously unresolved facts material to the legality of confinement. If it finds none — or does not act, which "shall constitute such a finding" — the clerk immediately transmits the application to the CCA. An order designating issues is the only thing that keeps the application in the convicting court.',
  },
  {
    id: 'resolution_180',
    family: 'resolution_180',
    chain: '11.07',
    rule: 'TRAP 73.5',
    label: 'Convicting court resolves the designated issues (180 days)',
    trigger: stateReceipt,
    days: 180,
    countingRule: 'calendar',
    filedField: 'findingsEnteredAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: 'Designated issues "must be resolved within 180 days from the date of receipt of the application by the State" unless the convicting court obtains an extension from the CCA. The persona doc cites the 180-day sentence to TRAP 73.4(b)(5) and 73.5 together; which subdivision carries which sentence is uncertain here and must be checked against the rule text at signing. The court\'s clock, not counsel\'s; listed because the writ record cannot reach the CCA before it runs.',
  },
  {
    id: 'transmittal_181',
    family: 'transmittal_181',
    chain: '11.07',
    rule: 'TRAP 73.4',
    subdivision: '(b)(5)',
    label: 'District clerk forwards the writ record to the CCA (181st day)',
    trigger: stateReceipt,
    days: 181,
    countingRule: 'calendar',
    filedField: 'recordTransmittedAt',
    jurisdictional: false,
    confidence: 'proposed',
    note: '"On the 181st day ... the district clerk shall forward the writ record to this Court unless the district court has received an extension of time." The clerk\'s transmittal must carry the 73.4(b)(3) summary sheet (court, judge, hearing held, findings made, recommendation, counsel of record). Subdivision as the persona doc cites it; verify at signing. Once received, the CCA has no fixed deadline to act (TRAP 73.6 as recalled), and TRAP 79.2(d) bars rehearing.',
  },
];

export const TRAP_CHAIN: readonly TrapVector[] = [...DIRECT_APPEAL_CHAIN, ...WRIT_11_07_CHAIN];

/** The vectors nobody has signed yet — the packet prints the disclaimer from this. */
export function unsignedVectors(): TrapVector[] {
  return TRAP_CHAIN.filter((v) => v.confidence !== 'signed' || !v.signedBy);
}

export function vectorById(id: VectorId): TrapVector {
  const v = TRAP_CHAIN.find((x) => x.id === id);
  if (!v) throw new Error(`unknown TRAP vector: ${id}`);
  return v;
}
