'use client'

/**
 * Organisations (staff_console.md §11–§12): every firm, PD office and clinic
 * with its kind, pilot, allowance used/remaining (from /metrics) and the
 * test flag. Admin edits on the detail page; Support reads.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { opsListOrganisations, opsOrganisationMetrics, type OrganisationKind } from '@/lib/api'
import { KIND_LABEL, day, type OrganisationMetrics, type OrganisationRow } from '@/lib/organisations'

export default function OrganisationsPage() {
  const [kind, setKind] = useState<'' | OrganisationKind>('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<OrganisationRow[] | null>(null)
  const [metrics, setMetrics] = useState<Record<string, OrganisationMetrics>>({})

  useEffect(() => {
    let live = true
    void opsListOrganisations({ ...(kind ? { kind } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).then(async (r) => {
      const list = r.ok ? (((await r.json()) as { organisations: OrganisationRow[] }).organisations ?? []) : []
      if (!live) return
      setRows(list)
      const pairs = await Promise.all(list.map(async (o) => {
        const m = await opsOrganisationMetrics(o.id)
        return [o.id, m.ok ? ((await m.json()) as OrganisationMetrics) : null] as const
      }))
      if (live) setMetrics(Object.fromEntries(pairs.filter((p): p is readonly [string, OrganisationMetrics] => !!p[1])))
    })
    return () => { live = false }
  }, [kind, q])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Organisations</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-[#30363D] bg-[#0D1117] p-0.5 text-xs" data-testid="kind-filter">
            {([['', 'All'], ['FIRM', 'Firms'], ['PD_OFFICE', 'PD offices'], ['CLINIC', 'Clinics']] as Array<['' | OrganisationKind, string]>).map(([k, label]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded px-2.5 py-1 ${kind === k ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>{label}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" aria-label="Find an organisation" className="w-56 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs" />
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-sm" data-testid="organisations-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Organisation</th><th>Kind</th><th>Pilot</th><th className="text-right">Allowance used / left</th><th>Resets</th><th className="text-right">Members</th><th>Flags</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((o) => {
            const m = metrics[o.id]
            return (
              <tr key={o.id} className="border-b border-[#21262D]" data-testid={`organisation-${o.id}`}>
                <td className="py-2">
                  <Link href={`/ops/organisations/${o.id}`} className="font-semibold hover:text-[#D4AF37]">{o.name}</Link>
                  {o.legalName && o.legalName !== o.name && <div className="text-[11px] text-[#8B949E]">{o.legalName}</div>}
                </td>
                <td className="text-xs">{KIND_LABEL[o.kind] ?? o.kind}</td>
                <td className="text-xs">{o.pilot ? <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] text-[#3FB950]">PILOT{o.pilotEndsAt ? ` · ends ${day(o.pilotEndsAt)}` : ''}</span> : <span className="text-[#8B949E]">—</span>}</td>
                <td className="text-right font-mono tabular-nums" data-testid={`allowance-${o.id}`}>
                  {m ? <span className={m.allowance.remaining <= 2 && m.allowance.granted > 0 ? 'text-[#D29922]' : ''}>{m.allowance.used} / {m.allowance.remaining}</span> : o.allowanceRecords ? `… / ${o.allowanceRecords}` : '—'}
                </td>
                <td className="font-mono text-xs text-[#8B949E]">{day(o.allowanceResetsAt)}</td>
                <td className="text-right font-mono tabular-nums">{m?.members ?? o.memberCount}</td>
                <td className="space-x-1 font-mono text-[11px]">
                  {o.publicInterest && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#3B82F6]">PUBLIC INTEREST</span>}
                  {o.isTest && <span className="rounded bg-[#21262D] px-1.5 py-0.5 text-[#D29922]">TEST</span>}
                </td>
                <td className="text-right"><Link href={`/ops/organisations/${o.id}`} className="rounded border border-[#30363D] px-2 py-1 text-xs">Open →</Link></td>
              </tr>
            )
          })}
          {rows && rows.length === 0 && <tr><td colSpan={8} className="py-3 text-sm text-[#8B949E]">No organisations{kind || q ? ' match' : ' yet'}.</td></tr>}
          {!rows && <tr><td colSpan={8} className="py-3 text-sm text-[#8B949E]">Loading…</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
