'use client'

/**
 * /counsel/record-desk — Record Desk requests (workstream I): the
 * organisation's requests with their status and the staff note, and the
 * form to file a new one (chronology, records tracker, other). In January
 * the Record Desk delivers by hand: a status, a structured chronology
 * (date · volume · page · what the record shows) and a process note. Behind
 * record_desk; prices are on request by design. The chronology describes
 * the record; it is not advice (UPL review 2026-10-23, P10).
 */
import { useCallback, useEffect, useState } from 'react'
import { fileInvestigationRequest, listInvestigationRequests, listMatters, type ChronologyDeliverable, type InvestigationRequestBody, type MatterSummary } from '@/lib/api'
import { useCounsel } from '@/components/counsel/CounselContext'
import NotAvailable from '@/components/counsel/NotAvailable'

interface Req { id: string; caseId: string | null; kind: InvestigationRequestBody['kind']; pages: number | null; dueBy: string | null; note: string; status: 'OPEN' | 'IN_PROGRESS' | 'DELIVERED' | 'DECLINED'; staffNote: string | null; deliverable?: ChronologyDeliverable | null; deliveredAt: string | null; createdAt: string }
const KIND_LABEL: Record<InvestigationRequestBody['kind'], string> = { CHRONOLOGY: 'Chronology', RECORDS_TRACKER: 'Records tracker', OTHER: 'Other' }
const STATUS_LABEL: Record<Req['status'], string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', DELIVERED: 'Delivered', DECLINED: 'Declined' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const field = 'mt-1 w-full rounded-lg border border-db-line bg-db-surface p-2.5 text-[15px]'

export default function RecordDeskPage() {
  const { me, flags } = useCounsel()
  const [requests, setRequests] = useState<Req[] | null>(null)
  const [matters, setMatters] = useState<MatterSummary[]>([])
  const [dark, setDark] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<{ kind: InvestigationRequestBody['kind']; caseId: string; pages: string; dueBy: string; note: string }>({ kind: 'CHRONOLOGY', caseId: '', pages: '', dueBy: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const r = await listInvestigationRequests()
    if (r.status === 404) return setDark(true)
    if (!r.ok) return setError('We could not load the requests just now. Refresh the page.')
    setRequests(((await r.json()) as { requests: Req[] }).requests)
    const m = await listMatters()
    if (m.ok) setMatters(((await m.json()) as { matters: MatterSummary[] }).matters)
  }, [])

  useEffect(() => {
    if (!flags.record_desk) return
    void load()
  }, [flags.record_desk, load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await fileInvestigationRequest({
        kind: form.kind,
        ...(form.caseId ? { caseId: form.caseId } : {}),
        ...(form.pages ? { pages: Number(form.pages) } : {}),
        ...(form.dueBy ? { dueBy: form.dueBy } : {}),
        note: form.note.trim(),
      })
      const body = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(body.error ?? 'Could not file the request.')
      setNotice('Request filed. The Record Desk answers with a quote and a delivery date; nothing is charged until you accept.')
      setForm({ kind: 'CHRONOLOGY', caseId: '', pages: '', dueBy: '', note: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file the request.')
    } finally {
      setBusy(false)
    }
  }

  if (!flags.record_desk || dark) return <NotAvailable what="The Record Desk" />
  if (error && !requests) return <p role="alert" className="py-10" style={{ color: 'var(--db-urgent)' }}>{error}</p>
  if (!requests) return <p className="py-10 text-sm text-db-muted">Loading…</p>

  const mayFile = me?.membership.role !== 'VIEWER'

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-db-serif text-3xl font-semibold">Record Desk</h1>
        <p className="mt-1 text-[15px] text-db-muted">A chronology or a records tracker built from the record by a person, cited to volume, page and line. Prices on request; the desk answers each request with a quote.</p>
      </div>
      {notice && <p role="status" data-testid="record-desk-notice" className="rounded-xl border border-db-line bg-db-surface p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>{error}</p>}

      {mayFile && (
        <form onSubmit={submit} className="rounded-xl border border-db-line bg-db-surface p-5" data-testid="record-desk-form">
          <h2 className="font-db-serif text-xl font-semibold">New request</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold">What</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as InvestigationRequestBody['kind'] })} className={field} aria-label="Kind of request">
                {(Object.keys(KIND_LABEL) as InvestigationRequestBody['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Matter (optional)</span>
              <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} className={field} aria-label="Matter">
                <option value="">Not tied to a matter</option>
                {matters.map((m) => <option key={m.caseId} value={m.caseId}>{m.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Pages, if known</span>
              <input type="number" min={1} value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Needed by</span>
              <input type="date" value={form.dueBy} onChange={(e) => setForm({ ...form, dueBy: e.target.value })} className={field} />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-semibold">What it is for</span>
            <textarea required rows={3} maxLength={4000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} aria-label="Note" />
          </label>
          <button type="submit" disabled={busy} className="mt-4 rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40" data-testid="record-desk-submit">
            {busy ? 'Filing…' : 'File the request'}
          </button>
        </form>
      )}

      <section>
        <h2 className="font-db-serif text-xl font-semibold">Requests</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-db-muted" data-testid="record-desk-empty">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-db-line rounded-xl border border-db-line bg-db-surface" data-testid="record-desk-list">
            {requests.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{KIND_LABEL[r.kind]}{r.caseId ? ` · ${matters.find((m) => m.caseId === r.caseId)?.title ?? 'a matter'}` : ''}</p>
                  <span className="rounded-full bg-db-accent-soft px-3 py-0.5 text-xs font-semibold">{STATUS_LABEL[r.status]}</span>
                </div>
                <p className="mt-1 text-sm text-db-muted">
                  Filed {day(r.createdAt)}{r.pages ? ` · ${r.pages.toLocaleString('en-US')} pages` : ''}{r.dueBy ? ` · needed by ${r.dueBy.slice(0, 10)}` : ''}{r.deliveredAt ? ` · delivered ${day(r.deliveredAt)}` : ''}
                </p>
                <p className="mt-1 text-sm">{r.note}</p>
                {r.deliverable && r.deliverable.entries.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-db-line" data-testid={`chronology-${r.id}`}>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-db-line text-xs uppercase tracking-wider text-db-muted">
                          <th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Volume</th><th className="px-3 py-2 font-semibold">Page</th><th className="px-3 py-2 font-semibold">What the record shows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.deliverable.entries.map((e, i) => (
                          <tr key={i} className="border-b border-db-line last:border-b-0 align-top">
                            <td className="whitespace-nowrap px-3 py-2 font-db-mono text-xs">{e.date}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-db-mono text-xs">{e.volume ?? ''}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-db-mono text-xs">{e.page ?? ''}</td>
                            <td className="px-3 py-2">{e.event}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.deliverable.note && <p className="border-t border-db-line px-3 py-2 text-sm text-db-muted">{r.deliverable.note}</p>}
                    <p className="border-t border-db-line px-3 py-2 text-xs text-db-muted">Built by a person from the record you sent, cited to volume and page. It describes the record; what to do with it is counsel&rsquo;s decision.</p>
                  </div>
                )}
                {r.staffNote && <p className="mt-2 rounded-lg bg-db-bg px-3 py-2 text-sm" data-testid={`process-note-${r.id}`}><span className="font-semibold">Process note:</span> {r.staffNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
