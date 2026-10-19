'use client'

/**
 * Long-record quote requests (staff_console.md §11 "Quotes"; persona plan §4):
 * a record over 1,500 reporter pages is not sold from the ladder, so the
 * attorney asked and an Admin answers here — a price in dollars, or a
 * decline with a sentence they can read. Support reads the queue.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { opsDecideQuoteRequest, opsListQuoteRequests } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

interface QuoteRow {
  id: string
  caseId: string
  status: 'OPEN' | 'QUOTED' | 'DECLINED'
  meteredPages: { reporter?: number; clerk?: number; exhibit?: number; unknown?: number; total?: number } | null
  note: string | null
  quotedCents: number | null
  decidedAt: string | null
  createdAt: string
  organisation: { id: string; name: string; kind: string } | null
  requester: { id: string; name: string | null; email: string } | null
  case: { id: string; title: string; status: string } | null
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const n = (v: number | undefined) => (v ?? 0).toLocaleString('en-US')

export default function QuotesPage() {
  const role = useStaffRole()
  const canDecide = role === 'ADMIN'
  const [status, setStatus] = useState<'OPEN' | 'QUOTED' | 'DECLINED' | ''>('OPEN')
  const [rows, setRows] = useState<QuoteRow[] | null>(null)
  const [deciding, setDeciding] = useState<{ id: string; dollars: string; decline: boolean; note: string } | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const r = await opsListQuoteRequests(status || undefined)
    setRows(r.ok ? ((await r.json()) as QuoteRow[]) : [])
  }, [status])
  useEffect(() => { void load() }, [load])

  const decide = async () => {
    if (!deciding) return
    const cents = Math.round(Number(deciding.dollars) * 100)
    const body = deciding.decline ? { decline: true, ...(deciding.note.trim() ? { note: deciding.note.trim() } : {}) } : { quotedCents: cents, ...(deciding.note.trim() ? { note: deciding.note.trim() } : {}) }
    const r = await opsDecideQuoteRequest(deciding.id, body)
    const d = await r.json().catch(() => ({}))
    setNotice(r.ok ? (deciding.decline ? 'Declined — the attorney reads your note on the matter.' : `Quoted ${usd(cents)} — the attorney can accept it from the matter.`) : d.error ?? `Could not decide (${r.status})`)
    setDeciding(null)
    await load()
  }
  const valid = deciding ? (deciding.decline ? deciding.note.trim().length > 0 : Number(deciding.dollars) > 0) : false

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Quote requests</h1>
        <div className="flex rounded border border-[#30363D] bg-[#0D1117] p-0.5 text-xs" data-testid="status-filter">
          {([['OPEN', 'Open'], ['QUOTED', 'Quoted'], ['DECLINED', 'Declined'], ['', 'All']] as Array<[typeof status, string]>).map(([v, label]) => (
            <button key={v} onClick={() => setStatus(v)} className={`rounded px-2.5 py-1 ${status === v ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-[#8B949E]">Long records (over 1,500 reporter pages) are quoted by hand from $499 until the volume split ships. Nothing starts on the record until the attorney accepts a price.{!canDecide && ' Answering needs an Ops administrator.'}</p>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      <div className="mt-4 space-y-3" data-testid="quotes">
        {rows?.map((q) => (
          <div key={q.id} className="rounded border border-[#30363D] bg-[#0D1117] p-4" data-testid={`quote-${q.id}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${q.status === 'OPEN' ? 'text-[#D29922]' : q.status === 'QUOTED' ? 'text-[#3FB950]' : 'text-[#8B949E]'}`}>{q.status}</span>
              <span className="font-semibold">{q.organisation ? <Link href={`/ops/organisations/${q.organisation.id}`} className="hover:text-[#D4AF37]">{q.organisation.name}</Link> : 'Unknown organisation'}</span>
              <span className="text-xs text-[#8B949E]">{q.requester?.name ?? q.requester?.email ?? '—'} · {when(q.createdAt)}</span>
              {q.case && <Link href={`/ops/cases/${q.caseId}`} className="ml-auto text-xs text-[#3B82F6] underline">Case file →</Link>}
            </div>
            <div className="mt-2 font-mono text-xs text-[#8B949E]" data-testid={`pages-${q.id}`}>
              reporter {n(q.meteredPages?.reporter)} · clerk {n(q.meteredPages?.clerk)} · exhibits {n(q.meteredPages?.exhibit)}
              {q.meteredPages?.unknown ? ` · unlabelled ${n(q.meteredPages.unknown)}` : ''} · total {n(q.meteredPages?.total ?? ((q.meteredPages?.reporter ?? 0) + (q.meteredPages?.clerk ?? 0) + (q.meteredPages?.exhibit ?? 0) + (q.meteredPages?.unknown ?? 0)))}
            </div>
            {q.note && <p className="mt-2 text-sm">“{q.note}”</p>}
            {q.status !== 'OPEN' && (
              <p className="mt-2 text-xs text-[#8B949E]">{q.status === 'QUOTED' && q.quotedCents != null ? `Quoted ${usd(q.quotedCents)}` : 'Declined'}{q.decidedAt ? ` · ${when(q.decidedAt)}` : ''}</p>
            )}
            {canDecide && q.status === 'OPEN' && (
              deciding?.id === q.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2" data-testid={`decide-form-${q.id}`}>
                  <label className="flex items-center gap-1 text-xs"><input type="radio" checked={!deciding.decline} onChange={() => setDeciding({ ...deciding, decline: false })} /> Quote $</label>
                  <input aria-label="Quoted amount in dollars" type="number" min="1" step="1" value={deciding.dollars} disabled={deciding.decline} onChange={(e) => setDeciding({ ...deciding, dollars: e.target.value })} className="w-28 rounded border border-[#30363D] bg-[#161B22] p-1.5 font-mono text-sm disabled:opacity-40" />
                  <label className="flex items-center gap-1 text-xs"><input type="radio" checked={deciding.decline} onChange={() => setDeciding({ ...deciding, decline: true })} /> Decline</label>
                  <input aria-label="Note for the attorney" value={deciding.note} onChange={(e) => setDeciding({ ...deciding, note: e.target.value })} placeholder={deciding.decline ? 'Say why — the attorney reads this' : 'Optional note'} className="min-w-[16rem] flex-1 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs" />
                  <button onClick={() => void decide()} disabled={!valid} className="rounded bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid={`decide-send-${q.id}`}>{deciding.decline ? 'Decline' : 'Send quote'}</button>
                  <button onClick={() => setDeciding(null)} className="text-xs text-[#8B949E]">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setDeciding({ id: q.id, dollars: '', decline: false, note: '' })} className="mt-3 rounded border border-[#D4AF37] px-3 py-1.5 text-xs text-[#D4AF37]" data-testid={`decide-${q.id}`}>Answer…</button>
              )
            )}
          </div>
        ))}
        {rows && rows.length === 0 && <p className="text-sm text-[#8B949E]">No {status ? status.toLowerCase() : ''} quote requests.</p>}
        {!rows && <p className="text-sm text-[#8B949E]">Loading…</p>}
      </div>
    </div>
  )
}
