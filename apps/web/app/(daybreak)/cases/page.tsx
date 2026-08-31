'use client'

/**
 * S8 — "Your reviews" (US-11): the signed-in family home. One account,
 * any number of reviews; one primary action per card by stage.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../../lib/api'

interface CaseRow {
  id: string
  title: string
  status: string
  stage: { stage: string; overlay?: string }
  expectedReadyAt: string | null
  createdAt: string
}

function primaryAction(c: CaseRow): { href: string; label: string } {
  if (c.status === 'READY' || c.status === 'DELIVERED') return { href: `/case/${c.id}/report`, label: 'See your report' }
  if (c.status === 'AWAITING_DOCS') return { href: `/case/${c.id}/documents`, label: 'Continue your checklist' }
  return { href: `/case/${c.id}/status`, label: 'Watch progress' }
}

export default function YourReviews() {
  const [cases, setCases] = useState<CaseRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void apiFetch('/cases/summary')
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/auth/signin?callbackUrl=/cases'
          return
        }
        if (!r.ok) throw new Error('load failed')
        setCases(await r.json())
      })
      .catch(() => setError('We could not load your reviews just now. Please refresh.'))
  }, [])

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-3xl font-semibold">Your reviews</h1>
      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: 'var(--db-urgent)' }}>{error}</p>
      )}
      {cases && cases.length === 0 && (
        <p className="mt-4 text-db-muted">No reviews yet — the free check below is where every review starts.</p>
      )}
      <div className="mt-6 space-y-4">
        {cases?.map((c) => {
          const action = primaryAction(c)
          return (
            <div key={c.id} data-testid="case-card" className="rounded-xl border border-db-line bg-db-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-db-serif text-lg font-semibold">{c.title}</h2>
                <span className="whitespace-nowrap rounded-full bg-db-accent-soft px-3 py-1 text-xs font-semibold text-db-accent">
                  {c.stage.stage.replace(/_/g, ' ')}
                </span>
              </div>
              {c.expectedReadyAt && !['READY', 'DELIVERED'].includes(c.status) && (
                <p className="mt-1 text-sm text-db-muted">Expected by {new Date(c.expectedReadyAt).toDateString()}</p>
              )}
              <Link
                href={action.href}
                className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface"
              >
                {action.label}
              </Link>
            </div>
          )
        })}
      </div>
      <div className="mt-10 border-t border-db-line pt-6">
        <p className="text-db-muted">Another loved one, or a different conviction?</p>
        <Link href="/check" className="mt-3 inline-block rounded-xl border-2 border-db-accent px-5 py-3 font-semibold text-db-accent">
          Start another review — free 2-minute check
        </Link>
      </div>
    </main>
  )
}
