import { z } from 'zod'

/**
 * Case facts (customer_journey_ux_review §3): what the family told us, kept
 * once and shown back — never re-asked. Populated from the free check at
 * purchase, extended by the interview, displayed on every case page and on
 * the staff case file. Enums and dates only, plus county — no free text.
 */
export const CaseFactsSchema = z
  .object({
    jurisdiction: z.enum(['texas', 'federal', 'other_state']).optional(),
    offenseLevel: z.enum(['felony', 'misdemeanor']).optional(),
    capital: z.enum(['no', 'yes']).optional(),
    custody: z.enum(['prison', 'parole', 'probation', 'discharged']).optional(),
    trialOrPlea: z.enum(['trial', 'plea']).optional(),
    appeal: z.enum(['decided', 'pending', 'none']).optional(),
    noAppealReason: z.enum(['never_filed_requested', 'chose_not', 'unsure']).optional(),
    priorWrit: z.enum(['no', 'yes', 'unsure']).optional(),
    newEvidence: z.boolean().optional(),
    county: z.string().max(64).optional(),
    convictionYear: z.number().int().min(1950).max(2100).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    judgmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    source: z
      .object({
        checkAt: z.string().optional(),
        interviewAt: z.string().optional(),
        editedAt: z.string().optional(),
        /** County/year/dates copied from the family's earlier case at purchase (repeat buyer, 2026-09-12). */
        carriedFromCaseId: z.string().max(64).optional(),
      })
      .optional(),
  })
  .strict()

export type CaseFacts = z.infer<typeof CaseFactsSchema>

/** The free check stores answers as loose string|boolean; keep only what the schema knows. */
export function factsFromCheckAnswers(answers: Record<string, unknown> | null | undefined): CaseFacts {
  if (!answers) return {}
  const pick = (k: string) => (typeof answers[k] === 'string' ? (answers[k] as string) : undefined)
  const raw = {
    jurisdiction: pick('jurisdiction'),
    offenseLevel: pick('offenseLevel'),
    capital: pick('capital'),
    custody: pick('custody'),
    trialOrPlea: pick('trialOrPlea'),
    appeal: pick('appeal'),
    noAppealReason: pick('noAppealReason'),
    priorWrit: pick('priorWrit'),
    newEvidence:
      typeof answers.newEvidence === 'boolean'
        ? answers.newEvidence
        : answers.newEvidence === 'yes'
          ? true
          : answers.newEvidence === 'no'
            ? false
            : undefined,
    source: { checkAt: new Date().toISOString() },
  }
  const parsed = CaseFactsSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)))
  return parsed.success ? parsed.data : {}
}

/** Art. 11.072 governs community supervision; everything else purchasable is 11.07. */
export function vehicleForCustody(custody: CaseFacts['custody'] | undefined): '11.07' | '11.072' {
  return custody === 'probation' ? '11.072' : '11.07'
}

export interface FactLine {
  key: string
  label: string
  value: string | null
  /** We chose this from the family's answers — they never typed it. */
  derived?: boolean
  /** Shapes the checklist or the analysis; frozen once records are complete. */
  shapesReview?: boolean
}

const CUSTODY: Record<NonNullable<CaseFacts['custody']>, string> = {
  prison: 'In prison (TDCJ or SAFP)',
  parole: 'Out on parole or mandatory supervision',
  probation: 'On probation (community supervision)',
  discharged: 'Sentence fully finished',
}
const APPEAL: Record<NonNullable<CaseFacts['appeal']>, string> = {
  decided: 'Decided (denied or affirmed)',
  pending: 'Still being decided',
  none: 'There was no appeal',
}
const NO_APPEAL: Record<NonNullable<CaseFacts['noAppealReason']>, string> = {
  never_filed_requested: 'the lawyer never filed one, even though you wanted it',
  chose_not: 'you chose not to appeal',
  unsure: 'not sure why',
}
const PRIOR_WRIT: Record<NonNullable<CaseFacts['priorWrit']>, string> = {
  no: 'None that you know of',
  yes: 'Yes — this review runs in subsequent-writ mode',
  unsure: 'Not sure',
}

/**
 * The lines a family (or Support) reads on "About this case". Case columns
 * fill in for older cases whose check answers were never kept.
 */
export function describeFacts(
  facts: CaseFacts | null | undefined,
  kase: { lane?: string | null; vehicle?: string | null; subsequentWrit?: boolean; county?: string | null; convictionYear?: number | null }
): FactLine[] {
  const f = facts ?? {}
  const county = f.county ?? kase.county ?? null
  const year = f.convictionYear ?? kase.convictionYear ?? null
  const trialOrPlea = f.trialOrPlea ?? (kase.lane === 'PLEA' ? 'plea' : kase.lane === 'TRIAL' ? 'trial' : undefined)
  const priorWrit = f.priorWrit ?? (kase.subsequentWrit ? 'yes' : undefined)
  const conviction = [county ? `${county} County` : null, year ? String(year) : null, f.offenseLevel === 'felony' ? 'felony' : f.offenseLevel === 'misdemeanor' ? 'misdemeanor' : null, f.jurisdiction === 'texas' ? 'Texas state court' : null]
    .filter(Boolean)
    .join(' · ')
  return [
    { key: 'conviction', label: 'Conviction', value: conviction || null },
    { key: 'trialOrPlea', label: 'How it was decided', value: trialOrPlea === 'trial' ? 'A trial' : trialOrPlea === 'plea' ? 'A guilty or no-contest plea' : null, shapesReview: true },
    { key: 'trialDays', label: 'Trial length', value: f.trialDays != null ? `About ${f.trialDays} day${f.trialDays === 1 ? '' : 's'}` : null },
    { key: 'custody', label: 'Where they are now', value: f.custody ? CUSTODY[f.custody] : null },
    { key: 'vehicle', label: 'Writ type', value: kase.vehicle ? `Article ${kase.vehicle}` : null, derived: true },
    { key: 'appeal', label: 'Direct appeal', value: f.appeal ? `${APPEAL[f.appeal]}${f.appeal === 'none' && f.noAppealReason ? ` — ${NO_APPEAL[f.noAppealReason]}` : ''}` : null, shapesReview: true },
    { key: 'priorWrit', label: 'Prior writ', value: priorWrit ? PRIOR_WRIT[priorWrit] : null, shapesReview: true },
    { key: 'newEvidence', label: 'New evidence', value: f.newEvidence === true ? 'Yes — evidence that was never presented' : f.newEvidence === false ? 'None that you know of' : null },
    { key: 'judgmentDate', label: 'Judgment date', value: f.judgmentDate ?? null },
  ]
}
