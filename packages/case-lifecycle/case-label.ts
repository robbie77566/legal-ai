/**
 * How a case is named wherever a human reads it.
 *
 * The `Case.title` column is a constant ('Case review') stamped at purchase —
 * it identifies nothing, so a staff queue rendering it shows the same words on
 * every row. The family never sees that column either: the customer list
 * derives "Harris County · 2019" instead. Staff must read the SAME words, or
 * a support call ("I'm calling about my son's case") cannot be matched to a
 * row, so both sides now come through here.
 *
 * We hold no inmate name to label a case with — CaseFacts is deliberately
 * "enums and dates only, plus county — no free text" — so identity is the
 * conviction (county + year) plus a short reference the family and staff can
 * read aloud to each other.
 */

/** Fields any caller can supply from a `Case` row; all optional so partial selects work. */
export interface CaseLabelSource {
  id?: string | null
  county?: string | null
  convictionYear?: number | null
  createdAt?: Date | string | null
}

/**
 * A short, speakable case reference derived from the case id — the thing a
 * family member reads off an email and Support types into the queue search.
 * Case ids are cuids (long, lowercase, easy to misread); the last six
 * characters uppercased are stable, unique enough to find a row, and short
 * enough to say on the phone. Never used as a key — always as a label.
 */
export function caseRef(id: string | null | undefined): string {
  if (!id) return '—'
  return id.slice(-6).toUpperCase()
}

/**
 * The human name of a case: the conviction it concerns. Falls back to the day
 * the review started when the family has not told us the county/year yet
 * (they answer that in the interview, which can lag purchase).
 */
export function caseLabel(kase: CaseLabelSource): string {
  if (kase.county && kase.convictionYear) return `${kase.county} County · ${kase.convictionYear}`
  if (kase.county) return `${kase.county} County`
  if (kase.convictionYear) return `${kase.convictionYear} conviction`
  if (kase.createdAt) {
    const d = kase.createdAt instanceof Date ? kase.createdAt : new Date(kase.createdAt)
    if (!Number.isNaN(d.getTime())) return `Review started ${d.toISOString().slice(0, 10)}`
  }
  return 'Review'
}

/** Label plus reference, for a staff surface that has room for both. */
export function caseLabelWithRef(kase: CaseLabelSource): string {
  return kase.id ? `${caseLabel(kase)} · ${caseRef(kase.id)}` : caseLabel(kase)
}

/** Does this case match a staff search term? Matches label, reference, or raw id. */
export function caseMatchesTerm(kase: CaseLabelSource, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (!t) return true
  return (
    caseLabel(kase).toLowerCase().includes(t) ||
    caseRef(kase.id).toLowerCase().includes(t) ||
    (kase.id ?? '').toLowerCase().includes(t)
  )
}
