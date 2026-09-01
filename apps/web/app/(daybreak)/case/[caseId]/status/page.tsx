'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch, apiEventSource } from '@/lib/api'
import { trackerModel, type TrackerModel } from '@/lib/tracker'
import type { CustomerView } from '@hg/case-lifecycle'

/**
 * S4/S5 tracker (UI spec §5.6): five named stages, breathing dot, honest
 * hold overlays, zero legal content pre-QA. Live updates ride the CaseEvent
 * outbox channel — the customer view arrives pre-mapped; raw state never
 * reaches this page.
 */
/**
 * Plain-language names for the analysis checks (upload_page_ux_review.md §2).
 * Finding COUNTS are deliberately never shown pre-QA — completed checks are
 * facts; numbers wait for the verified report.
 */
const SCREEN_NAMES: Record<string, string> = {
  preserved_error: 'mistakes the defense lawyer objected to at trial',
  iac: 'how well the defense lawyer did their job',
  brady: 'evidence the State may not have turned over',
  junk_science: 'outdated or discredited scientific evidence',
  sentencing: 'sentencing problems',
  deadline: 'filing deadlines',
  appeal_restoration: 'lost appeal rights',
  plea_lane: 'problems with the guilty plea',
  voir_dire: 'jury selection problems',
}
const TOTAL_CHECKS = 6 // the running screen set (ANALYSIS_* config)

/** The always-available "what's happening right now" copy per active stage —
 * a cold page load mid-analysis must explain itself without waiting for the
 * next live event. */
const STAGE_EXPLAINERS: Record<string, string> = {
  digitizing:
    'Right now the system is reading every page you sent — turning scans and photos into text it can search, and counting pages as it goes.',
  analyzing:
    'Right now the system is reading the full record and running its checks — each one looks for a different kind of problem. Before anything reaches you, every quote it flags is double-checked word-for-word against your actual documents; anything that doesn’t match exactly is thrown out.',
  quality_review:
    'The analysis is done. The report is now going through its quality checks before it’s released to you.',
}

export default function CaseStatus() {
  const { caseId } = useParams<{ caseId: string }>()
  const [view, setView] = useState<CustomerView | null>(null)
  const [lastDetail, setLastDetail] = useState<string | null>(null)
  const [checksDone, setChecksDone] = useState<string[]>([])
  const [dates, setDates] = useState<{ started: string | null; readyBy: string | null }>({ started: null, readyBy: null })
  const [facts, setFacts] = useState<{ pagesDigitized: number; documentsProcessed: number; documentsTotal: number } | null>(null)

  useEffect(() => {
    // Base state + COLD-LOAD progress facts from the checklist endpoint,
    // then live via SSE — a mid-run page open must not start empty.
    void apiFetch(`/cases/${caseId}/checklist`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        if (d.customer) setView(d.customer)
        setDates({ started: d.slaStartedAt ?? null, readyBy: d.expectedReadyAt ?? null })
        if (d.progressFacts) {
          setFacts(d.progressFacts)
          const seeded = (d.progressFacts.checksDone as string[])
            .map((k) => SCREEN_NAMES[k])
            .filter(Boolean)
          if (seeded.length) setChecksDone((prev) => [...new Set([...seeded, ...prev])])
        }
      })
      .catch(() => {})

    const es = apiEventSource(`/cases/${caseId}/progress`)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.customer) setView(msg.customer)
        // Honest sub-detail: counts only, from the registry-validated payload
        if (msg.type === 'screen.completed') {
          if (msg.payload?.volumesTotal) {
            setLastDetail(`Volume ${msg.payload.volumesRead} of ${msg.payload.volumesTotal} read`)
          }
          const name = SCREEN_NAMES[msg.payload?.screen as string]
          if (name) setChecksDone((prev) => (prev.includes(name) ? prev : [...prev, name]))
        } else if (msg.type === 'doc.ocr_done' && typeof msg.payload?.pages === 'number') {
          setLastDetail(`${msg.payload.pages} pages digitized`)
        }
      } catch {
        /* legacy worker messages — ignored; the outbox is the contract */
      }
    }
    return () => es.close()
  }, [caseId])

  const model: TrackerModel | null = view ? trackerModel(view) : null

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">Your review&rsquo;s progress</h1>
      {(dates.started || dates.readyBy) && (
        <p className="mt-2 text-sm text-db-muted" data-testid="date-anchors">
          {dates.started && <>Started {new Date(dates.started).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</>}
          {dates.started && dates.readyBy && ' · '}
          {dates.readyBy && (
            <>Expect your report by <strong className="text-db-ink">{new Date(dates.readyBy).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</strong></>
          )}
        </p>
      )}

      {model?.overlayCopy && (
        <p
          className="mt-4 rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--db-review)', color: 'var(--db-review)' }}
        >
          {model.overlayCopy}
        </p>
      )}

      {!model && <p className="mt-6 text-db-muted">Loading…</p>}

      {model && model.activeIndex === -1 && (
        <p className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
          We&rsquo;re waiting on your documents — the tracker starts the moment you mark them
          complete.
        </p>
      )}

      {model && (
        <ol className="mt-6 space-y-1">
          {model.stages.map((stage, i) => {
            const isActive = i === model.activeIndex && !model.delivered
            const isDone = i < model.activeIndex || model.delivered
            return (
              <li key={stage.id} className="flex items-start gap-4 rounded-xl p-3" data-active={isActive}>
                <span
                  aria-hidden
                  className={isActive ? 'db-breathe mt-1.5 h-3 w-3 rounded-full' : 'mt-1.5 h-3 w-3 rounded-full'}
                  style={{
                    background: isDone || isActive ? 'var(--db-accent)' : 'var(--db-line)',
                  }}
                />
                <span>
                  <span className={isActive || isDone ? 'font-semibold' : 'text-db-muted'}>
                    {stage.label}
                  </span>
                  {isActive && stage.id === 'quality_review' && (
                    <span className="mt-1 block text-sm text-db-muted">{model.qualityReviewCopy}</span>
                  )}
                  {isActive && stage.id !== 'quality_review' && lastDetail && (
                    <span className="mt-1 block text-sm text-db-muted">{lastDetail}</span>
                  )}
                  {isActive && stage.id === 'digitizing' && !lastDetail && facts && facts.pagesDigitized > 0 && (
                    <span className="mt-1 block text-sm text-db-muted" data-testid="digitize-facts">
                      {facts.pagesDigitized.toLocaleString()} pages read so far, across {facts.documentsProcessed} of {facts.documentsTotal} documents
                    </span>
                  )}
                  {/* What's happening right now (upload_page_ux_review.md §2):
                      silence during a long stage reads as "nothing is
                      happening" — the panel explains, the feed proves. */}
                  {isActive && STAGE_EXPLAINERS[stage.id] && (
                    <span data-testid="stage-explainer" className="mt-2 block rounded-lg border border-db-line bg-db-surface p-3 text-sm text-db-muted">
                      {STAGE_EXPLAINERS[stage.id]}
                    </span>
                  )}
                  {isActive && stage.id === 'analyzing' && checksDone.length > 0 && (
                    <span data-testid="checks-feed" className="mt-2 block text-sm">
                      <span className="font-semibold">
                        {Math.min(checksDone.length, TOTAL_CHECKS)} of {TOTAL_CHECKS} checks finished
                      </span>
                      {checksDone.map((c) => (
                        <span key={c} className="mt-1 block text-db-muted">
                          ✓ Finished checking for {c}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {model?.delivered && (
        <p className="mt-6 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4">
          Your report is ready — check your email for the link.
        </p>
      )}

      <style>{`
        .db-breathe { animation: db-breathe 2s ease-in-out infinite; }
        @keyframes db-breathe { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @media (prefers-reduced-motion: reduce) { .db-breathe { animation: none } }
      `}</style>
    </main>
  )
}
