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

export default function CaseSummaryBlock({ rows, compact = false }: { rows?: SummaryRow[] | null; compact?: boolean }) {
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
    </section>
  )
}
