/**
 * S0 eligibility routing (PRD US-0, workflow §S0) as a PURE function —
 * this is vehicle routing, not just qualification, and it is legally
 * load-bearing (11.07 vs 11.071 vs 11.072 vs 11.09 is exactly the
 * distinction a family cannot make alone). Unit-tested exhaustively;
 * the wizard UI is a thin shell over this module.
 *
 * Routing rules are part of the attorney-review launch gate (PRD §7.2) —
 * changes here require counsel review.
 */

export type QuestionId =
  | 'jurisdiction'
  | 'offenseLevel'
  | 'capital'
  | 'custody'
  | 'trialOrPlea'
  | 'appeal'
  | 'noAppealReason'
  | 'priorWrit'
  | 'newEvidence'

export interface EligibilityAnswers {
  jurisdiction?: 'texas' | 'federal' | 'other_state'
  offenseLevel?: 'felony' | 'misdemeanor'
  capital?: 'yes' | 'no'
  custody?: 'incarcerated' | 'parole' | 'probation' | 'discharged'
  trialOrPlea?: 'trial' | 'plea'
  appeal?: 'decided' | 'pending' | 'none'
  noAppealReason?: 'never_filed_requested' | 'chose_not' | 'unsure'
  priorWrit?: 'yes' | 'no' | 'unsure'
  newEvidence?: 'yes' | 'no'
}

/** Matches the API/analytics outcome enum exactly (analytics plan §2). */
export type EligibilityOutcome =
  | 'fit_trial'
  | 'fit_plea'
  | 'capital'
  | 'pending_appeal'
  | 'discharged'
  | 'misdemeanor'
  | 'prior_writ_warned'
  | 'not_fit_other'

export interface EligibilityResult {
  outcome: EligibilityOutcome
  /** Post-conviction vehicle this case routes to (null when not a fit). */
  vehicle: '11.07' | '11.072' | null
  lane: 'trial' | 'plea' | null
  /** FR-11: counsel never filed a requested appeal — itself a strong claim. */
  appealRestorationEmphasis: boolean
  /** FR-10/US-0.7: never-presented evidence must be flagged, never dropped. */
  newEvidenceFlag: boolean
  /** A fit outcome proceeds to purchase (prior_writ_warned proceeds WITH the §4 warning). */
  canPurchase: boolean
}

const ORDER: QuestionId[] = [
  'jurisdiction',
  'offenseLevel',
  'capital',
  'custody',
  'trialOrPlea',
  'appeal',
  'noAppealReason', // only when appeal === 'none'
  'priorWrit',
  'newEvidence',
]

/** The next unanswered question, honoring branches — or null when routed. */
export function nextQuestion(a: EligibilityAnswers): QuestionId | null {
  for (const q of ORDER) {
    if (q === 'noAppealReason' && a.appeal !== 'none') continue
    if (a[q] === undefined) {
      // Hard exits mean later questions are never asked.
      if (routeEarly(a) !== null) return null
      return q
    }
  }
  return null
}

/** Early hard-exit routing, applied in question order. */
function routeEarly(a: EligibilityAnswers): EligibilityOutcome | null {
  if (a.jurisdiction && a.jurisdiction !== 'texas') return 'not_fit_other'
  if (a.offenseLevel === 'misdemeanor') return 'misdemeanor'
  // Capital is a RED LINE (PRD §2): excluded entirely, never a sale, at any price.
  if (a.capital === 'yes') return 'capital'
  if (a.custody === 'discharged') return 'discharged'
  if (a.appeal === 'pending') return 'pending_appeal'
  return null
}

export function routeEligibility(a: EligibilityAnswers): EligibilityResult | null {
  const early = routeEarly(a)
  const lane: 'trial' | 'plea' | null = a.trialOrPlea ?? null
  const base = {
    lane: null as EligibilityResult['lane'],
    vehicle: null as EligibilityResult['vehicle'],
    appealRestorationEmphasis: a.noAppealReason === 'never_filed_requested',
    newEvidenceFlag: a.newEvidence === 'yes',
    canPurchase: false,
  }

  if (early) return { ...base, outcome: early }
  if (nextQuestion(a) !== null) return null // still mid-wizard

  // Probation → Art. 11.072 (different court posture, no CCA round-trip);
  // everyone else on the fit path → Art. 11.07.
  const vehicle: '11.07' | '11.072' = a.custody === 'probation' ? '11.072' : '11.07'

  if (a.priorWrit === 'yes') {
    // Subsequent-writ mode: proceeds, but the §4-bar warning leads (FR-9).
    return { ...base, outcome: 'prior_writ_warned', vehicle, lane, canPurchase: true }
  }

  return {
    ...base,
    outcome: lane === 'plea' ? 'fit_plea' : 'fit_trial',
    vehicle,
    lane,
    canPurchase: true,
  }
}

/** Total question count for the "Question N of ~8" caption. */
export function questionCount(a: EligibilityAnswers): number {
  return a.appeal === 'none' ? ORDER.length : ORDER.length - 1
}

export function questionNumber(a: EligibilityAnswers, current: QuestionId): number {
  const active = ORDER.filter((q) => q !== 'noAppealReason' || a.appeal === 'none')
  return active.indexOf(current) + 1
}
