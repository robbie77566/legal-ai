'use client'

/**
 * Case file (staff_console_access_model §5): everything customer-facing about
 * one case — uploads, the analysis, and what the family has received — with
 * the timeline beside it. Support's main surface; Admins get the same page.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiFetch, API_URL } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

interface CaseFile {
  case: {
    id: string; title: string; status: string; lane: string | null; subsequentWrit: boolean
    ocrHalt: boolean; delayOurs: boolean; expectedReadyAt: string | null; createdAt: string
    customerEmail: string | null; customerName: string | null
  }
  meter: { billable: number; duplicatesIgnored: number }
  documents: Array<{
    id: string; filename: string; receivedAt: string; pages: number; billablePages: number
    ocrProvider: string | null; minOcrConfidence: number | null; recognized: boolean
    classificationConfirmed: boolean; quarantined: boolean; downloadable: boolean
  }>
  runs: Array<{
    id: string; runNo: number; startedAt: string; completedAt: string | null; screensDone: string[]
    findings: Array<{
      id: string; category: string; severity: string; confidence: number; adjudication: string; provenance: string
      partAText: string; partBText: string; citations: Array<{ volume: string | null; page: number | null; line: number | null; excerpt: string }>
    }>
  }>
  reports: Array<{ id: string; versionNo: number; templateVersion: string; renderedAt: string; approvedByEmail: string; findingsCount: number }>
  notes: Array<{ id: string; channel: string; body: string; authorEmail: string; createdAt: string }>
  requests: { open: RequestRow[]; decided: RequestRow[] }
  shareLinks: Array<{ id: string; createdAt: string; expiresAt: string; revokedAt: string | null; opens: number; lastOpenedAt: string | null }>
}
interface TimelineEvent { id: string; type: string; actor: string; createdAt: string }
interface RequestRow {
  id: string; type: 'REFUND' | 'CASE_DELETE' | 'ACCOUNT_DELETE'; reason: string; note: string | null; amountCents: number | null
  requestedByEmail: string; decision: 'APPROVED' | 'DECLINED' | null; decidedByEmail: string | null; decisionNote: string | null
  createdAt: string; decidedAt: string | null
}
const REQUEST_LABEL: Record<RequestRow['type'], string> = { REFUND: 'Refund', CASE_DELETE: 'Case deletion', ACCOUNT_DELETE: 'Account deletion' }
const REFUND_REASONS: Array<[string, string]> = [['unreadable_record', 'Unreadable record'], ['customer_request', 'Customer request'], ['chargeback', 'Chargeback settled'], ['other', 'Other']]
const DELETE_REASONS: Array<[string, string]> = [['customer_request', 'Customer asked'], ['duplicate', 'Duplicate case'], ['retention', 'Past retention'], ['other', 'Other']]
const CHANNELS: Array<[string, string]> = [['email', 'Email'], ['phone', 'Phone'], ['chat', 'Chat'], ['internal', 'Internal note']]

// Plain-language screen names, as the family's status page words them.
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
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const humanize = (s: string) => s.replace(/[._]/g, ' ')

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'blue' | 'gold' }) {
  const color = { muted: '#8B949E', ok: '#3FB950', warn: '#D29922', bad: '#F85149', blue: '#3B82F6', gold: '#D4AF37' }[tone]
  return <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ color }}>{children}</span>
}

export default function CaseFilePage() {
  const { caseId } = useParams<{ caseId: string }>()
  const role = useStaffRole()
  const [file, setFile] = useState<CaseFile | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [notice, setNotice] = useState('')
  const [delayDate, setDelayDate] = useState('')
  const [missing, setMissing] = useState(false)
  const [noteChannel, setNoteChannel] = useState('email')
  const [noteBody, setNoteBody] = useState('')
  const [asking, setAsking] = useState<RequestRow['type'] | null>(null)
  const [askReason, setAskReason] = useState('')
  const [askNote, setAskNote] = useState('')
  const [declining, setDeclining] = useState<{ id: string; note: string } | null>(null)

  const decide = async (id: string, decision: 'APPROVED' | 'DECLINED', decisionNote?: string) => {
    const res = await apiFetch(`/ops/requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, ...(decisionNote ? { decisionNote } : {}) }) })
    const d = await res.json().catch(() => ({}))
    setNotice(res.ok ? (decision === 'APPROVED' ? 'Approved — done under your name.' : 'Declined; the requester can see why.') : d.error ?? `Decision failed (${res.status})`)
    setDeclining(null)
    await load()
  }

  const load = useCallback(async () => {
    const [f, t] = await Promise.all([apiFetch(`/ops/cases/${caseId}/file`), apiFetch(`/ops/cases/${caseId}/timeline`)])
    if (f.ok) setFile(await f.json()); else setMissing(true)
    if (t.ok) setTimeline(await t.json())
  }, [caseId])
  useEffect(() => { void load() }, [load])

  const act = async (path: string, body?: unknown) => {
    const res = await apiFetch(`/ops/cases/${caseId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${humanize(path)}: done.` : d.error ?? `${path} failed (${res.status})`)
    await load()
  }

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await apiFetch(`/ops/cases/${caseId}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: noteChannel, body: noteBody.trim() }) })
    const d = await res.json().catch(() => ({}))
    setNotice(res.ok ? 'Note added to the case file.' : d.error ?? 'Could not add the note')
    if (res.ok) { setNoteBody(''); await load() }
  }

  const ask = async () => {
    if (!asking || !askReason) return
    const res = await apiFetch(`/ops/cases/${caseId}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: asking, reason: askReason, ...(askNote.trim() ? { note: askNote.trim() } : {}) }) })
    const d = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${REQUEST_LABEL[asking]} request sent — an admin will decide and you'll see the outcome here and on Overview.` : d.error ?? 'Could not send the request')
    if (res.ok) { setAsking(null); setAskReason(''); setAskNote(''); await load() }
  }

  const download = async (docId: string) => {
    const res = await apiFetch(`/ops/cases/${caseId}/documents/${docId}/download`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setNotice(d.error ?? 'Download failed'); return }
    window.location.href = d.url
  }

  if (missing) return <p className="text-sm text-[#8B949E]">No case with that id.</p>
  if (!file) return <p className="text-sm text-[#8B949E]">Loading the case file…</p>
  const c = file.case
  const running = ['DIGITIZING', 'DOCS_COMPLETE', 'ANALYZING', 'ADJUDICATING'].includes(c.status)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#8B949E]"><Link href="/ops" className="underline">Overview</Link> / Case file</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-xl font-bold text-[#D4AF37]" data-testid="case-title">{c.title}</h1>
            <Chip tone="gold">{c.status}</Chip>
            {c.delayOurs && <Chip tone="bad">DELAY-OURS</Chip>}
            {c.ocrHalt && <Chip tone="warn">OCR HALT</Chip>}
            {c.subsequentWrit && <Chip>§4</Chip>}
          </div>
          <p className="mt-1 text-xs text-[#8B949E]" data-testid="case-meta">
            {c.customerEmail ?? 'no customer on file'}{c.customerName ? ` (${c.customerName})` : ''} · {c.lane ?? 'lane —'} · created {when(c.createdAt)}
            {c.expectedReadyAt && <> · promised {new Date(c.expectedReadyAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={delayDate} onChange={(e) => setDelayDate(e.target.value)} className="rounded border border-[#30363D] bg-[#0B0E14] p-1.5 text-xs" aria-label="New promise date" />
          <button onClick={() => void act('delay-ours', { extendedToDate: delayDate })} disabled={!delayDate} className="rounded border border-[#3B82F6] px-2 py-1 text-xs text-[#3B82F6] disabled:opacity-40">Mark delay ours</button>
          {c.delayOurs && <button onClick={() => void act('delay-cleared')} className="rounded border border-[#30363D] px-2 py-1 text-xs">Clear delay</button>}
          {running && <button onClick={() => void act('resume')} className="rounded border border-[#3B82F6] px-2 py-1 text-xs text-[#3B82F6]">Resume stuck pipeline</button>}
          {role === 'ADMIN' && <Link href={`/ops/money?case=${c.id}`} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]">Refund…</Link>}
          {role === 'SUPPORT' && (
            <>
              <button onClick={() => { setAsking('REFUND'); setAskReason('') }} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]" data-testid="request-refund">Request refund</button>
              <button onClick={() => { setAsking('CASE_DELETE'); setAskReason('') }} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]" data-testid="request-deletion">Request deletion</button>
            </>
          )}
        </div>
      </div>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      {asking && (
        <div className="mt-3 rounded border border-[#D29922] bg-[#0D1117] p-3" data-testid="request-form">
          <div className="text-sm font-semibold">Ask an admin for a {REQUEST_LABEL[asking].toLowerCase()}</div>
          <p className="mt-1 text-xs text-[#8B949E]">{asking === 'REFUND' ? 'Refunds' : 'Deletions'} need an Admin. Your request lands in their approvals with your reason attached; you will see the decision here.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-[#8B949E]">Reason
              <select value={askReason} onChange={(e) => setAskReason(e.target.value)} aria-label="Request reason" className="mt-1 block rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs text-[#E6EDF3]">
                <option value="">Pick one…</option>
                {(asking === 'REFUND' ? REFUND_REASONS : DELETE_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex-1 text-xs text-[#8B949E]">What the family told you
              <input value={askNote} onChange={(e) => setAskNote(e.target.value)} aria-label="Request note" className="mt-1 block w-full rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs text-[#E6EDF3]" />
            </label>
            <button onClick={() => void ask()} disabled={!askReason} className="rounded bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid="request-send">Send to an admin</button>
            <button onClick={() => setAsking(null)} className="rounded border border-[#30363D] px-3 py-1.5 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {(file.requests.open.length > 0 || file.requests.decided.length > 0) && (
        <div className="mt-3 rounded border border-[#30363D] bg-[#161B22] text-xs" data-testid="requests">
          {file.requests.open.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-[#21262D] px-3 py-2 last:border-b-0">
              <Chip tone="warn">{role === 'ADMIN' ? 'NEEDS YOUR DECISION' : 'WAITING ON AN ADMIN'}</Chip>
              <span className="min-w-0 flex-1 truncate"><strong>{REQUEST_LABEL[r.type]}</strong>{r.amountCents ? ` · $${(r.amountCents / 100).toFixed(2)}` : ''} · {r.reason.replace(/_/g, ' ')}{r.note ? ` · “${r.note}”` : ''} · {r.requestedByEmail.split('@')[0]}, {when(r.createdAt)}</span>
              {role === 'ADMIN' && (declining?.id === r.id ? (
                <span className="flex gap-2">
                  <input value={declining.note} onChange={(e) => setDeclining({ id: r.id, note: e.target.value })} placeholder="Say why — the requester reads this" aria-label="Decline reason" className="w-64 rounded border border-[#30363D] bg-[#0D1117] p-1 text-xs" />
                  <button onClick={() => void decide(r.id, 'DECLINED', declining.note)} disabled={!declining.note.trim()} className="rounded border border-[#30363D] px-2 py-0.5 disabled:opacity-40">Decline</button>
                </span>
              ) : (
                <span className="flex gap-2">
                  <button onClick={() => setDeclining({ id: r.id, note: '' })} className="rounded border border-[#30363D] px-2 py-0.5">Decline…</button>
                  <button onClick={() => { if (window.confirm(`Approve this ${REQUEST_LABEL[r.type].toLowerCase()}? It runs now, under your name.`)) void decide(r.id, 'APPROVED') }} className="rounded border border-[#F85149] px-2 py-0.5 text-[#F85149]" data-testid={`approve-${r.id}`}>Approve</button>
                </span>
              ))}
            </div>
          ))}
          {file.requests.decided.slice(0, 3).map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-[#21262D] px-3 py-2 last:border-b-0">
              <Chip tone={r.decision === 'APPROVED' ? 'ok' : 'muted'}>{r.decision}</Chip>
              <span className="min-w-0 flex-1 truncate"><strong>{REQUEST_LABEL[r.type]}</strong> · {r.reason.replace(/_/g, ' ')} · decided by {r.decidedByEmail?.split('@')[0]} {r.decidedAt ? when(r.decidedAt) : ''}{r.decisionNote ? ` — “${r.decisionNote}”` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section data-testid="files">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Uploaded files · {file.documents.length}</h2>
              <span className="text-xs text-[#8B949E]">{file.meter.billable} billable pages · {file.meter.duplicatesIgnored} duplicates ignored · quarantined files are hidden from the family but listed here</span>
            </div>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                  <th className="py-2">File</th><th>Received</th><th className="text-right">Pages</th><th className="text-right">Billable</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {file.documents.map((d) => (
                  <tr key={d.id} className="border-b border-[#21262D]">
                    <td className={`py-2 font-semibold ${d.quarantined ? 'text-[#8B949E]' : ''}`}>{d.filename}</td>
                    <td className="font-mono text-xs text-[#8B949E]">{when(d.receivedAt)}</td>
                    <td className="text-right font-mono tabular-nums">{d.pages || '—'}</td>
                    <td className="text-right font-mono tabular-nums">{d.pages ? d.billablePages : '—'}</td>
                    <td>
                      {d.quarantined ? <Chip tone="bad">QUARANTINED</Chip>
                        : d.pages === 0 ? <Chip tone="warn">NOT READ YET</Chip>
                        : d.minOcrConfidence != null && d.minOcrConfidence < 0.6 ? <Chip tone="warn">OCR · {Math.round(d.minOcrConfidence * 100)}% confidence</Chip>
                        : <Chip tone="ok">READ · {d.ocrProvider ?? 'text'}</Chip>}
                      {d.recognized && <span className="ml-2 text-xs text-[#8B949E]">recognized{d.classificationConfirmed ? ' · confirmed' : ''}</span>}
                    </td>
                    <td className="text-right">
                      {d.downloadable
                        ? <button onClick={() => void download(d.id)} className="rounded border border-[#30363D] px-2 py-1 text-xs" data-testid={`download-${d.id}`}>Download</button>
                        : <span className="text-xs text-[#8B949E]">not downloadable</span>}
                    </td>
                  </tr>
                ))}
                {file.documents.length === 0 && <tr><td colSpan={6} className="py-3 text-sm text-[#8B949E]">Nothing uploaded yet.</td></tr>}
              </tbody>
            </table>
          </section>

          <section data-testid="analysis">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Analysis · {file.runs.length ? `${file.runs.length} run${file.runs.length > 1 ? 's' : ''}` : 'not started'}</h2>
            {file.runs.map((run) => (
              <div key={run.id} className="mt-2 rounded border border-[#30363D] bg-[#161B22]">
                <div className="flex flex-wrap items-center gap-2 border-b border-[#30363D] px-3 py-2 text-xs text-[#8B949E]">
                  <span className="font-semibold text-[#E6EDF3]">Run {run.runNo}</span>
                  <span>started {when(run.startedAt)}</span>
                  <span>· {run.completedAt ? `finished ${when(run.completedAt)}` : 'not finished'}</span>
                  <span>· {run.findings.length} finding{run.findings.length === 1 ? '' : 's'}</span>
                </div>
                {run.screensDone.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-b border-[#30363D] px-3 py-2">
                    {run.screensDone.map((s) => <Chip key={s} tone="ok">✓ {SCREEN_NAMES[s] ?? humanize(s)}</Chip>)}
                  </div>
                )}
                {run.findings.map((f) => (
                  <article key={f.id} className="space-y-2 border-b border-[#21262D] px-3 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="blue">{humanize(f.category).toUpperCase()}</Chip>
                      <Chip tone={f.severity === 'dispositive' ? 'bad' : f.severity === 'supportive' ? 'warn' : 'muted'}>{f.severity === 'dispositive' ? 'STRONG SIGNAL' : f.severity === 'supportive' ? 'POSSIBLE ISSUE' : 'BACKGROUND'}</Chip>
                      <Chip>conf {Math.round(f.confidence * 100)}%</Chip>
                      {f.adjudication === 'disagree' && <Chip tone="bad">ADJUDICATION DISAGREES</Chip>}
                      {f.provenance === 'ai_human_edited' && <Chip tone="ok">edited by a reviewer</Chip>}
                    </div>
                    <p className="text-sm" data-testid="part-a">{f.partAText}</p>
                    {f.citations.map((ci, i) => (
                      <div key={i}>
                        <blockquote className="rounded bg-[#FDF6E3] px-3 py-2 font-serif text-xs leading-relaxed text-[#586E75]">“{ci.excerpt}”</blockquote>
                        <p className="mt-1 font-mono text-xs text-[#8B949E]">{ci.volume ?? 'record'}{ci.page != null ? ` p. ${ci.page}` : ''}{ci.line != null ? ` l. ${ci.line}` : ''}</p>
                      </div>
                    ))}
                    <details className="text-xs text-[#8B949E]">
                      <summary className="cursor-pointer">For the lawyer (Part B)</summary>
                      <p className="mt-1 text-[#E6EDF3]">{f.partBText}</p>
                    </details>
                  </article>
                ))}
                {run.findings.length === 0 && <p className="px-3 py-3 text-sm text-[#8B949E]">No findings recorded for this run{run.completedAt ? '' : ' yet'}.</p>}
              </div>
            ))}
            {file.runs.length > 0 && <p className="mt-2 text-xs text-[#8B949E]">Findings here are the working analysis. What the family actually received is the approved report below — they can differ if a reviewer edited or removed something.</p>}
            {file.runs.length === 0 && <p className="mt-2 text-sm text-[#8B949E]">Analysis has not started. It begins once the family marks their records complete.</p>}
          </section>

          <section data-testid="deliverables">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">What the family has received</h2>
            <div className="mt-2 rounded border border-[#30363D] bg-[#161B22]">
              {file.reports.length ? file.reports.map((r) => (
                <div key={r.id} className="flex items-center gap-3 border-b border-[#21262D] px-3 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">Report v{r.versionNo}{r.versionNo === file.reports[0].versionNo ? ' — current' : ''}</div>
                    <div className="text-xs text-[#8B949E]">released {when(r.renderedAt)} · approved by {r.approvedByEmail} · {r.findingsCount} finding{r.findingsCount === 1 ? '' : 's'} · template {r.templateVersion}</div>
                  </div>
                  <a href={`${API_URL}/ops/cases/${c.id}/report/pdf?version=${r.versionNo}`} className="rounded bg-[#D4AF37] px-2 py-1 text-xs font-semibold text-[#0B0E14]" data-testid={`report-pdf-${r.versionNo}`}>Download the family&apos;s PDF</a>
                </div>
              )) : (
                <div className="px-3 py-3">
                  <div className="font-semibold">Report — not yet released</div>
                  <div className="text-xs text-[#8B949E]">Appears here the moment a reviewer approves it, with every version kept.</div>
                </div>
              )}
              <div className="border-t border-[#21262D] px-3 py-3">
                <div className="font-semibold">Attorney packet link</div>
                {file.shareLinks.length ? file.shareLinks.map((s) => (
                  <div key={s.id} className="text-xs text-[#8B949E]">
                    Created {when(s.createdAt)} · {s.revokedAt ? `revoked ${when(s.revokedAt)}` : `expires ${when(s.expiresAt)}`} · opened {s.opens} time{s.opens === 1 ? '' : 's'}{s.lastOpenedAt ? `, last ${when(s.lastOpenedAt)}` : ''}
                  </div>
                )) : <div className="text-xs text-[#8B949E]">Not created — the family can make one from Next steps once the report is out.</div>}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section data-testid="contact-log">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Contact log · {file.notes.length}</h2>
            <form onSubmit={(e) => void addNote(e)} className="mt-2 space-y-2 rounded border border-[#30363D] bg-[#0D1117] p-3">
              <div className="flex gap-2">
                <select value={noteChannel} onChange={(e) => setNoteChannel(e.target.value)} aria-label="Contact channel" className="rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs text-[#E6EDF3]">
                  {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button disabled={!noteBody.trim()} className="ml-auto rounded bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid="add-note">Add note</button>
              </div>
              <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} placeholder="What the family said, what you told them" aria-label="Note" className="block w-full rounded border border-[#30363D] bg-[#161B22] p-2 text-xs text-[#E6EDF3]" />
            </form>
            <ul className="mt-2 space-y-2 text-xs">
              {file.notes.map((n) => (
                <li key={n.id} className="rounded border border-[#30363D] bg-[#161B22] p-2">
                  <div className="flex gap-2 text-[#8B949E]"><span className="font-mono">{when(n.createdAt)}</span><Chip>{n.channel.toUpperCase()}</Chip><span className="truncate">{n.authorEmail.split('@')[0]}</span></div>
                  <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
              {file.notes.length === 0 && <li className="text-[#8B949E]">No contact recorded yet.</li>}
            </ul>
          </section>

          <section>
          <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Timeline (newest first)</h2>
          <ul className="mt-2 space-y-1 rounded border border-[#30363D] bg-[#161B22] p-3 text-xs" data-testid="timeline">
            {[...timeline].reverse().map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="shrink-0 font-mono text-[#8B949E]">{when(e.createdAt)}</span>
                <span className="text-[#D4AF37]">{humanize(e.type)}</span>
                <span className="truncate text-[#8B949E]">{e.actor}</span>
              </li>
            ))}
            {timeline.length === 0 && <li className="text-[#8B949E]">No events yet.</li>}
          </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
