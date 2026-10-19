'use client'

/**
 * Record Desk queue (persona_rollout_plan.md §3 investigator, §5 G;
 * staff_console.md §12). In January the Record Desk is sold and delivered
 * by hand from here: a request comes in, a named reviewer takes it, the
 * status and a note go back to the organisation. SLA: 10 business days from
 * filing. Admin does everything; Support may take a request on (IN_PROGRESS)
 * and mark it DELIVERED — the api keeps Support off DECLINED and OPEN.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { opsListInvestigations, opsListStaff, opsUpdateInvestigation } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

type Status = 'OPEN' | 'IN_PROGRESS' | 'DELIVERED' | 'DECLINED'
interface Row {
  id: string
  kind: 'CHRONOLOGY' | 'RECORDS_TRACKER' | 'OTHER'
  status: Status
  pages: number | null
  dueBy: string | null
  note: string
  staffNote: string | null
  assignedTo: string | null
  deliveredAt: string | null
  createdAt: string
  caseId: string | null
  caseLabel: string | null
  businessDaysOpen: number
  pastSla: boolean
  organisation: { id: string; name: string; kind: string; isTest: boolean }
  requester: { id: string; name: string | null; email: string | null }
  assignee: { id: string; name: string | null } | null
}
interface Staff { id: string; name: string | null; email: string; role: string }

const KIND: Record<Row['kind'], string> = { CHRONOLOGY: 'Chronology', RECORDS_TRACKER: 'Records tracker', OTHER: 'Other' }
const SUPPORT_STATUSES: Status[] = ['IN_PROGRESS', 'DELIVERED']
const ALL_STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'DELIVERED', 'DECLINED']
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')

export default function RecordDeskPage() {
  const role = useStaffRole()
  const isAdmin = role === 'ADMIN'
  const [filter, setFilter] = useState<Status | ''>('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const r = await opsListInvestigations(filter || undefined)
    setRows(r.ok ? (((await r.json()) as { requests: Row[] }).requests ?? []) : [])
  }, [filter])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void opsListStaff().then(async (r) => r.ok && setStaff((((await r.json()) as { staff: Staff[] }).staff) ?? [])) }, [])

  const update = async (row: Row, body: { status?: Status; assignedTo?: string | null; note?: string | null }, done: string) => {
    const r = await opsUpdateInvestigation(row.id, body)
    const d = await r.json().catch(() => ({}))
    setNotice(r.ok ? done : d.error ?? `Could not update (${r.status})`)
    if (r.ok) await load()
  }
  const statusOptions = (row: Row) => (isAdmin ? ALL_STATUSES : Array.from(new Set([row.status, ...SUPPORT_STATUSES])))

  const openCount = rows?.filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length ?? 0
  const pastCount = rows?.filter((r) => r.pastSla && (r.status === 'OPEN' || r.status === 'IN_PROGRESS')).length ?? 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Record Desk</h1>
          {rows && <span className="text-xs text-[#8B949E]">{openCount} in hand{pastCount ? <> · <span className="text-[#F85149]">{pastCount} past the SLA</span></> : null}</span>}
        </div>
        <div className="flex rounded border border-[#30363D] bg-[#0D1117] p-0.5 text-xs" data-testid="status-filter">
          {([['', 'All'], ['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['DELIVERED', 'Delivered'], ['DECLINED', 'Declined']] as Array<[Status | '', string]>).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`rounded px-2.5 py-1 ${filter === v ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-[#8B949E]">Delivered by hand in January: a named reviewer, a status, and a note the organisation reads on its request. The SLA is 10 business days from filing on the same calendar as the family promise.{!isAdmin && ' Support may take a request on and mark it delivered; declining or reopening needs an Ops administrator.'}</p>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      <table className="mt-4 w-full border-collapse text-sm" data-testid="record-desk-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Status</th><th>Organisation</th><th>Kind</th><th className="text-right">Pages</th><th>Due</th><th>Reviewer</th><th>SLA</th><th>Request and staff note</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id} className="border-b border-[#21262D] align-top" data-testid={`request-${r.id}`}>
              <td className="py-2">
                <select aria-label={`Status of ${r.organisation.name} ${KIND[r.kind]}`} value={r.status} onChange={(e) => void update(r, { status: e.target.value as Status }, `Now ${e.target.value.replace('_', ' ').toLowerCase()}.`)} className="rounded border border-[#30363D] bg-[#161B22] p-1 font-mono text-[11px]" data-testid={`status-${r.id}`}>
                  {statusOptions(r).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {r.deliveredAt && <div className="mt-1 font-mono text-[10px] text-[#3FB950]">delivered {day(r.deliveredAt)}</div>}
              </td>
              <td className="text-xs">
                <Link href={`/ops/organisations/${r.organisation.id}`} className="font-semibold hover:text-[#D4AF37]">{r.organisation.name}</Link>
                <div className="text-[#8B949E]">{r.requester.name ?? r.requester.email ?? '—'}{r.organisation.isTest ? ' · TEST' : ''}</div>
                {r.caseId && <Link href={`/ops/cases/${r.caseId}`} className="text-[#3B82F6] underline">{r.caseLabel ?? 'Case file'}</Link>}
              </td>
              <td className="text-xs">{KIND[r.kind]}</td>
              <td className="text-right font-mono tabular-nums">{r.pages ?? '—'}</td>
              <td className="font-mono text-xs">{day(r.dueBy)}</td>
              <td>
                <select aria-label={`Reviewer for ${r.organisation.name} ${KIND[r.kind]}`} value={r.assignedTo ?? ''} onChange={(e) => void update(r, { assignedTo: e.target.value || null }, e.target.value ? 'Reviewer assigned.' : 'Reviewer cleared.')} className="rounded border border-[#30363D] bg-[#161B22] p-1 text-xs" data-testid={`reviewer-${r.id}`}>
                  <option value="">— unassigned —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
                  {r.assignedTo && !staff.some((s) => s.id === r.assignedTo) && <option value={r.assignedTo}>{r.assignee?.name ?? r.assignedTo}</option>}
                </select>
              </td>
              <td>
                {r.status === 'OPEN' || r.status === 'IN_PROGRESS' ? (
                  <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${r.pastSla ? 'text-[#F85149]' : r.businessDaysOpen >= 8 ? 'text-[#D29922]' : 'text-[#8B949E]'}`} data-testid={`sla-${r.id}`}>
                    {r.pastSla ? `PAST SLA · ${r.businessDaysOpen}d` : `${r.businessDaysOpen}/10d`}
                  </span>
                ) : <span className="text-xs text-[#8B949E]">—</span>}
              </td>
              <td className="max-w-md text-xs">
                <p className="text-[#E6EDF3]">“{r.note}”</p>
                <div className="mt-1 flex items-start gap-2">
                  <textarea
                    aria-label={`Staff note for ${r.organisation.name} ${KIND[r.kind]}`}
                    rows={2}
                    value={notes[r.id] ?? r.staffNote ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="What the organisation reads on its request"
                    className="flex-1 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs"
                  />
                  <button
                    onClick={() => void update(r, { note: (notes[r.id] ?? r.staffNote ?? '').trim() || null }, 'Note saved.')}
                    disabled={(notes[r.id] ?? r.staffNote ?? '') === (r.staffNote ?? '')}
                    className="rounded border border-[#30363D] px-2 py-1 text-xs disabled:opacity-40"
                    data-testid={`save-note-${r.id}`}
                  >
                    Save
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows && rows.length === 0 && <tr><td colSpan={8} className="py-3 text-sm text-[#8B949E]">No requests{filter ? ` ${filter.replace('_', ' ').toLowerCase()}` : ''}.</td></tr>}
          {!rows && <tr><td colSpan={8} className="py-3 text-sm text-[#8B949E]">Loading…</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
