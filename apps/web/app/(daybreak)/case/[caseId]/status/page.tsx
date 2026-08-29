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
export default function CaseStatus() {
  const { caseId } = useParams<{ caseId: string }>()
  const [view, setView] = useState<CustomerView | null>(null)
  const [lastDetail, setLastDetail] = useState<string | null>(null)

  useEffect(() => {
    // Base state from the checklist endpoint, then live via SSE.
    void apiFetch(`/cases/${caseId}/checklist`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.customer && setView(d.customer))
      .catch(() => {})

    const es = apiEventSource(`/cases/${caseId}/progress`)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.customer) setView(msg.customer)
        // Honest sub-detail: counts only, from the registry-validated payload
        if (msg.type === 'screen.completed' && msg.payload?.volumesTotal) {
          setLastDetail(`Volume ${msg.payload.volumesRead} of ${msg.payload.volumesTotal} read`)
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
