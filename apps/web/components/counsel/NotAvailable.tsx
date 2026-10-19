/**
 * The dark-surface page (staff_console.md §10): the same answer the api
 * gives — 404 "Not available" — so a surface that has not launched for this
 * organisation does not confirm it exists. Rendered by CounselGate on every
 * (counsel) page when counsel_surfaces is off for the tenant, and by a page
 * whose own flag (offices, clinic_inbox, record_desk, counsel_checkout) is off.
 */
export default function NotAvailable({ what = 'This page' }: { what?: string }) {
  return (
    <section data-testid="not-available" className="mx-auto max-w-xl py-16 text-center">
      <p className="font-db-mono text-sm text-db-muted">404</p>
      <h1 className="mt-2 font-db-serif text-3xl font-semibold">Not available</h1>
      <p className="mt-3 text-db-muted">{what} is not available for your organisation yet.</p>
    </section>
  )
}
