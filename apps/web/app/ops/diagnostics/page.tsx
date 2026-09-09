'use client'

/**
 * Diagnostics (2026-09-09): "dev works, prod doesn't" answered on one page.
 * Live probes of every pipeline dependency with the api's own credentials,
 * the pipeline env as the process sees it, running workers per queue, and
 * the last failed jobs WITH their failure reasons. ADMIN only.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Check { ok: boolean; detail: string; ms: number }
interface Failed { id: string; caseId: string | null; documentId: string | null; reason: string; attemptsMade: number; failedAt: string | null }
interface Diag {
  at: string
  process: { node: string; uptimeMin: number; rssMb: number; heapLimitMb: number }
  env: Record<string, string | null>
  secretsPresent: Record<string, boolean>
  checks: Record<string, Check>
  queues: Record<string, { workers: number; counts: Record<string, number>; failed: Failed[] }>
}

const CHECK_WORDS: Record<string, string> = {
  redis: 'Redis (queues, live updates)',
  s3: 'S3 (case documents)',
  textract: 'Textract (OCR for scans)',
  anthropic: 'Anthropic (analysis model)',
  clamd: 'ClamAV (malware scan on upload)',
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

export default function DiagnosticsPage() {
  const [d, setD] = useState<Diag | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const r = await apiFetch('/ops/diagnostics')
      if (!r.ok) { setError(`Diagnostics failed: ${r.status}`); return }
      setD(await r.json())
    } catch (e) { setError(`Diagnostics failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const bad = d ? Object.entries(d.checks).filter(([, c]) => !c.ok) : []
  const noWorkers = d ? Object.entries(d.queues).filter(([, q]) => q.workers === 0) : []
  const failedTotal = d ? Object.values(d.queues).reduce((n, q) => n + q.failed.length, 0) : 0

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Diagnostics</h1>
          <p className="mt-1 text-xs text-[#8B949E]">Live probes with this server&rsquo;s own credentials{d ? ` · ${when(d.at)} · node ${d.process.node} · up ${d.process.uptimeMin} min · RSS ${d.process.rssMb} MB of a ${d.process.heapLimitMb} MB heap` : ''}</p>
        </div>
        <button onClick={() => void load()} disabled={busy} className="rounded border border-[#3B82F6] px-3 py-1.5 text-xs text-[#3B82F6] disabled:opacity-40" data-testid="diag-rerun">{busy ? 'Probing…' : 'Re-run checks'}</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[#F85149]">{error}</p>}
      {!d && !error && <p className="mt-4 text-sm text-[#8B949E]">Probing dependencies…</p>}

      {d && (
        <>
          <section className="mt-4" data-testid="diag-verdict">
            {bad.length === 0 && noWorkers.length === 0 && failedTotal === 0 ? (
              <p className="rounded border border-[#3FB950] bg-[#3FB950]/10 px-3 py-2 text-sm text-[#3FB950]">Every dependency answers, every queue has a worker, and no job has failed recently. If a case is still stuck, open it — its pipeline card says which job and why.</p>
            ) : (
              <div className="rounded border border-[#F85149] bg-[#F85149]/10 px-3 py-2 text-sm text-[#F85149]">
                <p className="font-semibold">What&rsquo;s wrong, most likely first:</p>
                <ul className="mt-1 list-disc pl-5">
                  {bad.map(([k, c]) => <li key={k}><strong>{CHECK_WORDS[k] ?? k}</strong> — {c.detail}</li>)}
                  {noWorkers.map(([k]) => <li key={k}><strong>{k} queue has no worker</strong> — jobs wait forever. The api process starts workers only when Redis answered at boot; restart the api.</li>)}
                  {failedTotal > 0 && <li><strong>{failedTotal} failed job(s)</strong> — reasons below.</li>}
                </ul>
              </div>
            )}
          </section>

          <section className="mt-6" data-testid="diag-checks">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Dependencies</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <tbody>
                {Object.entries(d.checks).map(([k, c]) => (
                  <tr key={k} className="border-b border-[#21262D]" data-testid={`check-${k}`} data-ok={c.ok}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: c.ok ? '#3FB950' : '#F85149' }}>{c.ok ? '● OK' : '● FAIL'}</td>
                    <td className="py-2 pr-3">{CHECK_WORDS[k] ?? k}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-[#8B949E]">{c.detail}</td>
                    <td className="py-2 text-right font-mono text-xs text-[#8B949E]">{c.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6" data-testid="diag-queues">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Queues</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead><tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]"><th className="py-2">Queue</th><th>Workers</th><th>Waiting</th><th>Active</th><th>Delayed</th><th>Failed</th><th>Completed</th></tr></thead>
              <tbody>
                {Object.entries(d.queues).map(([k, q]) => (
                  <tr key={k} className="border-b border-[#21262D]" data-testid={`queue-${k}`}>
                    <td className="py-2 font-semibold">{k}</td>
                    <td className="font-mono" style={{ color: q.workers > 0 ? '#3FB950' : '#F85149' }}>{q.workers < 0 ? '?' : q.workers}</td>
                    <td className="font-mono">{q.counts.waiting ?? 0}</td><td className="font-mono">{q.counts.active ?? 0}</td><td className="font-mono">{q.counts.delayed ?? 0}</td>
                    <td className="font-mono" style={{ color: (q.counts.failed ?? 0) > 0 ? '#F85149' : undefined }}>{q.counts.failed ?? 0}</td><td className="font-mono">{q.counts.completed ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {failedTotal > 0 && (
              <div className="mt-3 space-y-2" data-testid="diag-failed">
                <h3 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Failed jobs, newest first — the reason is the job&rsquo;s own last error</h3>
                {Object.entries(d.queues).flatMap(([k, q]) => q.failed.map((f) => (
                  <div key={`${k}-${f.id}`} className="rounded border border-[#F85149]/60 bg-[#0D1117] p-2 text-xs">
                    <div className="text-[#8B949E]"><span className="font-semibold text-[#E6EDF3]">{k}</span> · job {f.id} · {f.attemptsMade} attempt(s) · {when(f.failedAt)}{f.caseId ? <> · case <a href={`/ops/cases/${f.caseId}`} className="underline">{f.caseId}</a></> : null}{f.documentId ? ` · document ${f.documentId}` : ''}</div>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[#F85149]">{f.reason || '(no reason recorded)'}</pre>
                  </div>
                )))}
              </div>
            )}
          </section>

          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <div data-testid="diag-env">
              <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Pipeline env (as this process sees it)</h2>
              <table className="mt-2 w-full border-collapse text-xs">
                <tbody>
                  {Object.entries(d.env).map(([k, v]) => (
                    <tr key={k} className="border-b border-[#21262D]"><td className="py-1 pr-3 font-mono text-[#8B949E]">{k}</td><td className="py-1 font-mono">{v ?? <span className="text-[#8B949E]">(unset)</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div data-testid="diag-secrets">
              <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Secrets present (never shown)</h2>
              <table className="mt-2 w-full border-collapse text-xs">
                <tbody>
                  {Object.entries(d.secretsPresent).map(([k, v]) => (
                    <tr key={k} className="border-b border-[#21262D]"><td className="py-1 pr-3 font-mono text-[#8B949E]">{k}</td><td className="py-1 font-semibold" style={{ color: v ? '#3FB950' : '#F85149' }}>{v ? 'set' : 'MISSING'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
