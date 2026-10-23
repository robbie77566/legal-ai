'use client'

/**
 * /counsel — the professional's home (persona_rollout_plan.md §5 F): the
 * organisation's matters (title, vehicle, status in professional wording,
 * record bucket, opened), "Open a matter", the first-time empty state, and
 * the allowance or credits summary when the organisation has one. The
 * allowance and credit reads sit behind counsel_checkout and simply do not
 * render while that flag is dark.
 *
 * The lawyer gate (UPL review 2026-10-23, P1 + P2): /counsel/me says whether
 * this seat passes it. A pending or rejected bar number, or an investigator
 * or viewer seat, reads one banner sentence and never sees "Open a matter";
 * the api refuses the POST anyway — the page only decides what to render.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllowance, listCredits, listMatters, type MatterSummary } from '@/lib/api'
import { BUCKET_LABEL, lawyerGateMessage, professionalStatus } from '@/lib/counsel'
import { useCounsel } from '@/components/counsel/CounselContext'

interface Allowance { kind: 'PILOT' | 'PUBLIC_INTEREST' | 'OFFICE'; granted: number; used: number; remaining: number; resetsAt: string | null; pilot: boolean }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function CounselHome() {
  const { me, flags } = useCounsel()
  const [matters, setMatters] = useState<MatterSummary[] | null>(null)
  const [error, setError] = useState('')
  const [allowance, setAllowance] = useState<Allowance | null>(null)
  const [credits, setCredits] = useState<{ live: number } | null>(null)

  useEffect(() => {
    listMatters()
      .then(async (r) => {
        if (!r.ok) throw new Error()
        setMatters(((await r.json()) as { matters: MatterSummary[] }).matters)
      })
      .catch(() => setError('We could not load your matters just now. Refresh the page.'))
  }, [])

  useEffect(() => {
    if (!flags.counsel_checkout) return
    void getAllowance().then(async (r) => { if (r.ok) setAllowance(((await r.json()) as { allowance: Allowance | null }).allowance) }).catch(() => {})
    void listCredits().then(async (r) => { if (r.ok) setCredits((await r.json()) as { live: number }) }).catch(() => {})
  }, [flags.counsel_checkout])

  const canOpen = me?.lawyerSeat === true
  const gate = lawyerGateMessage(me)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-db-muted">{me?.organisation.name}</p>
          <h1 className="mt-1 font-db-serif text-3xl font-semibold">Matters</h1>
        </div>
        {canOpen && (
          <Link href="/counsel/matters/new" className="rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface" data-testid="open-matter">
            Open a matter
          </Link>
        )}
      </div>

      {gate && (
        <p role="status" data-testid="lawyer-gate-banner" className="mt-5 rounded-xl border border-db-line bg-db-accent-soft px-4 py-3 text-[15px]">
          {gate}
        </p>
      )}

      {(allowance || (credits && credits.live > 0)) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2" data-testid="allowance-summary">
          {allowance && (
            <div className="rounded-xl border border-db-line bg-db-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">
                {allowance.pilot ? 'Pilot allowance' : allowance.kind === 'PUBLIC_INTEREST' ? 'Public-interest allowance' : 'Office allowance'}
              </p>
              <p className="mt-1 font-db-serif text-2xl font-semibold">
                {allowance.remaining} of {allowance.granted} records left
              </p>
              {allowance.resetsAt && <p className="text-sm text-db-muted">{allowance.pilot ? 'Pilot ends' : 'Renews'} {day(allowance.resetsAt)}</p>}
            </div>
          )}
          {credits && credits.live > 0 && (
            <div className="rounded-xl border border-db-line bg-db-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">Pack credits</p>
              <p className="mt-1 font-db-serif text-2xl font-semibold">{credits.live} unused</p>
              <p className="text-sm text-db-muted">Spent automatically when a record of that rung or lower is quoted.</p>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-6" style={{ color: 'var(--db-urgent)' }}>{error}</p>}
      {matters === null && !error && <p className="mt-6 text-sm text-db-muted">Loading…</p>}

      {matters && matters.length === 0 && (
        <div className="mt-6 rounded-xl border border-db-line bg-db-surface p-6" data-testid="matters-empty">
          <h2 className="font-db-serif text-xl font-semibold">No matters yet</h2>
          <p className="mt-2 text-[15px] text-db-muted">
            A matter is one record: the vehicle you are filing under, the county and cause number, the client&rsquo;s initials — never a name — and the dates the clock runs from. Open it, upload the volumes, and the page meter prices the record before anything runs.
          </p>
          {canOpen ? (
            <Link href="/counsel/matters/new" className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface">
              Open your first matter
            </Link>
          ) : (
            <p className="mt-4 text-sm text-db-muted">{gate ?? 'This seat reads matters; an attorney or the owner opens one.'}</p>
          )}
        </div>
      )}

      {matters && matters.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-db-line bg-db-surface">
          <table className="w-full text-left text-[15px]" data-testid="matters-table">
            <thead>
              <tr className="border-b border-db-line text-xs uppercase tracking-wider text-db-muted">
                <th className="px-4 py-3 font-semibold">Matter</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Opened</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => (
                <tr key={m.matterId} className="border-b border-db-line last:border-b-0" data-testid="matter-row">
                  <td className="px-4 py-3">
                    <Link href={`/counsel/matters/${m.caseId}`} className="font-semibold underline">{m.title}</Link>
                    <div className="text-sm text-db-muted">{[m.county && `${m.county} County`, m.causeNumber].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-4 py-3">{m.vehicleLabel}</td>
                  <td className="px-4 py-3">{professionalStatus(m.status)}</td>
                  <td className="px-4 py-3 text-sm">{m.bucket ? BUCKET_LABEL[m.bucket] ?? m.bucket : <span className="text-db-muted">Not metered yet</span>}</td>
                  <td className="px-4 py-3 text-sm text-db-muted">{day(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
