'use client'

/** "About this case" (PO 2026-09-12): every line is cited to the record or
 *  marked as what the family told us; unknown lines say so. */
export interface SummaryRow {
  key: string
  label: string
  value: string | null
  source: 'record' | 'family' | null
  cite?: { volume?: string | null; page?: number | null; quote: string }
}

export interface SummaryGap {
  labels: string[]
  documents: Array<{ kind: string; label: string }>
}

/** Shared wording with the PDF (packages/reports summaryGapNote). */
export function summaryGapNote(gap: SummaryGap, rerunPriceCents?: number | null): string {
  const docs = gap.documents.map((d) => d.label).join(', ')
  const price = rerunPriceCents != null ? ` — $${Math.round(rerunPriceCents / 100)} at today's price` : ''
  return `Not confirmed from the documents you sent: ${gap.labels.join(', ')}. These are usually stated on: ${docs} (not uploaded). If you can get ${gap.documents.length === 1 ? 'it' : 'them'}, upload and re-run the analysis${price}; the review would then fill these in from the record.`
}

export default function CaseSummaryBlock({ rows, compact = false, gap, rerunPriceCents }: { rows?: SummaryRow[] | null; compact?: boolean; gap?: SummaryGap | null; rerunPriceCents?: number | null }) {
  if (!rows || !rows.some((r) => r.value)) return null
  return (
    <section className={`${compact ? 'mt-4' : 'mt-6'} rounded-xl border border-db-line bg-db-surface p-4`} data-testid="case-summary">
      <h2 className="font-db-serif text-lg font-semibold">About this case</h2>
      <p className="mt-1 text-xs text-db-muted">From the record you sent, with the page it comes from. A line marked &ldquo;as your family told us&rdquo; is from your answers, not the record.</p>
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <dt className="text-db-muted">{r.label}</dt>
            <dd data-testid={`summary-${r.key}`} className={r.value ? '' : 'text-db-muted'}>
              {r.value ?? 'not stated in the record'}
              {r.value && r.cite && (
                <span className="ml-1 font-db-mono text-xs text-db-muted" title={r.cite.quote}>
                  ({[r.cite.volume, r.cite.page != null ? `p. ${r.cite.page}` : null].filter(Boolean).join(' ') || 'record'})
                </span>
              )}
              {r.value && r.source === 'family' && <span className="ml-1 text-xs text-db-muted">— as your family told us</span>}
            </dd>
          </div>
        ))}
      </dl>
      {gap && gap.documents.length > 0 && (
        <p className="mt-3 rounded-lg border border-db-line p-3 text-xs" data-testid="summary-gap">
          {summaryGapNote(gap, rerunPriceCents)}
        </p>
      )}
    </section>
  )
}
