/**
 * Art. 11.07 posture — the inputs recorded on the matter and the rule, as
 * data the counsel packet prints (copy keys name the paragraphs).
 *
 * UPL review 2026-10-23 (P5, recommendation 6): this module DESCRIBES. It
 * prints what was recorded (how many prior applications; whether they were
 * decided on the merits, or that nobody has recorded that yet) and the rule
 * in neutral words. It never says the bar "applies", never calls an
 * application "subsequent", and never tells counsel what is lost — those
 * are counsel's conclusions on facts the software does not hold.
 *
 * Rule as recalled (confidence: proposed; see README.md):
 *  - Art. 11.07 §4(a): a court may not consider the merits of, or grant
 *    relief on, a later application challenging the same conviction unless
 *    it contains sufficient specific facts establishing (1) that the legal
 *    or factual basis was unavailable when the prior application was filed,
 *    or (2) by a preponderance of the evidence, that but for a violation of
 *    the United States Constitution no rational juror could have found the
 *    applicant guilty beyond a reasonable doubt.
 *  - Only a prior application decided on the merits (denied, or granted in
 *    part) counts; one dismissed without reaching the merits does not.
 *  - Art. 11.071 §5 and Art. 11.072 §9 carry parallel rules. Art. 11.09
 *    states no subsequent-application rule as read here.
 *  - A filing while the direct appeal is pending (before the mandate) is
 *    dismissed, not held.
 *  - TRAP 79.2(d): no motion for rehearing from a denial of an 11.07
 *    application; only a suggestion that the court reconsider on its own
 *    motion.
 *
 * The complete-inventory line is unconditional for every writ vehicle: the
 * gravest harm the product can do is to let counsel believe the inventory
 * is complete (persona doc, "the §4 one-shot problem").
 */
import type { Vehicle } from './vehicles';

export type WritVehicle = Extract<Vehicle, '11.07' | '11.071' | '11.072' | '11.09'>;

export interface Posture1107Inputs {
  vehicle?: WritVehicle;
  /** Prior applications challenging THIS conviction, as recorded on the matter. */
  priorWrits: number;
  /** Whether those applications were decided on the merits, as recorded; null or undefined = not recorded. */
  priorWritsDecidedOnMerits?: boolean | null;
  /** Direct appeal (or PDR) recorded as still pending — mandate not issued. */
  directAppealPending?: boolean;
}

export interface Section4Exception {
  id: '4(a)(1)' | '4(a)(2)';
  label: string;
  text: string;
}

export interface Posture1107 {
  vehicle: WritVehicle;
  /** The rule's name for this vehicle, or the no-rule note for 11.09. */
  authority: string;
  /** Whether the vehicle's statute states a subsequent-application rule as read here (a property of the vehicle, not of the case). */
  statutoryRule: boolean;
  /** The inputs, echoed so the packet prints exactly what was recorded. */
  inputs: {
    priorWrits: number;
    /** null = not recorded. */
    priorWritsDecidedOnMerits: boolean | null;
    directAppealPending: boolean;
  };
  /** "Prior applications recorded: N; whether they were decided on the merits: not recorded / yes / no". */
  priorApplicationsLine: string;
  /** The rule in neutral words, for the vehicle. */
  rule: string;
  /** The statutory exceptions the rule names (the statute's own words, as recalled); empty when the vehicle states no rule. */
  exceptions: Section4Exception[];
  completeInventoryWarning: true;
  /** The premature-filing rule in neutral words. */
  prematureFilingRule: string;
  noRehearing: { rule: 'TRAP 79.2(d)'; text: string };
  copyKeys: Array<'writ.prior_applications' | 'writ.complete_inventory' | 'writ.premature' | 'writ.no_rehearing' | 'writ.no_statutory_rule'>;
  notes: string[];
  confidence: 'proposed' | 'signed';
}

const EXCEPTIONS: Section4Exception[] = [
  {
    id: '4(a)(1)',
    label: 'New legal or factual basis',
    text: 'The current claims could not have been presented previously because the factual or legal basis was unavailable on the date the applicant filed the previous application.',
  },
  {
    id: '4(a)(2)',
    label: 'Actual innocence (preponderance)',
    text: 'By a preponderance of the evidence, but for a violation of the United States Constitution no rational juror could have found the applicant guilty beyond a reasonable doubt.',
  },
];

const RULE_AUTHORITY: Record<WritVehicle, { rule: boolean; authority: string; name: string }> = {
  '11.07': { rule: true, authority: 'Tex. Code Crim. Proc. art. 11.07 §4', name: 'Article 11.07 §4' },
  '11.071': { rule: true, authority: 'Tex. Code Crim. Proc. art. 11.071 §5 (capital — refused for the Counsel Review)', name: 'Article 11.071 §5' },
  '11.072': { rule: true, authority: 'Tex. Code Crim. Proc. art. 11.072 §9', name: 'Article 11.072 §9' },
  '11.09': { rule: false, authority: 'Art. 11.09 states no subsequent-application rule as read here (proposed)', name: 'Article 11.09' },
};

/** "not recorded" / "yes" / "no" — the recorded fact, never an assumption. */
export function decidedOnMeritsLabel(v: boolean | null | undefined): 'not recorded' | 'yes' | 'no' {
  return v == null ? 'not recorded' : v ? 'yes' : 'no';
}

export function posture1107(i: Posture1107Inputs): Posture1107 {
  const vehicle: WritVehicle = i.vehicle ?? '11.07';
  const auth = RULE_AUTHORITY[vehicle];
  const notes: string[] = [];
  const priorWrits = Math.max(0, i.priorWrits);
  const decided = i.priorWritsDecidedOnMerits ?? null;
  const directAppealPending = Boolean(i.directAppealPending);

  const priorApplicationsLine =
    priorWrits === 0
      ? 'Prior applications recorded: 0'
      : `Prior applications recorded: ${priorWrits}; whether they were decided on the merits: ${decidedOnMeritsLabel(decided)}`;

  const rule = auth.rule
    ? `Under ${auth.name} a later application must plead one of the statutory exceptions unless the earlier one was dismissed without reaching the merits.`
    : `${auth.authority}; whether any other doctrine bears on a later application is for counsel.`;

  if (priorWrits > 0 && decided === null) {
    notes.push('Whether the prior application(s) reached the merits is not recorded on this matter; counsel to confirm from the disposition.');
  }

  const copyKeys: Posture1107['copyKeys'] = ['writ.complete_inventory'];
  if (priorWrits > 0) copyKeys.push('writ.prior_applications');
  if (priorWrits > 0 && !auth.rule) copyKeys.push('writ.no_statutory_rule');
  if (directAppealPending) copyKeys.push('writ.premature');
  copyKeys.push('writ.no_rehearing');

  const prematureFilingRule = 'As read here, an application filed while the direct appeal is pending — before the mandate issues — is dismissed rather than held.';
  if (directAppealPending) notes.push(`The direct appeal is recorded as pending. ${prematureFilingRule}`);

  return {
    vehicle,
    authority: auth.authority,
    statutoryRule: auth.rule,
    inputs: { priorWrits, priorWritsDecidedOnMerits: decided, directAppealPending },
    priorApplicationsLine,
    rule,
    exceptions: auth.rule ? EXCEPTIONS : [],
    completeInventoryWarning: true,
    prematureFilingRule,
    noRehearing: {
      rule: 'TRAP 79.2(d)',
      text: 'No motion for rehearing may be filed from the denial of an Art. 11.07 application; the only route is a suggestion that the Court reconsider on its own motion.',
    },
    copyKeys,
    notes,
    confidence: 'proposed',
  };
}
