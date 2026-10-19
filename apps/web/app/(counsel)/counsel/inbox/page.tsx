'use client'

/**
 * /counsel/inbox — the consented-packet inbox for CLINIC organisations
 * (workstream I, GET /counsel/inbox): deliveries newest first; open streams
 * report.pdf and stamps the first open. Behind clinic_inbox; a firm or an
 * office sees "Not available".
 */
import { useEffect, useState } from 'react'
import { clinicInboxPdfUrl, getClinicInbox } from '@/lib/api'
import { useCounsel } from '@/components/counsel/CounselContext'
import NotAvailable from '@/components/counsel/NotAvailable'

interface Item { id: string; caseId: string; caseRef: string; caseTitle: string; reportVersion: number | null; deliveredAt: string; openedAt: string | null; revoked: boolean }
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function InboxPage() {
  const { me, flags } = useCounsel()
  const [items, setItems] = useState<Item[] | null>(null)
  const [dark, setDark] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (me?.organisation.kind !== 'CLINIC' || !flags.clinic_inbox) return
    getClinicInbox()
      .then(async (r) => {
        if (r.status === 404 || r.status === 403) return setDark(true)
        if (!r.ok) throw new Error()
        setItems(((await r.json()) as { items: Item[] }).items)
      })
      .catch(() => setError('We could not load the inbox just now. Refresh the page.'))
  }, [me, flags.clinic_inbox])

  if (me && (me.organisation.kind !== 'CLINIC' || !flags.clinic_inbox || dark)) return <NotAvailable what="The packet inbox" />
  if (error) return <p role="alert" className="py-10" style={{ color: 'var(--db-urgent)' }}>{error}</p>
  if (!items) return <p className="py-10 text-sm text-db-muted">Loading…</p>

  return (
    <section>
      <h1 className="font-db-serif text-3xl font-semibold">Inbox</h1>
      <p className="mt-1 text-[15px] text-db-muted">Packets families have consented to share with this clinic. Opening one is recorded on the family&rsquo;s case; a withdrawn consent closes the packet.</p>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-db-line bg-db-surface p-5 text-db-muted" data-testid="inbox-empty">Nothing delivered yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-db-line rounded-xl border border-db-line bg-db-surface" data-testid="inbox-list">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{i.caseTitle} <span className="font-db-mono text-xs text-db-muted">{i.caseRef}</span></p>
                <p className="text-sm text-db-muted">
                  Delivered {when(i.deliveredAt)}{i.reportVersion ? ` · report v${i.reportVersion}` : ''}{i.openedAt ? ` · opened ${when(i.openedAt)}` : ' · not opened yet'}
                </p>
              </div>
              {i.revoked ? (
                <span className="text-sm" style={{ color: 'var(--db-urgent)' }}>Consent withdrawn</span>
              ) : (
                <a href={clinicInboxPdfUrl(i.id)} className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface">Open (PDF)</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
