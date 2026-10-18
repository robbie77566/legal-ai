/**
 * §2254 exhaustion map — per-ground posture for the federal vehicle, plus
 * the AEDPA one-year posture delegated to computeDeadlinePosture
 * (deadlines.ts) so the year is computed in exactly one place.
 *
 * The rule, as simple as the packet needs (confidence: proposed):
 *   1. pending in state court                        → unexhausted
 *      (nothing is exhausted until the state court disposes of it)
 *   2. raised in an 11.07 application AND decided on
 *      the merits (denied / granted in part)         → exhausted
 *      — the CCA is the court of last resort for 11.07 (§2254(b)(1)(A)).
 *   3. raised on direct appeal AND fairly presented
 *      to the CCA (a PDR; `raisedInPdr` not false)
 *      AND decided on the merits                     → exhausted
 *      — a claim that stopped at the court of appeals was never presented
 *      to the state's highest court (Richardson v. Procunier; Myers v.
 *      Collins) and is treated as not raised.
 *   4. raised (11.07, or appeal + PDR) but disposed
 *      of on a state procedural ground               → procedurally_defaulted
 *      — an independent and adequate state ground (§4 dismissal, the
 *      contemporaneous-objection rule, Ex parte Gardner) bars federal
 *      review absent cause and prejudice or a miscarriage of justice
 *      (Coleman v. Thompson).
 *   5. never fairly presented, and a prior 11.07 on
 *      this conviction was decided on the merits     → procedurally_defaulted
 *      — the ground is "technically exhausted" because §4 would bar the
 *      return trip (Nobles v. Johnson; Fearance v. Scott).
 *   6. never fairly presented, no merits 11.07 yet   → unexhausted
 *      — go back to state court first (Rose v. Lundy); a mixed petition is
 *      dismissed or stayed (Rhines v. Weber).
 *
 * Not modelled (counsel's call): cause-and-prejudice, Martinez/Trevino
 * (IAC of initial-review habeas counsel as cause), actual-innocence
 * gateways, and whether a state court's unexplained denial was on the
 * merits (Harrington v. Richter presumes it was).
 */
import { computeDeadlinePosture, type DeadlineInputs, type DeadlinePosture } from '../deadlines';

export type ExhaustionStatus = 'exhausted' | 'unexhausted' | 'procedurally_defaulted';

export interface GroundInput {
  id: string;
  /** Raised in the court of appeals on direct appeal. */
  raisedOnDirectAppeal: boolean;
  /** Carried to the CCA in a PDR. Undefined = not known, treated as presented; false = stopped at the court of appeals. */
  raisedInPdr?: boolean;
  /** Raised in an Art. 11.07 (or 11.071/11.072) application. */
  raisedIn1107: boolean;
  /** The state court disposed of it on the merits (as opposed to a procedural dismissal). */
  decidedOnMerits: boolean;
  /** Still pending in state court. */
  pending?: boolean;
}

export interface GroundExhaustion {
  id: string;
  status: ExhaustionStatus;
  /** Which rule above fired, in words. */
  basis: string;
}

export interface ExhaustionMapInputs {
  grounds: GroundInput[];
  /** Prior 11.07 applications on this conviction decided on the merits (rule 5). Default 0. */
  priorWritsDecidedOnMerits?: number;
  /** When present, the AEDPA posture is computed by the existing engine and attached. */
  deadlines?: DeadlineInputs;
}

export interface ExhaustionMap {
  grounds: GroundExhaustion[];
  summary: { exhausted: number; unexhausted: number; procedurallyDefaulted: number };
  /** At least one exhausted and at least one unexhausted ground (Rose v. Lundy). */
  mixedPetition: boolean;
  aedpa?: DeadlinePosture;
  rule: string;
  confidence: 'proposed' | 'signed';
}

export const EXHAUSTION_RULE =
  'Exhausted: decided on the merits after presentation to the CCA (11.07, or direct appeal with a PDR). Procedurally defaulted: disposed of on a state procedural ground, or never presented when §4 would now bar it. Unexhausted: otherwise, including grounds still pending.';

export function classifyGround(g: GroundInput, priorWritsDecidedOnMerits: number): GroundExhaustion {
  if (g.pending) {
    return { id: g.id, status: 'unexhausted', basis: 'Still pending in state court; nothing is exhausted until the state court disposes of it.' };
  }
  const presentedByWrit = g.raisedIn1107;
  const presentedByAppeal = g.raisedOnDirectAppeal && g.raisedInPdr !== false;
  if (presentedByWrit && g.decidedOnMerits) {
    return { id: g.id, status: 'exhausted', basis: 'Raised in an Art. 11.07 application and decided on the merits by the Court of Criminal Appeals (§2254(b)(1)(A)).' };
  }
  if (presentedByAppeal && g.decidedOnMerits) {
    return { id: g.id, status: 'exhausted', basis: 'Raised on direct appeal, carried to the Court of Criminal Appeals by PDR, and decided on the merits.' };
  }
  if (presentedByWrit || presentedByAppeal) {
    return {
      id: g.id,
      status: 'procedurally_defaulted',
      basis: 'Presented to the state courts but disposed of on a state procedural ground (an independent and adequate state bar — Coleman v. Thompson); federal review needs cause and prejudice or a miscarriage-of-justice showing.',
    };
  }
  if (g.raisedOnDirectAppeal && g.raisedInPdr === false && priorWritsDecidedOnMerits === 0) {
    return {
      id: g.id,
      status: 'unexhausted',
      basis: 'Raised in the court of appeals but never carried to the Court of Criminal Appeals (no PDR); not fairly presented to the state\'s highest court. An 11.07 application can still present it.',
    };
  }
  if (priorWritsDecidedOnMerits > 0) {
    return {
      id: g.id,
      status: 'procedurally_defaulted',
      basis: 'Never presented to the Court of Criminal Appeals, and a prior Art. 11.07 application on this conviction was decided on the merits: Art. 11.07 §4 would bar a return to state court, so the ground is technically exhausted and procedurally defaulted (Nobles v. Johnson).',
    };
  }
  return {
    id: g.id,
    status: 'unexhausted',
    basis: 'Never presented to the Court of Criminal Appeals and no merits 11.07 application exists yet: present it in state court first (Rose v. Lundy).',
  };
}

export function exhaustionMap(i: ExhaustionMapInputs): ExhaustionMap {
  const prior = Math.max(0, i.priorWritsDecidedOnMerits ?? 0);
  const grounds = i.grounds.map((g) => classifyGround(g, prior));
  const summary = {
    exhausted: grounds.filter((g) => g.status === 'exhausted').length,
    unexhausted: grounds.filter((g) => g.status === 'unexhausted').length,
    procedurallyDefaulted: grounds.filter((g) => g.status === 'procedurally_defaulted').length,
  };
  return {
    grounds,
    summary,
    mixedPetition: summary.exhausted > 0 && summary.unexhausted > 0,
    aedpa: i.deadlines ? computeDeadlinePosture(i.deadlines) : undefined,
    rule: EXHAUSTION_RULE,
    confidence: 'proposed',
  };
}
