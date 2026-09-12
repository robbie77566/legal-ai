import { z } from 'zod'

/**
 * Case summary — the "About this case" block at the top of every report
 * (PO, 2026-09-12): person, county and court, cause number, offense, dates,
 * verdict and sentence, direct appeal, prior writs.
 *
 * Every fact is either CITED to the record (volume/page + a verbatim quote
 * that the pipeline re-checks against the chunks, exactly like a finding)
 * or absent. A summary row can also fall back to what the family told us
 * at intake, and says so. Nothing is ever inferred.
 */
const cite = z.object({
  volume: z.string().max(64).nullable().optional(),
  page: z.number().int().nonnegative().nullable().optional(),
  quote: z.string().min(3).max(400),
})
const fact = z.object({ value: z.string().min(1).max(300), cite }).nullable()

export const CaseSummarySchema = z
  .object({
    defendant: fact.optional(),
    county: fact.optional(),
    court: fact.optional(),
    causeNumber: fact.optional(),
    offense: fact.optional(),
    offenseDate: fact.optional(),
    trialDates: fact.optional(),
    verdict: fact.optional(),
    sentence: fact.optional(),
    judgmentDate: fact.optional(),
    appeal: fact.optional(),
    priorWrits: fact.optional(),
  })
  .strict()
export type CaseSummary = z.infer<typeof CaseSummarySchema>
export type SummaryFact = NonNullable<CaseSummary['defendant']>

export const SUMMARY_KEYS: Array<[keyof CaseSummary, string]> = [
  ['defendant', 'Person'],
  ['county', 'County'],
  ['court', 'Court'],
  ['causeNumber', 'Cause number'],
  ['offense', 'Offense'],
  ['offenseDate', 'Date of the offense'],
  ['trialDates', 'Trial dates'],
  ['verdict', 'Verdict'],
  ['sentence', 'Sentence'],
  ['judgmentDate', 'Judgment date'],
  ['appeal', 'Direct appeal'],
  ['priorWrits', 'Prior writs'],
]

/** Which checklist documents usually state each fact (PO, 2026-09-12): when
 *  a row is not from the record, the report can say which missing paper
 *  would carry it, and that a re-run with it would fill the row. */
export const SUMMARY_SOURCES: Record<keyof CaseSummary, string[]> = {
  defendant: ['judgment', 'indictment', 'rr_volume'],
  county: ['judgment', 'indictment'],
  court: ['judgment', 'indictment'],
  causeNumber: ['judgment', 'indictment'],
  offense: ['indictment', 'judgment'],
  offenseDate: ['indictment'],
  trialDates: ['rr_volume', 'judgment'],
  verdict: ['judgment', 'rr_volume'],
  sentence: ['judgment'],
  judgmentDate: ['judgment'],
  appeal: ['appellate_opinion'],
  priorWrits: ['prior_writ_application', 'clerks_record'],
}

export interface SummaryGap {
  /** Row labels not confirmed from the record (family-told or unknown). */
  labels: string[]
  /** Still-needed checklist documents that usually state one of those rows. */
  documents: Array<{ kind: string; label: string }>
}

/** Rows not confirmed from the record, and the missing documents that would fill them. */
export function summaryGaps(rows: SummaryRow[], needed: Array<{ kind: string; label: string }>): SummaryGap | null {
  const gapRows = rows.filter((r) => r.source !== 'record')
  if (gapRows.length === 0) return null
  const kinds = new Set(gapRows.flatMap((r) => SUMMARY_SOURCES[r.key] ?? []))
  const seen = new Set<string>()
  const documents = needed.filter((n) => kinds.has(n.kind) && !seen.has(n.kind) && seen.add(n.kind)).map(({ kind, label }) => ({ kind, label }))
  return { labels: gapRows.map((r) => r.label), documents }
}

export interface SummaryRow {
  key: keyof CaseSummary
  label: string
  value: string | null
  /** 'record' = cited to the record; 'family' = what the family told us; null = not known */
  source: 'record' | 'family' | null
  cite?: { volume?: string | null; page?: number | null; quote: string }
}

/** Family-provided fallbacks (intake facts) for the rows the record did not state. */
export interface FamilyFacts {
  county?: string | null
  convictionYear?: number | null
  trialOrPlea?: 'trial' | 'plea' | null
  appeal?: 'decided' | 'pending' | 'none' | null
  priorWrit?: 'no' | 'yes' | 'unsure' | null
  judgmentDate?: string | null
}

export function summaryRows(summary: CaseSummary | null | undefined, family: FamilyFacts = {}): SummaryRow[] {
  const fam: Partial<Record<keyof CaseSummary, string | null>> = {
    county: family.county ? `${family.county} County` : null,
    judgmentDate: family.judgmentDate ?? (family.convictionYear ? String(family.convictionYear) : null),
    verdict: family.trialOrPlea === 'trial' ? 'Convicted at trial' : family.trialOrPlea === 'plea' ? 'Convicted on a guilty or no-contest plea' : null,
    appeal: family.appeal === 'decided' ? 'A direct appeal was decided' : family.appeal === 'pending' ? 'A direct appeal is pending' : family.appeal === 'none' ? 'No direct appeal' : null,
    priorWrits: family.priorWrit === 'yes' ? 'A prior writ was filed' : family.priorWrit === 'no' ? 'None' : null,
  }
  return SUMMARY_KEYS.map(([key, label]) => {
    const f = summary?.[key]
    if (f) return { key, label, value: f.value, source: 'record', cite: f.cite }
    const fv = fam[key] ?? null
    return { key, label, value: fv, source: fv ? 'family' : null }
  })
}
