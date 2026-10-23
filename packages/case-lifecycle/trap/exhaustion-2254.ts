/**
 * §2254 state-remedies map — per-ground description for the federal
 * vehicle, plus the AEDPA one-year posture delegated to computeDeadlinePosture
 * (deadlines.ts) so the year is computed in exactly one place.
 *
 * UPL review 2026-10-23 (P5, recommendation 6): the packet does NOT print
 * this map until the grounds feature exists, and the status labels DESCRIBE
 * what the inputs show about the ground's path through the state courts —
 * "state remedies: shown / not shown / unclear" — rather than stating the
 * legal conclusions "exhausted" or "procedurally defaulted".
 * UPL review 2026-10-23: counsel decision pending (question 11) — the legal
 * labels return only after counsel's answer to question 11.
 *
 * The reading, as simple as the packet needs (confidence: proposed):
 *   1. pending in state court                        → not shown
 *      (nothing is complete until the state court disposes of it)
 *   2. raised in an 11.07 application AND decided on
 *      the merits (denied / granted in part)         → shown
 *      — the CCA is the court of last resort for 11.07.
 *   3. raised on direct appeal AND carried to the CCA
 *      (a PDR; `raisedInPdr` not false) AND decided
 *      on the merits                                 → shown
 *      — a claim that stopped at the court of appeals was never presented
 *      to the state's highest court.
 *   4. raised (11.07, or appeal + PDR) but disposed
 *      of on a state procedural ground               → unclear
 *      — presented, but not decided on the merits; what that means for
 *      federal review is counsel's call.
 *   5. never fairly presented, and a prior 11.07 on
 *      this conviction was decided on the merits     → unclear
 *      — never presented, and a return to state court would meet the
 *      Art. 11.07 §4 rule; counsel's call.
 *   6. never fairly presented, no merits 11.07 yet   → not shown
 *
 * Not modelled (counsel's call): cause-and-prejudice, ineffective assistance
 * of initial-review habeas counsel as cause, actual-innocence gateways, and
 * whether a state court's unexplained denial was on the merits.
 */
import { computeDeadlinePosture, type DeadlineInputs, type DeadlinePosture } from '../deadlines';

/** What the recorded path shows about state remedies on the ground: shown, not shown, or unclear from the inputs. */
export type ExhaustionStatus = 'shown' | 'not_shown' | 'unclear';

/** The label the packet would print: "state remedies: shown". */
export const EXHAUSTION_STATUS_LABEL: Record<ExhaustionStatus, string> = {
  shown: 'state remedies: shown',
  not_shown: 'state remedies: not shown',
  unclear: 'state remedies: unclear',
};

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
  /** Which line above fired, in words — what the inputs show, not what follows from it. */
  basis: string;
}

export interface ExhaustionMapInputs {
  grounds: GroundInput[];
  /** Prior 11.07 applications on this conviction decided on the merits (line 5). Default 0. */
  priorWritsDecidedOnMerits?: number;
  /** When present, the AEDPA posture is computed by the existing engine and attached. */
  deadlines?: DeadlineInputs;
}

export interface ExhaustionMap {
  grounds: GroundExhaustion[];
  summary: { shown: number; notShown: number; unclear: number };
  /** At least one ground shown and at least one not shown — a fact about the list, for counsel to weigh. */
  mixed: boolean;
  aedpa?: DeadlinePosture;
  rule: string;
  confidence: 'proposed' | 'signed';
}

export const EXHAUSTION_RULE =
  'State remedies shown: the ground was presented to the Court of Criminal Appeals (an Art. 11.07 application, or direct appeal carried by PDR) and decided on the merits. Not shown: the ground was never presented there, or is still pending. Unclear: the ground was presented but disposed of on a procedural ground, or was never presented after a prior Art. 11.07 application on this conviction was decided on the merits.';

export function classifyGround(g: GroundInput, priorWritsDecidedOnMerits: number): GroundExhaustion {
  if (g.pending) {
    return { id: g.id, status: 'not_shown', basis: 'Still pending in state court; the state court has not disposed of it.' };
  }
  const presentedByWrit = g.raisedIn1107;
  const presentedByAppeal = g.raisedOnDirectAppeal && g.raisedInPdr !== false;
  if (presentedByWrit && g.decidedOnMerits) {
    return { id: g.id, status: 'shown', basis: 'Raised in an Art. 11.07 application and decided on the merits by the Court of Criminal Appeals.' };
  }
  if (presentedByAppeal && g.decidedOnMerits) {
    return { id: g.id, status: 'shown', basis: 'Raised on direct appeal, carried to the Court of Criminal Appeals by PDR, and decided on the merits.' };
  }
  if (presentedByWrit || presentedByAppeal) {
    return {
      id: g.id,
      status: 'unclear',
      basis: 'Presented to the state courts but disposed of on a state procedural ground rather than on the merits; what that means for federal review is for counsel.',
    };
  }
  if (g.raisedOnDirectAppeal && g.raisedInPdr === false && priorWritsDecidedOnMerits === 0) {
    return {
      id: g.id,
      status: 'not_shown',
      basis: "Raised in the court of appeals but never carried to the Court of Criminal Appeals (no PDR); not presented to the state's highest court, and no Art. 11.07 application on this conviction has been decided on the merits.",
    };
  }
  if (priorWritsDecidedOnMerits > 0) {
    return {
      id: g.id,
      status: 'unclear',
      basis: 'Never presented to the Court of Criminal Appeals, and a prior Art. 11.07 application on this conviction was decided on the merits, so a later state application would meet the Art. 11.07 §4 rule; what follows is for counsel.',
    };
  }
  return {
    id: g.id,
    status: 'not_shown',
    basis: 'Never presented to the Court of Criminal Appeals, and no Art. 11.07 application on this conviction has been decided on the merits.',
  };
}

export function exhaustionMap(i: ExhaustionMapInputs): ExhaustionMap {
  const prior = Math.max(0, i.priorWritsDecidedOnMerits ?? 0);
  const grounds = i.grounds.map((g) => classifyGround(g, prior));
  const summary = {
    shown: grounds.filter((g) => g.status === 'shown').length,
    notShown: grounds.filter((g) => g.status === 'not_shown').length,
    unclear: grounds.filter((g) => g.status === 'unclear').length,
  };
  return {
    grounds,
    summary,
    mixed: summary.shown > 0 && summary.notShown > 0,
    aedpa: i.deadlines ? computeDeadlinePosture(i.deadlines) : undefined,
    rule: EXHAUSTION_RULE,
    confidence: 'proposed',
  };
}
