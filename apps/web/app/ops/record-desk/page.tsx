'use client'

/**
 * Record Desk queue (persona_rollout_plan.md §3 investigator, §5 G;
 * staff_console.md §12). In January the Record Desk is sold and delivered
 * by hand from here: a request comes in, a named reviewer takes it, the
 * status and a note go back to the organisation. SLA: 10 business days from
 * filing. Admin does everything; Support may take a request on (IN_PROGRESS)
 * and mark it DELIVERED — the api keeps Support off DECLINED and OPEN.
 *
 * The chronology template (UPL review 2026-10-23, P10): what the desk
 * delivers is a table — date · volume · page · what the record shows — and
 * the free text is a PROCESS note (what was done, when it was sent). The
 * api refuses either note when it carries advice words ("should", "file",
 * "grounds", "viable", "winnable") and this page shows that refusal.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { opsDeliverChronology, opsListInvestigations, opsListStaff, opsUpdateInvestigation, type ChronologyDeliverable, type ChronologyEntry } from '@/lib/api'
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
  deliverable?: ChronologyDeliverable | null
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
const EMPTY_ENTRY: ChronologyEntry = { date: '', volume: '', page: '', event: '' }
const cell = 'w-full rounded border border-[#30363D] bg-[#161B22] p-1 text-xs'

export default function RecordDeskPage() {
  const role = useStaffRole()
  const isAdmin = role === 'ADMIN'
  const [filter, setFilter] = useState<Status | ''>('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [chron, setChron] = useState<Record<string, ChronologyDeliverable>>({})
  const [editing, setEditing] = useState<string | null>(null)
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

  // The chronology editor: one draft per request, started from what was delivered.
  const draftOf = (row: Row): ChronologyDeliverable => chron[row.id] ?? { entries: row.deliverable?.entries ?? [], note: row.deliverable?.note ?? '' }
  const setDraft = (row: Row, d: ChronologyDeliverable) => setChron((c) => ({ ...c, [row.id]: d }))
  const setEntry = (row: Row, i: number, patch: Partial<ChronologyEntry>) => {
    const d = draftOf(row)
    setDraft(row, { ...d, entries: d.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  }
  const saveChronology = async (row: Row) => {
    const d = draftOf(row)
    const entries = d.entries
      .filter((e) => e.date.trim() || e.event.trim())
      .map((e) => ({ date: e.date.trim(), event: e.event.trim(), ...(String(e.volume ?? '').trim() ? { volume: String(e.volume).trim() } : {}), ...(String(e.page ?? '').trim() ? { page: String(e.page).trim() } : {}) }))
    const r = await opsDeliverChronology(row.id, { entries, ...(d.note?.trim() ? { note: d.note.trim() } : {}) })
    const body = await r.json().catch(() => ({}))
    setNotice(r.ok ? `Chronology saved — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.` : body.error ?? `Could not save (${r.status})`)
    if (r.ok) { setChron((c) => { const n = { ...c }; delete n[row.id]; return n }); await load() }
  }

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
      <p className="mt-2 text-xs text-[#8B949E]">Delivered by hand in January: a named reviewer, a status, a chronology table (date · volume · page · what the record shows) and a process note the organisation reads on its request. Describe the record; never what anyone should do about it — the api refuses a note with advice words. The SLA is 10 business days from filing on the same calendar as the family promise.{!isAdmin && ' Support may take a request on and mark it delivered; declining or reopening needs an Ops administrator.'}</p>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      <table className="mt-4 w-full border-collapse text-sm" data-testid="record-desk-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Status</th><th>Organisation</th><th>Kind</th><th className="text-right">Pages</th><th>Due</th><th>Reviewer</th><th>SLA</th><th>Request, chronology and process note</th>
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
                <div className="mt-2">
                  <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className="rounded border border-[#30363D] px-2 py-1 text-xs" data-testid={`chronology-toggle-${r.id}`}>
                    Chronology · {r.deliverable?.entries.length ?? 0} entr{(r.deliverable?.entries.length ?? 0) === 1 ? 'y' : 'ies'}{editing === r.id ? ' — close' : ''}
                  </button>
                  {editing === r.id && (
                    <div className="mt-2 rounded border border-[#30363D] bg-[#0D1117] p-2" data-testid={`chronology-editor-${r.id}`}>
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-[#8B949E]"><th className="pb-1">Date</th><th className="pb-1">Vol.</th><th className="pb-1">Page</th><th className="pb-1">What the record shows</th><th></th></tr>
                        </thead>
                        <tbody>
                          {draftOf(r).entries.map((e, i) => (
                            <tr key={i} className="align-top">
                              <td className="pr-1 pb-1"><input aria-label={`Entry ${i + 1} date`} value={e.date} onChange={(ev) => setEntry(r, i, { date: ev.target.value })} placeholder="2019-03-04" className={cell} /></td>
                              <td className="pr-1 pb-1"><input aria-label={`Entry ${i + 1} volume`} value={e.volume ?? ''} onChange={(ev) => setEntry(r, i, { volume: ev.target.value })} placeholder="RR3" className={cell} /></td>
                              <td className="pr-1 pb-1"><input aria-label={`Entry ${i + 1} page`} value={String(e.page ?? '')} onChange={(ev) => setEntry(r, i, { page: ev.target.value })} placeholder="214" className={cell} /></td>
                              <td className="pr-1 pb-1"><input aria-label={`Entry ${i + 1} event`} value={e.event} onChange={(ev) => setEntry(r, i, { event: ev.target.value })} placeholder="Motion to suppress heard; objection overruled." className={cell} /></td>
                              <td className="pb-1"><button type="button" aria-label={`Remove entry ${i + 1}`} onClick={() => setDraft(r, { ...draftOf(r), entries: draftOf(r).entries.filter((_, j) => j !== i) })} className="text-[#8B949E]">×</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDraft(r, { ...draftOf(r), entries: [...draftOf(r).entries, { ...EMPTY_ENTRY }] })} className="rounded border border-[#30363D] px-2 py-1 text-xs" data-testid={`chronology-add-${r.id}`}>Add entry</button>
                        <button type="button" onClick={() => void saveChronology(r)} className="rounded bg-[#D4AF37] px-2 py-1 text-xs font-semibold text-[#0B0E14]" data-testid={`chronology-save-${r.id}`}>Save chronology</button>
                      </div>
                      <textarea
                        aria-label={`Chronology note for ${r.organisation.name} ${KIND[r.kind]}`}
                        rows={2}
                        value={draftOf(r).note ?? ''}
                        onChange={(ev) => setDraft(r, { ...draftOf(r), note: ev.target.value })}
                        placeholder="Which volumes it was built from; what was not in the upload"
                        className="mt-2 w-full rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs"
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-[#8B949E]">Process note</div>
                <div className="mt-1 flex items-start gap-2">
                  <textarea
                    aria-label={`Process note for ${r.organisation.name} ${KIND[r.kind]}`}
                    rows={2}
                    value={notes[r.id] ?? r.staffNote ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="What was done with the record and when it was sent — never what anyone should do about it"
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
