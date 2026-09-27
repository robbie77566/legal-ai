import { z } from 'zod'

/**
 * Structured fields on every finding (prompt set v2, 2026-09-27) — what a
 * manual appellate review tracks per issue that a bare finding did not:
 *   preserved     did trial counsel preserve it (objection → ruling)?
 *   harmStandard  the review standard on appeal (drives how a lawyer ranks it)
 *   vehicle       which door it goes through — DERIVED here, never asked of
 *                 the model, because models are inconsistent about procedure
 *   develop       the extra-record step that proves or rules it out
 *   dependsOn     records the finding needs that were not provided
 *
 * Every normalizer is lenient by design: a finding is never rejected for a
 * malformed field (that voided whole screens once — analysis.service).
 */
export type Preserved = 'yes' | 'partial' | 'no' | 'unknown'
export type HarmStandard = 'structural' | 'constitutional' | 'nonconstitutional' | 'none'
export type Vehicle = 'direct_appeal' | 'writ' | 'either'

export const PRESERVED_VALUES = ['yes', 'partial', 'no', 'unknown'] as const
export const HARM_VALUES = ['structural', 'constitutional', 'nonconstitutional', 'none'] as const
export const PreservedSchema = z.enum(PRESERVED_VALUES)

export function normalizePreserved(raw: unknown): Preserved {
  if (raw === true) return 'yes'
  if (raw === false) return 'no'
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'unknown'
  // "unknown" must be tested before the negatives: "un…" is also how "unpreserved" starts.
  if (/^(unknown|unclear|undetermined|uncertain|unsure|not (determined|clear|stated)|n\/a|cannot tell|can't tell)/.test(s)) return 'unknown'
  if (/^partial|partially|in part|running objection only|some/.test(s)) return 'partial'
  if (/^(no|none|not|un-?preserved|un-?objected|waived|forfeit|false|never)/.test(s) || /\b(not|un)-?preserved\b|\bwaived\b|\bforfeited\b/.test(s)) return 'no'
  if (/^(yes|y|true|preserved|objected|objection)/.test(s) || /\bpreserved\b/.test(s)) return 'yes'
  return 'unknown'
}

export function normalizeHarmStandard(raw: unknown): HarmStandard {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'none'
  if (/non-?constitution|44\.2\s*\(?b\)?|state[- ]law|evidentiary|statutory|rule of evidence/.test(s)) return 'nonconstitutional'
  if (/structur/.test(s)) return 'structural'
  if (/constitution|44\.2\s*\(?a\)?|sixth|fifth|fourteenth|confrontation|due process|federal/.test(s)) return 'constitutional'
  return 'none'
}

/**
 * Which door a finding goes through. Deterministic: the screen and category
 * say what kind of claim it is; preservation says whether the record claim
 * is still open on appeal or only reachable through counsel's failure.
 */
export function vehicleFor(f: { screen?: string | null; category?: string | null; preserved?: string | null; harmStandard?: string | null }): Vehicle {
  const kind = `${f.screen ?? ''} ${f.category ?? ''}`.toLowerCase()
  // A void or illegal sentence is cognizable at any time, on either path.
  if (/sentenc|illegal[_ ]sentence|void|cumulat|fine\b|enhance|parole|time[_ ]credit/.test(kind)) return 'either'
  // Claims built on facts outside the record, or on counsel's performance.
  if (/\biac\b|ineffective|brady|impeach|lost[_ ]evidence|investigation|junk|11\.073|science|forensic|plea|appeal[_ ]restoration|new[_ ]evidence|deadline/.test(kind)) return 'writ'
  // Everything else is a record claim.
  const p = normalizePreserved(f.preserved)
  if (normalizeHarmStandard(f.harmStandard) === 'structural') return 'direct_appeal'
  if (p === 'no') return 'writ' // reachable only as ineffective assistance
  return 'direct_appeal'
}

const SEV: Record<string, number> = { dispositive: 0, supportive: 1, background: 2 }
const PRES: Record<Preserved, number> = { yes: 0, partial: 1, unknown: 2, no: 3 }
const HARM: Record<HarmStandard, number> = { structural: 0, constitutional: 1, nonconstitutional: 2, none: 3 }

export interface Rankable {
  severity: string
  confidence?: number | null
  preserved?: string | null
  harmStandard?: string | null
  vehicle?: string | null
  screen?: string | null
  category?: string | null
}

/**
 * Lower is higher priority. Severity first (the family-facing weight), then
 * preservation, then the review standard, then confidence — the order an
 * appellate lawyer sorts a brief. A sentence claim on the "either" path is
 * not penalised for lacking a preservation call: it needs none.
 */
export function priorityRank(f: Rankable): number {
  const sev = SEV[f.severity] ?? 2
  const vehicle = f.vehicle ?? vehicleFor(f)
  const pres = vehicle === 'either' ? 0 : PRES[normalizePreserved(f.preserved)]
  const harm = HARM[normalizeHarmStandard(f.harmStandard)]
  const c = typeof f.confidence === 'number' && Number.isFinite(f.confidence) ? Math.max(0, Math.min(1, f.confidence)) : 0
  return sev * 1000 + pres * 100 + harm * 10 + Math.round((1 - c) * 9)
}

export function rankIssues<T extends Rankable>(findings: T[]): T[] {
  return [...findings].sort((a, b) => priorityRank(a) - priorityRank(b))
}

export const PRESERVED_LABEL: Record<Preserved, string> = {
  yes: 'Preserved (objection and ruling in the record)',
  partial: 'Partly preserved',
  no: 'Not preserved',
  unknown: 'Preservation not determined',
}
export const HARM_LABEL: Record<HarmStandard, string> = {
  structural: 'Structural — reversal without a harm analysis',
  constitutional: 'Constitutional — TRAP 44.2(a): reversal unless harmless beyond a reasonable doubt',
  nonconstitutional: 'Non-constitutional — TRAP 44.2(b): reversal only if a substantial right was affected',
  none: 'Not a reviewable trial error on its own',
}
export const VEHICLE_LABEL: Record<Vehicle, string> = {
  direct_appeal: 'Direct appeal (record claim)',
  writ: 'Art. 11.07 writ (needs a record built outside the trial record)',
  either: 'Either — cognizable on appeal or by writ',
}

export function preservedLabel(p: unknown): string { return PRESERVED_LABEL[normalizePreserved(p)] }
export function harmLabel(h: unknown): string { return HARM_LABEL[normalizeHarmStandard(h)] }
export function vehicleLabel(v: unknown): string {
  return VEHICLE_LABEL[(v === 'direct_appeal' || v === 'writ' || v === 'either' ? v : 'direct_appeal') as Vehicle]
}

/** Does this finding carry any v2 field worth rendering? Old snapshots do not. */
export function hasStructuredFields(f: { preserved?: unknown; harmStandard?: unknown; vehicle?: unknown; develop?: unknown; dependsOn?: unknown }): boolean {
  return Boolean(f.preserved || f.harmStandard || f.vehicle || f.develop || (Array.isArray(f.dependsOn) && f.dependsOn.length))
}

/**
 * The attorney's to-do list: every `develop` step, in priority order, with
 * near-duplicates folded (the same records asked for by two findings).
 */
export function investigationChecklist(findings: Array<Rankable & { develop?: string | null }>, cap = 25): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const f of rankIssues(findings)) {
    const raw = (f.develop ?? '').trim()
    if (!raw) continue
    const key = raw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!key || seen.has(key)) continue
    seen.add(key)
    // Tidy for display: a sentence, capitalised and terminated.
    const d = raw[0].toUpperCase() + raw.slice(1)
    out.push(/[.!?]$/.test(d) ? d : `${d}.`)
    if (out.length >= cap) break
  }
  return out
}
