'use client'

/**
 * Eval gate (persona_rollout_plan.md §5 J, §7 "What runs on staging" item 2,
 * §8): every attorney ledger run on the production model and prompt set,
 * scored against the ledger's canaries, the cost per record bucket written
 * down. The weekly GitHub workflow and this page read the same rows; a red
 * gate blocks promotion (plan §7). "Run now" is the same POST the workflow
 * sends. ADMIN only (the api refuses Support).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

type Bucket = 'SHORT' | 'STANDARD' | 'EXTENDED' | 'LONG'
interface RunSummary {
  mustFindTotal: number
  found: number
  missed: string[]
  recall: number | null
  precision: number | null
  droppedAtVerification: number | null
  model: string | null
  promptSet: string | null
  promptHash: string | null
  findings: number | null
  margin: number | null
  priceCents: number | null
  bucketNote: string | null
}
interface EvalRun {
  id: string
  ledger: string
  caseId: string
  runId: string | null
  status: 'QUEUED' | 'RUNNING' | 'SCORED' | 'FAILED'
  pass: boolean | null
  reasons: string[]
  bucket: Bucket | null
  meteredPages: { reporter: number; clerk: number; exhibit: number; unknown: number } | null
  costCents: number | null
  error: string | null
  triggeredBy: string
  startedAt: string
  finishedAt: string | null
  summary: RunSummary | null
}
interface Ledger { name: string; caseTitle: string; provenance: string; mustFind: number; verdicts: number }
interface Listing {
  runs: EvalRun[]
  costPerBucket: Record<Bucket, { n: number; meanCents: number | null; totalCents: number; unpriced: number }>
  ledgers: Ledger[]
}

const BUCKETS: Bucket[] = ['SHORT', 'STANDARD', 'EXTENDED', 'LONG']
const usd = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

function Verdict({ run }: { run: EvalRun }) {
  if (run.status === 'FAILED') return <span className="rounded bg-[#F85149]/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#F85149]">FAILED</span>
  if (run.status !== 'SCORED') return <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#D29922]">{run.status}</span>
  return run.pass
    ? <span className="rounded bg-[#3FB950]/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#3FB950]">GREEN</span>
    : <span className="rounded bg-[#F85149]/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#F85149]">RED</span>
}

export default function EvalGatePage() {
  const role = useStaffRole()
  const [data, setData] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await apiFetch('/ops/eval/runs')
      if (!r.ok) { setError(r.status === 403 ? 'The eval gate is for Ops administrators.' : `Could not load the eval runs (${r.status}).`); return }
      const d = (await r.json()) as Listing
      setData(d)
      setPicked((p) => (p.size ? p : new Set(d.ledgers.map((l) => l.name))))
    } catch (e) { setError(`Could not load the eval runs: ${(e as Error).message}`) }
  }, [])
  useEffect(() => { void load() }, [load])

  // Keep polling while something is queued or running.
  const active = data?.runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING') ?? false
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(t)
  }, [active, load])

  const runNow = async () => {
    if (!data) return
    setBusy(true); setNotice('')
    const all = picked.size === 0 || picked.size === data.ledgers.length
    const res = await apiFetch('/ops/eval/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? {} : { ledgers: [...picked] }) })
    const d = await res.json().catch(() => ({}))
    setNotice(res.status === 202
      ? `Started ${d.runs?.length ?? 0} run(s) on the production model — each creates a fresh eval case; scoring lands here when the analysis finishes.`
      : res.status === 409 ? 'A run is already queued or running for that ledger — wait for it, or for 4 hours if it is stale.'
      : d.error ?? `Run failed (${res.status})`)
    setBusy(false)
    await load()
  }

  const latestByLedger = useMemo(() => {
    const m = new Map<string, EvalRun>()
    for (const r of data?.runs ?? []) if ((r.status === 'SCORED' || r.status === 'FAILED') && !m.has(r.ledger)) m.set(r.ledger, r)
    return m
  }, [data])
  const gate = useMemo(() => {
    if (!data) return null
    const names = data.ledgers.map((l) => l.name)
    const never = names.filter((n) => !latestByLedger.has(n))
    const failed = names.filter((n) => { const r = latestByLedger.get(n); return r && (r.status === 'FAILED' || r.pass !== true) })
    const last = [...latestByLedger.values()].map((r) => r.startedAt).sort().pop() ?? null
    return { never, failed, last, pass: never.length === names.length ? null : failed.length === 0 && never.length === 0 }
  }, [data, latestByLedger])

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Eval gate</h1>
          <p className="mt-1 text-xs text-[#8B949E]">Every attorney ledger on the production model and prompt set, scored against its canaries, with the cost per record bucket. Runs weekly from GitHub (Monday 09:15 UTC) and on demand here. A red gate blocks promotion.</p>
        </div>
        {role === 'ADMIN' && data && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2 text-xs" data-testid="eval-ledger-picker">
              {data.ledgers.map((l) => (
                <label key={l.name} className="flex items-center gap-1 rounded border border-[#30363D] px-2 py-1">
                  <input type="checkbox" checked={picked.has(l.name)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(l.name); else n.delete(l.name); return n })} />
                  <span className="font-mono">{l.name}</span>
                  <span className="text-[#8B949E]">· {l.mustFind} canaries</span>
                </label>
              ))}
            </div>
            <button onClick={() => void runNow()} disabled={busy || picked.size === 0} data-testid="eval-run-now" className="rounded border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37] disabled:opacity-40">
              {busy ? 'Starting…' : 'Run now'}
            </button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[#F85149]">{error}</p>}
      {notice && <p className="mt-3 text-sm text-[#D29922]" data-testid="eval-notice">{notice}</p>}
      {!data && !error && <p className="mt-4 text-sm text-[#8B949E]">Loading…</p>}

      {data && gate && (
        <>
          <section className="mt-4" data-testid="eval-verdict" data-pass={String(gate.pass)}>
            {gate.pass === null ? (
              <p className="rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 text-sm text-[#8B949E]">The gate has never run. Press Run now, or wait for Monday.</p>
            ) : gate.pass ? (
              <p className="rounded border border-[#3FB950] bg-[#3FB950]/10 px-3 py-2 text-sm text-[#3FB950]">Eval gate: GREEN — every ledger passed on its latest run ({when(gate.last)}).</p>
            ) : (
              <p className="rounded border border-[#F85149] bg-[#F85149]/10 px-3 py-2 text-sm text-[#F85149]">Eval gate: RED — {gate.failed.join(', ')} {gate.failed.length === 1 ? 'did not pass' : 'did not pass'} on the latest run ({when(gate.last)}){gate.never.length ? `; never run: ${gate.never.join(', ')}` : ''}. Not promotable until it is green.</p>
            )}
          </section>

          <section className="mt-6" data-testid="eval-latest">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Latest scorecard per ledger</h2>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {data.ledgers.map((l) => {
                const r = latestByLedger.get(l.name)
                return (
                  <div key={l.name} className="rounded border border-[#30363D] bg-[#0D1117] p-3" data-testid={`eval-ledger-${l.name}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{l.caseTitle} <span className="font-mono text-xs font-normal text-[#8B949E]">{l.name}</span></div>
                      {r ? <Verdict run={r} /> : <span className="font-mono text-[11px] text-[#8B949E]">never run</span>}
                    </div>
                    {r?.summary ? (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-[#8B949E]">Must-find</dt><dd className="font-mono">{r.summary.found}/{r.summary.mustFindTotal} ({pct(r.summary.recall)})</dd>
                        <dt className="text-[#8B949E]">Missed</dt><dd className="font-mono">{r.summary.missed.length ? r.summary.missed.join(', ') : '—'}</dd>
                        <dt className="text-[#8B949E]">Dropped at verification</dt><dd className="font-mono">{pct(r.summary.droppedAtVerification)}</dd>
                        <dt className="text-[#8B949E]">Bucket</dt><dd className="font-mono">{r.bucket ?? '—'}{r.meteredPages ? ` · ${r.meteredPages.reporter} RR pp` : ''}</dd>
                        <dt className="text-[#8B949E]">Cost</dt><dd className="font-mono">{usd(r.costCents)}{r.summary.margin != null ? ` · margin ${pct(r.summary.margin)}` : ''}</dd>
                        <dt className="text-[#8B949E]">Engine</dt><dd className="font-mono">{r.summary.model ?? '—'} · {r.summary.promptSet ?? '—'} {r.summary.promptHash ?? ''}</dd>
                        <dt className="text-[#8B949E]">Run</dt><dd className="font-mono">{when(r.startedAt)} · <Link href={`/ops/cases/${r.caseId}`} className="text-[#3B82F6] underline">case file</Link></dd>
                      </dl>
                    ) : r ? (
                      <p className="mt-2 text-xs text-[#F85149]">{r.error ?? 'Failed before scoring.'}</p>
                    ) : (
                      <p className="mt-2 text-xs text-[#8B949E]">{l.mustFind} canaries · {l.verdicts} attorney verdicts</p>
                    )}
                    {r?.reasons?.length ? <ul className="mt-2 list-disc pl-5 text-xs text-[#F85149]">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul> : null}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mt-6" data-testid="eval-cost">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Cost per record bucket (scored runs listed below)</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                  <th className="py-2 pr-3">Bucket</th><th className="py-2 pr-3">Runs</th><th className="py-2 pr-3">Mean cost</th><th className="py-2 pr-3">Total</th><th className="py-2">Unpriced</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map((b) => {
                  const c = data.costPerBucket[b]
                  return (
                    <tr key={b} className="border-b border-[#161B22]" data-testid={`eval-cost-${b}`}>
                      <td className="py-2 pr-3 font-mono">{b}</td>
                      <td className="py-2 pr-3 font-mono">{c?.n ?? 0}</td>
                      <td className="py-2 pr-3 font-mono">{usd(c?.meanCents)}</td>
                      <td className="py-2 pr-3 font-mono">{usd(c?.totalCents ?? 0)}</td>
                      <td className="py-2 font-mono">{c?.unpriced ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="mt-6" data-testid="eval-runs">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Runs (newest first)</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                  <th className="py-2 pr-3">Started</th><th className="py-2 pr-3">Ledger</th><th className="py-2 pr-3">Verdict</th><th className="py-2 pr-3">Must-find</th><th className="py-2 pr-3">Bucket</th><th className="py-2 pr-3">Cost</th><th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-b border-[#161B22]" data-testid={`eval-run-${r.id}`}>
                    <td className="py-2 pr-3 font-mono text-xs">{when(r.startedAt)}</td>
                    <td className="py-2 pr-3 font-mono">{r.ledger}</td>
                    <td className="py-2 pr-3"><Verdict run={r} />{r.status === 'FAILED' && r.error ? <span className="ml-2 text-xs text-[#8B949E]">{r.error.slice(0, 80)}</span> : null}</td>
                    <td className="py-2 pr-3 font-mono">{r.summary ? `${r.summary.found}/${r.summary.mustFindTotal}` : '—'}</td>
                    <td className="py-2 pr-3 font-mono">{r.bucket ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono">{usd(r.costCents)}</td>
                    <td className="py-2 font-mono text-xs text-[#8B949E]">{r.triggeredBy === 'eval-gate' ? 'schedule' : 'console'}</td>
                  </tr>
                ))}
                {data.runs.length === 0 && <tr><td colSpan={7} className="py-4 text-[#8B949E]">No runs yet.</td></tr>}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
