/**
 * Art. 11.07 posture beyond laches — the §4 framing the counsel packet
 * prints (data, not prose; copy keys name the paragraphs).
 *
 * Rule as recalled (confidence: proposed; see README.md):
 *  - Art. 11.07 §4(a): a court may not consider the merits of, or grant
 *    relief on, a SUBSEQUENT application (one filed after a prior
 *    application challenging the same conviction was finally disposed of)
 *    unless it contains sufficient specific facts establishing (1) that the
 *    legal or factual basis was unavailable when the prior application was
 *    filed, or (2) by a preponderance of the evidence, that but for a
 *    violation of the United States Constitution no rational juror could
 *    have found the applicant guilty beyond a reasonable doubt.
 *  - Only a prior application decided on the merits (denied, or granted in
 *    part) counts. Dismissals — for non-compliance with the form (TRAP 73.1/
 *    73.2), because the direct appeal was still pending (Ex parte Johnson),
 *    or otherwise without reaching the merits — do not make the next one
 *    "subsequent" (Ex parte Torres).
 *  - Art. 11.071 §5 and Art. 11.072 §9 carry parallel bars. Art. 11.09 has
 *    no statutory subsequent-application bar as read here, though an abuse-
 *    of-the-writ doctrine may apply — flagged, not asserted.
 *  - A filing while the direct appeal is pending (before the mandate) is
 *    dismissed, not held (FY2025: 70 "direct appeal pending" dismissals).
 *  - TRAP 79.2(d): no motion for rehearing from a denial of an 11.07
 *    application; only a suggestion that the court reconsider on its own
 *    motion.
 *
 * The complete-inventory warning is unconditional for every writ vehicle:
 * the gravest harm the product can do is to let counsel believe the
 * inventory is complete (persona doc, "the §4 one-shot problem").
 */
import type { Vehicle } from './vehicles';

export type WritVehicle = Extract<Vehicle, '11.07' | '11.071' | '11.072' | '11.09'>;

export interface Posture1107Inputs {
  vehicle?: WritVehicle;
  /** Prior applications challenging THIS conviction, of any outcome. */
  priorWrits: number;
  /** How many of those were decided on the merits (denied/granted). Defaults to all of them — the conservative reading. */
  priorWritsDecidedOnMerits?: number;
  /** Direct appeal (or PDR) still pending — mandate not issued. */
  directAppealPending?: boolean;
}

export interface Section4Exception {
  id: '4(a)(1)' | '4(a)(2)';
  label: string;
  text: string;
}

export interface Posture1107 {
  vehicle: WritVehicle;
  /** A prior application on this conviction was decided on the merits. */
  subsequentWrit: boolean;
  /** The statutory bar applies to this vehicle AND this is a subsequent application. */
  section4Bar: boolean;
  /** Which bar: 'Art. 11.07 §4', 'Art. 11.071 §5', 'Art. 11.072 §9', or the no-bar note for 11.09. */
  authority: string;
  exceptions: Section4Exception[];
  /** First application: every ground not raised now is ordinarily lost. */
  oneShot: boolean;
  completeInventoryWarning: true;
  prematureFiling: boolean;
  noRehearing: { rule: 'TRAP 79.2(d)'; text: string };
  copyKeys: Array<'writ.one_shot' | 'writ.complete_inventory' | 'writ.subsequent_bar' | 'writ.premature' | 'writ.no_rehearing' | 'writ.no_statutory_bar'>;
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

const BAR_AUTHORITY: Record<WritVehicle, { bars: boolean; authority: string }> = {
  '11.07': { bars: true, authority: 'Tex. Code Crim. Proc. art. 11.07 §4' },
  '11.071': { bars: true, authority: 'Tex. Code Crim. Proc. art. 11.071 §5 (capital — refused for the Counsel Review)' },
  '11.072': { bars: true, authority: 'Tex. Code Crim. Proc. art. 11.072 §9' },
  '11.09': { bars: false, authority: 'Art. 11.09 states no subsequent-application bar as read here (proposed); abuse-of-the-writ principles may still apply' },
};

export function posture1107(i: Posture1107Inputs): Posture1107 {
  const vehicle: WritVehicle = i.vehicle ?? '11.07';
  const bar = BAR_AUTHORITY[vehicle];
  const notes: string[] = [];

  const onMerits = Math.max(0, Math.min(i.priorWrits, i.priorWritsDecidedOnMerits ?? i.priorWrits));
  if (i.priorWritsDecidedOnMerits === undefined && i.priorWrits > 0) {
    notes.push('Prior applications are assumed decided on the merits (the conservative reading). Pass priorWritsDecidedOnMerits when a prior application was dismissed without reaching the merits.');
  }
  if (i.priorWrits > onMerits) {
    notes.push(`${i.priorWrits - onMerits} prior application(s) dismissed without a merits ruling (non-compliance, direct appeal pending, or similar) do not count toward the subsequent-application bar (Ex parte Torres).`);
  }

  const subsequentWrit = onMerits > 0;
  const section4Bar = bar.bars && subsequentWrit;
  const oneShot = !subsequentWrit;
  const prematureFiling = Boolean(i.directAppealPending);

  const copyKeys: Posture1107['copyKeys'] = ['writ.complete_inventory'];
  if (oneShot) copyKeys.push('writ.one_shot');
  if (section4Bar) copyKeys.push('writ.subsequent_bar');
  if (subsequentWrit && !bar.bars) copyKeys.push('writ.no_statutory_bar');
  if (prematureFiling) copyKeys.push('writ.premature');
  copyKeys.push('writ.no_rehearing');

  if (prematureFiling) notes.push('The direct appeal is pending: an application filed before the mandate issues is dismissed, not held, and the time is wasted.');
  if (subsequentWrit && !bar.bars) notes.push(`A prior application exists but ${bar.authority}.`);

  return {
    vehicle,
    subsequentWrit,
    section4Bar,
    authority: bar.authority,
    exceptions: section4Bar ? EXCEPTIONS : [],
    oneShot,
    completeInventoryWarning: true,
    prematureFiling,
    noRehearing: {
      rule: 'TRAP 79.2(d)',
      text: 'No motion for rehearing may be filed from the denial of an Art. 11.07 application; the only route is a suggestion that the Court reconsider on its own motion.',
    },
    copyKeys,
    notes,
    confidence: 'proposed',
  };
}
