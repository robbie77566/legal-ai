'use client'

/**
 * Bar verification queue (staff_console.md §12; persona_rollout_plan.md §3
 * "verification queue staffed"). Every PROFESSIONAL account that signed up
 * with a bar number and has not been decided. Verification is a HUMAN act:
 * the staff member looks the number up in the State Bar of Texas directory
 * themselves — nothing here calls the State Bar — and presses one of two
 * buttons. Admin decides; Support reads. Industrial Authority palette.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { opsListVerifications, opsRejectBar, opsVerifyBar } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

interface Row {
  id: string
  name: string | null
  email: string
  barNumber: string
  barState: string | null
  practiceType: string | null
  signedUpAt: string
  organisation: { id: string; name: string; kind: string; isTest: boolean } | null
  seat: string | null
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function VerificationsPage() {
  const role = useStaffRole()
  const canDecide = role === 'ADMIN'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [notice, setNotice] = useState('')
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await opsListVerifications()
    if (r.ok) setRows(((await r.json()) as { verifications: Row[] }).verifications)
    else setRows([])
  }, [])
  useEffect(() => { void load() }, [load])

  const verify = async (row: Row) => {
    if (!window.confirm(`Verify ${row.name ?? row.email}? They are emailed that their first review is free.`)) return
    setBusy(row.id)
    const r = await opsVerifyBar(row.id)
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    setNotice(r.ok ? `${row.name ?? row.email} verified${d.emailed ? ' — emailed.' : ' — the email could NOT be delivered; tell them yourself.'}` : d.error ?? `Could not verify (${r.status})`)
    await load()
  }
  const reject = async (row: Row) => {
    if (!rejecting || rejecting.id !== row.id || !rejecting.note.trim()) return
    setBusy(row.id)
    const r = await opsRejectBar(row.id, rejecting.note.trim())
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    setRejecting(null)
    setNotice(r.ok ? `${row.name ?? row.email}: recorded as not verified${d.emailed ? ' — a neutral email went out.' : ' — the email could NOT be delivered.'}` : d.error ?? `Could not record (${r.status})`)
    await load()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Bar verification</h1>
        <span className="text-xs text-[#8B949E]">{rows ? `${rows.length} waiting` : 'Loading…'}</span>
      </div>
      <p className="mt-2 max-w-3xl text-xs text-[#8B949E]" data-testid="verification-policy">
        Verification is a human act. Look the number up in the State Bar of Texas directory yourself and check the name
        matches — nothing on this page calls the State Bar. <strong className="text-[#E6EDF3]">Verify</strong> opens counsel review and emails
        the attorney that their first review is free. <strong className="text-[#E6EDF3]">Could not verify</strong> keeps the account as it is,
        sends a neutral email with no reason, and files your note in the audit log where only staff read it.
        {!canDecide && ' Deciding needs an Ops administrator; you can read the queue.'}
      </p>
      {notice && <p className="mt-3 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      <table className="mt-4 w-full border-collapse text-sm" data-testid="verifications-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Attorney</th><th>Bar number</th><th>Practice</th><th>Organisation</th><th>Signed up</th>{canDecide && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id} className="border-b border-[#21262D] align-top" data-testid={`verification-${r.id}`}>
              <td className="py-2">
                <div className="font-semibold">{r.name ?? '—'}</div>
                <div className="font-mono text-[11px] text-[#8B949E]">{r.email}</div>
              </td>
              <td className="font-mono">{r.barNumber} <span className="text-xs text-[#8B949E]">{r.barState ?? ''}</span></td>
              <td className="text-xs">{r.practiceType ?? '—'}</td>
              <td className="text-xs">
                {r.organisation ? (
                  <Link href={`/ops/organisations/${r.organisation.id}`} className="underline hover:text-[#D4AF37]">{r.organisation.name}</Link>
                ) : '—'}
                {r.organisation && <span className="ml-1 font-mono text-[10px] text-[#8B949E]">{r.organisation.kind}{r.seat ? ` · ${r.seat.toLowerCase()}` : ''}{r.organisation.isTest ? ' · TEST' : ''}</span>}
              </td>
              <td className="font-mono text-xs text-[#8B949E]">{when(r.signedUpAt)}</td>
              {canDecide && (
                <td className="text-right">
                  {rejecting?.id === r.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        value={rejecting.note}
                        onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                        placeholder="Why — staff only, never sent"
                        aria-label="Reason it could not be verified"
                        className="w-64 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs"
                      />
                      <button onClick={() => void reject(r)} disabled={!rejecting.note.trim() || busy === r.id} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922] disabled:opacity-40" data-testid={`reject-confirm-${r.id}`}>Record</button>
                      <button onClick={() => setRejecting(null)} className="text-xs text-[#8B949E]">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setRejecting({ id: r.id, note: '' })} disabled={busy === r.id} className="rounded border border-[#30363D] px-2 py-1 text-xs disabled:opacity-40" data-testid={`reject-${r.id}`}>Could not verify…</button>
                      <button onClick={() => void verify(r)} disabled={busy === r.id} className="rounded bg-[#D4AF37] px-2 py-1 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid={`verify-${r.id}`}>Verify</button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows && rows.length === 0 && <tr><td colSpan={canDecide ? 6 : 5} className="py-3 text-sm text-[#8B949E]">Nobody is waiting on a verification.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
