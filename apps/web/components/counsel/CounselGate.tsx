'use client'

/**
 * Gate for every (counsel) page (persona_rollout_plan.md §7 "Flags, not
 * branches"): while the seat and flags load, a quiet line; when
 * counsel_surfaces is off for the tenant — or `/counsel/me` itself answered
 * 404 — the same "Not available" page the api answers with; when the seat is
 * gone, the one sentence that says so. Otherwise the page.
 */
import NotAvailable from './NotAvailable'
import { useCounsel } from './CounselContext'

export default function CounselGate({ children }: { children: React.ReactNode }) {
  const { flags, seat } = useCounsel()
  if (seat === 'loading') {
    return <p className="py-10 text-sm text-db-muted" aria-live="polite" data-testid="counsel-loading">Loading…</p>
  }
  if (!flags.counsel_surfaces || seat === 'dark') return <NotAvailable />
  if (seat === 'gone') {
    return (
      <section data-testid="seat-gone" className="mx-auto max-w-xl py-16">
        <h1 className="font-db-serif text-3xl font-semibold">Your seat has been removed</h1>
        <p className="mt-3 text-db-muted">Your account is intact, but it no longer has a seat in an organisation. Ask the organisation owner to invite you again.</p>
      </section>
    )
  }
  if (seat === 'error') {
    return (
      <p role="alert" className="py-10" style={{ color: 'var(--db-urgent)' }}>
        We could not reach the service just now. Refresh the page; if it keeps happening, sign out and back in.
      </p>
    )
  }
  return <>{children}</>
}
