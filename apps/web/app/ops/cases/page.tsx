'use client'

/**
 * Cases — the support surface (staff_console_access_model §3): every case,
 * findable by title or stage, one click from its case file. Admins and
 * Support both land here; what differs is what the case file lets them do.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

interface QueueRow {
  id: string; title: string; label: string; ref: string; customerName: string | null; customerEmail: string | null; status: string; lane: string | null
  daysInStage: number; stalled: boolean; ocrHalt: boolean; delayOurs: boolean; subsequentWrit: boolean; updatedAt: string
  // Professional era (workstream G): null on a family case.
  organisation?: { id: string; name: string; kind: string; isTest: boolean } | null
  matter?: { vehicle: string; causeNumber: string | null } | null
}
const KIND_LABEL: Record<string, string> = { FIRM: 'Firm', PD_OFFICE: 'PD office', CLINIC: 'Clinic' }
const KIND_FILTERS: Array<[string, string]> = [['', 'All'], ['FAMILY', 'Families'], ['FIRM', 'Firms'], ['PD_OFFICE', 'PD offices'], ['CLINIC', 'Clinics']]
const STAGE: Record<string, string> = {
  DRAFT: 'Draft', AWAITING_DOCS: 'Awaiting documents', DOCS_COMPLETE: 'Documents complete', QUOTED: 'Quoted', DIGITIZING: 'Digitizing',
  ANALYZING: 'Analyzing', ADJUDICATING: 'Analyzing', QA_REVIEW: 'Quality review', QA_REJECTED: 'Quality review',
  READY: 'Report ready', DELIVERED: 'Delivered', REFUNDED: 'Refunded',
}

export default function CasesPage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [q, setQ] = useState('')
  const [attention, setAttention] = useState(false)
  const [kind, setKind] = useState('')
  const role = useStaffRole()
  // Per-case running cost (ADMIN only — Support is walled off from money)
  const [cogs, setCogs] = useState<Record<string, number> | null>(null)

  useEffect(() => { void apiFetch('/ops/queue').then(async (r) => r.ok && setRows(await r.json())) }, [])
  useEffect(() => { if (role === 'ADMIN') void apiFetch('/ops/cogs-by-case').then(async (r) => r.ok && setCogs(await r.json())) }, [role])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows
      .filter((c) => !term
        || (c.customerName ?? '').toLowerCase().includes(term)
        || (c.customerEmail ?? '').toLowerCase().includes(term)
        || (c.label ?? '').toLowerCase().includes(term)
        || (c.ref ?? '').toLowerCase().includes(term)
        || c.id.toLowerCase().includes(term)
        || (c.organisation?.name ?? '').toLowerCase().includes(term)
        || (c.matter?.causeNumber ?? '').toLowerCase().includes(term)
        || (STAGE[c.status] ?? c.status).toLowerCase().includes(term))
      .filter((c) => !attention || c.stalled || c.ocrHalt || c.delayOurs || c.status === 'QA_REVIEW')
      .filter((c) => !kind || (kind === 'FAMILY' ? !c.organisation : c.organisation?.kind === kind))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [rows, q, attention, kind])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Cases</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setAttention(false)} className={`rounded px-2 py-1 text-xs ${!attention ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>All ({rows.length})</button>
          <button onClick={() => setAttention(true)} className={`rounded px-2 py-1 text-xs ${attention ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>Needs attention</button>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Organisation kind" className="rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs" data-testid="kind-filter">
            {KIND_FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, county, organisation, cause, reference, or stage" aria-label="Find a case" className="w-72 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs" />
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-sm" data-testid="cases-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Case</th><th>Organisation</th><th>Vehicle</th><th>Stage</th><th className="text-right">Days</th><th>Flags</th><th>Last activity</th>{cogs && <th className="text-right">Cost so far</th>}<th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.id} className="border-b border-[#21262D]">
              <td className="py-2">
                <Link href={`/ops/cases/${c.id}`} className="font-semibold hover:text-[#D4AF37]" data-testid={`case-who-${c.id}`}>
                  {c.customerName || c.customerEmail || c.label || 'Review'}
                </Link>
                <div className="font-mono text-[11px] text-[#8B949E]">
                  {c.customerName && c.customerEmail ? `${c.customerEmail} · ` : ''}{c.label} · {c.ref}
                </div>
              </td>
              <td className="text-xs" data-testid={`org-${c.id}`}>
                {c.organisation ? (
                  <Link href={`/ops/organisations/${c.organisation.id}`} className="hover:text-[#D4AF37]">{c.organisation.name}</Link>
                ) : <span className="text-[#8B949E]">Family</span>}
                {c.organisation && <div className="font-mono text-[10px] text-[#8B949E]">{KIND_LABEL[c.organisation.kind] ?? c.organisation.kind}{c.organisation.isTest ? ' · TEST' : ''}</div>}
              </td>
              <td className="font-mono text-xs" data-testid={`vehicle-${c.id}`}>
                {c.matter ? <>{c.matter.vehicle}{c.matter.causeNumber && <div className="text-[10px] text-[#8B949E]">{c.matter.causeNumber}</div>}</> : <span className="text-[#8B949E]">—</span>}
              </td>
              <td>{STAGE[c.status] ?? c.status}</td>
              <td className="text-right font-mono tabular-nums">{c.daysInStage}</td>
              <td className="space-x-1 font-mono text-[11px]">
                {c.stalled && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#D29922]">STALL</span>}
                {c.ocrHalt && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#D29922]">OCR</span>}
                {c.delayOurs && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#F85149]">DELAY-OURS</span>}
                {c.subsequentWrit && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#8B949E]">§4</span>}
              </td>
              <td className="font-mono text-xs text-[#8B949E]">{new Date(c.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
              {cogs && <td className="text-right font-mono tabular-nums" data-testid={`cogs-${c.id}`}>{cogs[c.id] != null ? `$${cogs[c.id].toFixed(2)}` : '—'}</td>}
              <td className="text-right"><Link href={`/ops/cases/${c.id}`} className="rounded border border-[#30363D] px-2 py-1 text-xs">Case file →</Link></td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={cogs ? 9 : 8} className="py-3 text-sm text-[#8B949E]">{rows.length ? 'No case matches.' : 'No cases yet.'}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
