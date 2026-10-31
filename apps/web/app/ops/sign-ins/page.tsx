'use client'

/**
 * The sign-in log (staff_console.md §12 "Sign-in log and alerts",
 * 2026-10-31): every credential sign-in attempt, success or failure, newest
 * first, paged. Filter by outcome (or "failed, any reason"), keep only
 * first sign-ins (the ones the admin was texted about), search an address.
 * The Today page's two tiles land here with ?first=1 and ?outcome=FAILED.
 * Admin and Support read; the api keeps 180 days.
 */
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { opsListSignIns, SIGN_IN_FILTERS, type SignInFilter, type SignInsPage } from '@/lib/api'
import { formatWhen } from '@/lib/duration'
import { OUTCOME_LABEL, OutcomeBadge } from '@/lib/sign-ins'

const PAGE_SIZE = 50
const isFilter = (v: string | null): v is SignInFilter => !!v && (SIGN_IN_FILTERS as string[]).includes(v)

function SignInsLog() {
  const params = useSearchParams()
  const [outcome, setOutcome] = useState<SignInFilter | ''>(isFilter(params?.get('outcome') ?? null) ? (params!.get('outcome') as SignInFilter) : '')
  const [first, setFirst] = useState(params?.get('first') === '1')
  const [q, setQ] = useState(params?.get('q') ?? '')
  const [term, setTerm] = useState(params?.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<SignInsPage | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await opsListSignIns({ outcome, first, q: term, page, pageSize: PAGE_SIZE })
    if (r.ok) { setData((await r.json()) as SignInsPage); setError('') }
    else setError(`Could not load the log (${r.status})`)
  }, [outcome, first, term, page])
  useEffect(() => { void load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Sign-ins</h1>
        <p className="text-xs text-[#8B949E]">Every attempt, success or failure, newest first. Kept 180 days. A first sign-in texts the admin.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setTerm(q.trim()) }}
        className="mt-4 flex flex-wrap items-center gap-3 text-sm"
      >
        <label className="flex items-center gap-2">
          <span className="text-xs text-[#8B949E]">Outcome</span>
          <select
            aria-label="Outcome"
            value={outcome}
            onChange={(e) => { setPage(1); setOutcome(e.target.value as SignInFilter | '') }}
            className="rounded border border-[#30363D] bg-[#0D1117] px-2 py-1.5 text-sm"
          >
            <option value="">all</option>
            {SIGN_IN_FILTERS.map((f) => <option key={f} value={f}>{OUTCOME_LABEL[f]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" aria-label="First sign-ins only" checked={first} onChange={(e) => { setPage(1); setFirst(e.target.checked) }} />
          <span>First sign-ins only</span>
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by email"
          aria-label="Filter by email"
          className="w-72 rounded border border-[#30363D] bg-[#0D1117] px-3 py-1.5 text-sm"
        />
        <button className="rounded border border-[#30363D] px-3 py-1.5 text-sm hover:border-[#D4AF37]">Search</button>
      </form>

      {error && <p className="mt-3 text-sm text-[#F85149]">{error}</p>}

      <p className="mt-4 text-xs text-[#8B949E]" data-testid="sign-ins-count">
        {data ? `${data.total} attempt${data.total === 1 ? '' : 's'}` : 'Loading…'}
        {first ? ' · first sign-ins only' : ''}{outcome ? ` · ${OUTCOME_LABEL[outcome]}` : ''}{term ? ` · matching “${term}”` : ''}
      </p>

      {data && data.attempts.length > 0 && (
        <table className="mt-3 w-full border-collapse text-sm" data-testid="sign-ins-table">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Outcome</th><th className="py-2 pr-3">IP</th><th className="py-2">Device</th>
            </tr>
          </thead>
          <tbody>
            {data.attempts.map((t) => (
              <tr key={t.id} className="border-b border-[#161B22]" data-testid={`sign-in-${t.id}`}>
                <td className="py-2 pr-3 font-mono text-xs">{formatWhen(t.createdAt)}</td>
                <td className="py-2 pr-3 font-mono text-xs">
                  {t.userId ? <Link href={`/ops/accounts/${t.userId}`} className="underline hover:text-[#D4AF37]">{t.email}</Link> : t.email}
                </td>
                <td className="py-2 pr-3">
                  <OutcomeBadge outcome={t.outcome} />
                  {t.firstSignIn && <span className="ml-2 rounded bg-[#D4AF37]/20 px-1.5 text-[11px] text-[#D4AF37]">first</span>}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{t.ip ?? '—'}</td>
                <td className="py-2 text-xs text-[#8B949E]">{t.userAgent ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.attempts.length === 0 && <p className="mt-3 text-sm text-[#8B949E]" data-testid="sign-ins-empty">No attempts match.</p>}

      {data && pages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-xs text-[#8B949E]" data-testid="sign-ins-paging">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-[#30363D] px-2 py-1 disabled:opacity-40">← Newer</button>
          <span>page {data.page} of {pages}</span>
          <button type="button" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)} className="rounded border border-[#30363D] px-2 py-1 disabled:opacity-40">Older →</button>
        </div>
      )}
    </div>
  )
}

export default function SignInsPage() {
  // useSearchParams needs a Suspense boundary for the static build (Next 14).
  return (
    <Suspense fallback={<p className="text-sm text-[#8B949E]">Loading…</p>}>
      <SignInsLog />
    </Suspense>
  )
}
