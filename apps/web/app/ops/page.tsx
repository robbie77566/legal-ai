'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

/**
 * Ops overview (ops_console_redesign.md): answers J1 "is anything on fire?"
 * and J2 "is the system healthy?" BEFORE showing the queue. Health tiles
 * come from /ops/status (presence, never secrets); "Needs you now" is
 * holds (24h promise) + stalls + retention. The case drawer groups routine
 * actions from irreversible ones and requires the typed title to delete.
 */

interface Status {
  email: { configured: boolean; from: string | null }
  stripe: 'unset' | 'test' | 'live'
  autoApprove: boolean
  malwareScan: boolean
  sentry: boolean
  posthog: boolean
  pipeline: { awaitingDocs: number; digitizing: number; analyzing: number; held: number; ready: number }
  retentionCandidates: number
}
interface Hold { caseId: string; title: string; reasons: string[]; heldAt: string; slaRemainingHours: number }
interface QueueRow {
  id: string; title: string; status: string; lane: string | null
  daysInStage: number; stalled: boolean; ocrHalt: boolean; delayOurs: boolean; subsequentWrit: boolean
}
interface TimelineEvent { id: string; type: string; payload: Record<string, unknown>; actor: string; createdAt: string }
interface Cogs { totalUsd?: number; total?: number; [k: string]: unknown }

function Tile({ label, value, tone = 'ok', hint }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'neutral'; hint?: string }) {
  const color = tone === 'bad' ? '#F85149' : tone === 'warn' ? '#D29922' : tone === 'ok' ? '#3FB950' : '#8B949E'
  return (
    <div className="rounded border border-[#30363D] bg-[#0D1117] p-3" data-testid={`tile-${label.toLowerCase().replace(/\W+/g, '-')}`}>
      <div className="text-[11px] uppercase tracking-wider text-[#8B949E]">{label}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[#8B949E]">{hint}</div>}
    </div>
  )
}

const humanize = (type: string) => type.replace(/[._]/g, ' ')

export default function OpsOverview() {
  const [status, setStatus] = useState<Status | null>(null)
  const [holds, setHolds] = useState<Hold[]>([])
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [selected, setSelected] = useState<QueueRow | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [cogs, setCogs] = useState<Cogs | null>(null)
  const [notice, setNotice] = useState('')
  const [delayDate, setDelayDate] = useState('')
  const [deleteTyped, setDeleteTyped] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention'>('all')

  const loadAll = useCallback(async () => {
    const [s, h, q] = await Promise.all([apiFetch('/ops/status'), apiFetch('/qa/holds'), apiFetch('/ops/queue')])
    if (s.ok) setStatus(await s.json())
    if (h.ok) setHolds(await h.json())
    if (q.ok) setQueue(await q.json())
  }, [])
  useEffect(() => { void loadAll() }, [loadAll])

  const open = async (row: QueueRow) => {
    setSelected(row); setNotice(''); setDeleteTyped('')
    const [t, c] = await Promise.all([apiFetch(`/ops/cases/${row.id}/timeline`), apiFetch(`/ops/cases/${row.id}/cogs`)])
    if (t.ok) setTimeline(await t.json())
    setCogs(c.ok ? await c.json() : null)
  }

  const act = async (path: string, body?: unknown) => {
    if (!selected) return
    const res = await apiFetch(`/ops/cases/${selected.id}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${path}: done.` : `${path}: ${data.error ?? res.status}`)
    await loadAll()
    if (res.ok && path === 'delete') setSelected(null)
    else if (res.ok) await open(selected)
  }

  const rerun = async (caseId: string) => {
    const r = await apiFetch(`/qa/cases/${caseId}/rerun`, { method: 'POST' })
    setNotice(r.ok ? 'Re-run queued.' : 'Re-run failed.')
    await loadAll()
  }

  const stalled = queue.filter((c) => c.stalled || c.ocrHalt)
  const attention = holds.length + stalled.length + (status?.retentionCandidates ?? 0)
  const rows = filter === 'attention' ? queue.filter((c) => c.stalled || c.ocrHalt || c.delayOurs || c.status === 'QA_REVIEW') : queue
  const cogsUsd = cogs ? Number((cogs.totalUsd ?? cogs.total ?? 0) as number) : null

  return (
    <div>
      {notice && <p className="mb-3 text-sm text-[#D29922]">{notice}</p>}

      {/* J1 — needs you now */}
      <section data-testid="needs-you">
        <h2 className="font-serif text-lg font-bold text-[#D4AF37]">
          Needs you now {attention > 0 && <span className="ml-2 rounded bg-[#F85149]/20 px-2 text-sm text-[#F85149]">{attention}</span>}
        </h2>
        {attention === 0 && <p className="mt-2 text-sm text-[#8B949E]">Nothing is waiting on you — no holds, no stalls, no retention decisions.</p>}
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {holds.map((h) => (
            <div key={h.caseId} className="rounded border border-[#D29922]/60 bg-[#0D1117] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{h.title}</div>
                  <div className="mt-1 text-xs text-[#8B949E]">Held: {h.reasons.join(', ') || 'quality gate'}</div>
                </div>
                <span className={`whitespace-nowrap text-xs font-mono ${h.slaRemainingHours < 4 ? 'text-[#F85149]' : 'text-[#D29922]'}`}>
                  {h.slaRemainingHours <= 0 ? 'PROMISE MISSED' : `${h.slaRemainingHours}h left`}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void rerun(h.caseId)} className="rounded border border-[#D4AF37] px-2 py-1 text-xs text-[#D4AF37]">Re-run analysis</button>
                <Link href="/qa" className="rounded border border-[#30363D] px-2 py-1 text-xs text-[#8B949E]">Review in QA</Link>
              </div>
            </div>
          ))}
          {stalled.map((c) => (
            <button key={c.id} onClick={() => void open(c)} className="rounded border border-[#30363D] bg-[#0D1117] p-3 text-left">
              <div className="text-sm font-semibold">{c.title}</div>
              <div className="mt-1 text-xs text-[#8B949E]">
                {c.ocrHalt ? 'OCR halted — bad-scan cohort; decide re-scan vs proceed' : `Stalled ${c.daysInStage} days awaiting documents`}
              </div>
            </button>
          ))}
          {(status?.retentionCandidates ?? 0) > 0 && (
            <Link href="/ops/retention" className="rounded border border-[#30363D] bg-[#0D1117] p-3">
              <div className="text-sm font-semibold">{status!.retentionCandidates} case(s) past the 12-month retention window</div>
              <div className="mt-1 text-xs text-[#8B949E]">Each deletion is a deliberate, per-case decision →</div>
            </Link>
          )}
        </div>
      </section>

      {/* J2 — system health */}
      <section className="mt-8" data-testid="health">
        <h2 className="font-serif text-lg font-bold text-[#D4AF37]">System health</h2>
        {!status ? (
          <p className="mt-2 text-sm text-[#8B949E]">Loading…</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Tile label="Email" value={status.email.configured ? 'Resend configured' : 'NOT SENDING — logging only'} tone={status.email.configured ? 'ok' : 'bad'} hint={status.email.from ?? 'set RESEND_API_KEY on api'} />
              <button
                data-testid="email-test"
                onClick={() => void apiFetch('/ops/email-test', { method: 'POST' }).then(async (r) => {
                  const d = await r.json().catch(() => ({}))
                  setNotice(d.delivered ? `Test email delivered to ${d.to} (Resend id ${d.id}). Check the inbox.` : `Email test FAILED: ${d.error ?? r.status}`)
                })}
                className="mt-1 text-xs text-[#8B949E] underline hover:text-[#D4AF37]"
              >
                Send test email to me
              </button>
            </div>
            <Tile label="Stripe" value={status.stripe === 'live' ? 'LIVE — real money' : status.stripe === 'test' ? 'Test mode' : 'NOT CONFIGURED'} tone={status.stripe === 'live' ? 'ok' : status.stripe === 'test' ? 'warn' : 'bad'} />
            <Tile label="Auto-approve" value={status.autoApprove ? 'On — reports auto-deliver' : 'Off — every report waits for QA'} tone={status.autoApprove ? 'ok' : 'warn'} />
            <Tile label="Malware scan" value={status.malwareScan ? 'Armed' : 'NOT ARMED'} tone={status.malwareScan ? 'ok' : 'bad'} />
            <Tile label="Sentry" value={status.sentry ? 'Wired' : 'Off'} tone={status.sentry ? 'ok' : 'warn'} />
            <Tile label="PostHog" value={status.posthog ? 'Wired' : 'Off'} tone={status.posthog ? 'ok' : 'neutral'} />
            <Tile label="Pipeline" value={`${status.pipeline.awaitingDocs} docs · ${status.pipeline.digitizing} reading · ${status.pipeline.analyzing} analyzing`} tone="neutral" hint={`${status.pipeline.held} held · ${status.pipeline.ready} delivered`} />
            <div className="rounded border border-[#30363D] bg-[#0D1117] p-3">
              <div className="text-[11px] uppercase tracking-wider text-[#8B949E]">Utilities</div>
              <button
                data-testid="sentry-drill"
                onClick={() => void apiFetch('/ops/sentry-test').then((r) => setNotice(r.status === 500 ? 'Alert drill fired — check Sentry Issues and your alert email.' : `Unexpected ${r.status} — the drill should return 500.`))}
                className="mt-1 text-xs text-[#8B949E] underline hover:text-[#D29922]"
              >
                Fire Sentry alert drill
              </button>
              <button
                data-testid="reconcile-now"
                onClick={() => void apiFetch('/ops/reconcile-payments', { method: 'POST' }).then(async (r) => { const d = await r.json().catch(() => ({})); setNotice(r.ok ? `Reconciliation: ${d.checked} paid session(s) checked, ${d.healed} case(s) created.` : `Reconcile failed: ${r.status}`); await loadAll() })}
                className="mt-2 block text-xs text-[#8B949E] underline hover:text-[#D4AF37]"
              >
                Run payment reconciliation now
              </button>
            </div>
          </div>
        )}
      </section>

      {/* J3 — the queue + case drawer */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-[#D4AF37]">Cases</h2>
          <div className="flex gap-1 text-xs">
            {(['all', 'attention'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded px-2 py-1 ${filter === f ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>
                {f === 'all' ? `All (${queue.length})` : 'Needs attention'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_400px]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                <th className="py-2 pr-3">Case</th><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3">Days</th><th className="py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => void open(c)} className={`cursor-pointer border-b border-[#161B22] hover:bg-[#161B22] ${selected?.id === c.id ? 'bg-[#161B22]' : ''}`}>
                  <td className="py-2 pr-3">{c.title}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{c.status}</td>
                  <td className="py-2 pr-3 font-mono">{c.daysInStage}</td>
                  <td className="space-x-1 py-2">
                    {c.stalled && <span className="rounded bg-[#D29922]/20 px-1.5 text-xs text-[#D29922]">STALL</span>}
                    {c.ocrHalt && <span className="rounded bg-[#F85149]/20 px-1.5 text-xs text-[#F85149]">OCR</span>}
                    {c.delayOurs && <span className="rounded bg-[#3B82F6]/20 px-1.5 text-xs text-[#3B82F6]">DELAY-OURS</span>}
                    {c.subsequentWrit && <span className="rounded bg-[#D4AF37]/20 px-1.5 text-xs text-[#D4AF37]">§4</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-[#8B949E]">No cases{filter === 'attention' ? ' need attention' : ''}.</td></tr>}
            </tbody>
          </table>

          <div>
            {selected ? (
              <div className="rounded border border-[#30363D] bg-[#161B22] p-4" data-testid="case-drawer">
                <h3 className="font-semibold">{selected.title}</h3>
                <p className="mt-1 text-xs text-[#8B949E]">
                  {selected.status} · {selected.lane ?? 'lane —'} · {selected.daysInStage}d in stage
                  {cogsUsd !== null && <> · COGS <span className="font-mono">${cogsUsd.toFixed(2)}</span></>}
                </p>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-[#8B949E]">Routine</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input type="date" value={delayDate} onChange={(e) => setDelayDate(e.target.value)} className="rounded border border-[#30363D] bg-[#0B0E14] p-1.5 text-xs" />
                  <button onClick={() => void act('delay-ours', { extendedToDate: delayDate })} disabled={!delayDate} className="rounded border border-[#3B82F6] px-2 py-1 text-xs text-[#3B82F6] disabled:opacity-40">Mark delay ours</button>
                  {selected.delayOurs && <button onClick={() => void act('delay-cleared')} className="rounded border border-[#30363D] px-2 py-1 text-xs">Clear delay</button>}
                  <button
                    onClick={() => void apiFetch(`/ops/cases/${selected.id}/disclosure-archive`).then(async (r) => { const d = await r.json().catch(() => ({})); setNotice(r.ok ? `Archive: ${d.acknowledgments?.length ?? 0} acknowledgment(s) — see console.` : d.error ?? 'export failed'); if (r.ok) console.log('E-6 disclosure archive', d) })}
                    className="rounded border border-[#30363D] px-2 py-1 text-xs"
                  >
                    E-6 disclosure archive
                  </button>
                </div>

                <div className="mt-4 text-[11px] uppercase tracking-wider text-[#F85149]">Irreversible</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button onClick={() => { if (window.confirm('Issue a FULL refund for this case?')) void act('refund', { reason: 'customer_request' }) }} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]">Refund</button>
                  <input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="type the case title to enable delete" className="w-56 rounded border border-[#30363D] bg-[#0B0E14] p-1.5 font-mono text-xs" data-testid="delete-typed" />
                  <button
                    onClick={() => void act('delete')}
                    disabled={deleteTyped.trim() !== selected.title}
                    className="rounded border border-[#F85149] px-2 py-1 text-xs text-[#F85149] disabled:opacity-40"
                    data-testid="delete-case"
                  >
                    Delete (OPS-4)
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[#8B949E]">Deletion removes case content; the payment ledger, disclosure archive, and event skeleton are retained by design.</p>

                <h4 className="mt-5 text-[11px] uppercase tracking-wider text-[#8B949E]">Timeline (newest first)</h4>
                <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs">
                  {[...timeline].reverse().map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="shrink-0 text-[#8B949E]">{new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      <span className="text-[#D4AF37]">{humanize(e.type)}</span>
                      <span className="truncate text-[#8B949E]">{e.actor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[#8B949E]">Select a case for its timeline, cost, and actions.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
