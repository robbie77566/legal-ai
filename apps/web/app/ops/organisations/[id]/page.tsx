'use client'

/**
 * One organisation (staff_console.md §11–§12): the profile an Admin edits
 * (PATCH), the two grants (Start pilot, Grant public-interest allowance),
 * the members and pending invitations, the pilot metrics, and — for Admin,
 * because invoices are money — the ACH invoices for this organisation.
 * Support reads all but the invoices.
 *
 * Clinic verification (UPL review 2026-10-23, P3): a CLINIC receives
 * consented packets only once an Admin has recorded the supervising
 * attorney's bar number here (POST /ops/organisations/:id/clinic-verify,
 * audited without the number). Clearing it closes the inbox again.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { opsGetOrganisation, opsGrantPublicInterest, opsListInvoices, opsOrganisationMetrics, opsPatchOrganisation, opsStartPilot, opsUnverifyClinic, opsVerifyClinic, type OrganisationKind, type OrganisationPatch } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'
import { KIND_LABEL, day, type OrganisationMetrics, type OrganisationRow } from '@/lib/organisations'

/** The clinic verification columns (staff view only; the bar number never reaches the clinic's own pages). */
type ClinicVerification = { clinicVerifiedAt?: string | null; clinicSupervisingBar?: string | null; clinicVerifiedBy?: string | null }
interface Detail {
  organisation: OrganisationRow & ClinicVerification
  members: Array<{ userId: string; role: string; email: string; name: string | null; practiceType: string | null; barVerified: boolean; since: string }>
  invitations: Array<{ id: string; email: string; role: string; expiresAt: string; createdAt: string }>
}
interface InvoiceRow { id: string; number: string; status: 'DRAFT' | 'SENT' | 'PAID' | 'VOID'; totalCents: number; lines: Array<{ caseId: string; causeNumber?: string; sku: string; cents: number }>; paidAt: string | null; achReference: string | null; createdAt: string }

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const fromInput = (v: string) => (v ? new Date(`${v}T00:00:00.000Z`).toISOString() : null)

export default function OrganisationPage() {
  const { id } = useParams<{ id: string }>()
  const role = useStaffRole()
  const canWrite = role === 'ADMIN'
  const [detail, setDetail] = useState<Detail | null>(null)
  const [metrics, setMetrics] = useState<OrganisationMetrics | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null)
  const [form, setForm] = useState<Record<string, string | boolean>>({})
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [supervisingBar, setSupervisingBar] = useState('')

  const load = useCallback(async () => {
    const [d, m] = await Promise.all([opsGetOrganisation(id), opsOrganisationMetrics(id)])
    if (d.ok) {
      const body = (await d.json()) as Detail
      setDetail(body)
      const o = body.organisation
      setForm({
        name: o.name, legalName: o.legalName ?? '', billingEmail: o.billingEmail ?? '', securityContact: o.securityContact ?? '', kind: o.kind,
        pilot: o.pilot, pilotEndsAt: toInput(o.pilotEndsAt), allowanceRecords: String(o.allowanceRecords), allowanceResetsAt: toInput(o.allowanceResetsAt),
        publicInterest: o.publicInterest, isTest: o.isTest,
      })
    }
    if (m.ok) setMetrics((await m.json()) as OrganisationMetrics)
  }, [id])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (role !== 'ADMIN') return
    void opsListInvoices({ organisationId: id }).then(async (r) => r.ok && setInvoices((await r.json()) as InvoiceRow[]))
  }, [id, role])

  const act = async (p: Promise<Response>, done: string) => {
    setSaving(true); setNotice('')
    const r = await p
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    setNotice(r.ok ? done : d.error ?? `Could not save (${r.status})`)
    if (r.ok) await load()
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detail) return
    const o = detail.organisation
    const patch: OrganisationPatch = {}
    const str = (k: string) => String(form[k] ?? '').trim()
    if (str('name') && str('name') !== o.name) patch.name = str('name')
    if (str('legalName') !== (o.legalName ?? '')) patch.legalName = str('legalName') || null
    if (str('billingEmail') !== (o.billingEmail ?? '')) patch.billingEmail = str('billingEmail') || null
    if (str('securityContact') !== (o.securityContact ?? '')) patch.securityContact = str('securityContact') || null
    if (form.kind !== o.kind && form.kind !== 'FAMILY') patch.kind = form.kind as OrganisationKind
    if (form.pilot !== o.pilot) patch.pilot = !!form.pilot
    if (str('pilotEndsAt') !== toInput(o.pilotEndsAt)) patch.pilotEndsAt = fromInput(str('pilotEndsAt'))
    if (Number(form.allowanceRecords) !== o.allowanceRecords) patch.allowanceRecords = Number(form.allowanceRecords)
    if (str('allowanceResetsAt') !== toInput(o.allowanceResetsAt)) patch.allowanceResetsAt = fromInput(str('allowanceResetsAt'))
    if (form.publicInterest !== o.publicInterest) patch.publicInterest = !!form.publicInterest
    if (form.isTest !== o.isTest) patch.isTest = !!form.isTest
    if (Object.keys(patch).length === 0) { setNotice('Nothing changed.'); return }
    await act(opsPatchOrganisation(id, patch), 'Saved — audited under your name.')
  }

  const o = detail?.organisation
  const field = (k: string, label: string, type = 'text') => (
    <label className="block text-[11px] uppercase tracking-wider text-[#8B949E]">
      {label}
      <input type={type} value={String(form[k] ?? '')} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} disabled={!canWrite} className="mt-1 block w-full rounded border border-[#30363D] bg-[#161B22] p-1.5 text-sm normal-case tracking-normal text-[#E6EDF3] disabled:opacity-70" />
    </label>
  )
  const flag = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} disabled={!canWrite} /> {label}
    </label>
  )

  return (
    <div>
      <Link href="/ops/organisations" className="text-xs text-[#8B949E] underline">← Organisations</Link>
      {!o ? <p className="mt-3 text-sm text-[#8B949E]">Loading…</p> : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-xl font-bold text-[#D4AF37]" data-testid="organisation-name">{o.name}</h1>
            <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] text-[#8B949E]">{KIND_LABEL[o.kind] ?? o.kind}</span>
            {o.pilot && <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] text-[#3FB950]">PILOT</span>}
            {o.publicInterest && <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] text-[#3B82F6]">PUBLIC INTEREST</span>}
            {o.isTest && <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] text-[#D29922]">TEST — excluded from Money</span>}
            {o.kind === 'CLINIC' && (
              <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] ${o.clinicVerifiedAt ? 'text-[#3FB950]' : 'text-[#D29922]'}`} data-testid="clinic-badge">
                {o.clinicVerifiedAt ? 'CLINIC VERIFIED' : 'CLINIC — NOT VERIFIED'}
              </span>
            )}
            <span className="font-mono text-[11px] text-[#8B949E]">tenant {o.tenantId}</span>
          </div>
          {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

          {metrics && (
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="metrics">
              {[
                ['Records opened', String(metrics.recordsOpened)],
                ['Analyses run', String(metrics.analysesRun)],
                ['Allowance used', `${metrics.allowance.used} of ${metrics.allowance.granted}`],
                ['Allowance left', String(metrics.allowance.remaining)],
                ['Last activity', metrics.lastActivity ? day(metrics.lastActivity) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-[#30363D] bg-[#0D1117] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-[#8B949E]">{label}</div>
                  <div className="mt-1 font-mono text-lg font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <form onSubmit={(e) => void save(e)} className="rounded border border-[#30363D] bg-[#0D1117] p-4" data-testid="organisation-form">
              <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Profile and grants{!canWrite && ' · read-only for Support'}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {field('name', 'Name')}
                <label className="block text-[11px] uppercase tracking-wider text-[#8B949E]">
                  Kind
                  <select value={String(form.kind ?? '')} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} disabled={!canWrite} className="mt-1 block w-full rounded border border-[#30363D] bg-[#161B22] p-1.5 text-sm normal-case tracking-normal text-[#E6EDF3]">
                    {(['FIRM', 'PD_OFFICE', 'CLINIC'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </label>
                {field('legalName', 'Legal name')}
                {field('billingEmail', 'Billing email', 'email')}
                {field('securityContact', 'Security contact')}
                {field('allowanceRecords', 'Allowance (records)', 'number')}
                {field('allowanceResetsAt', 'Allowance resets', 'date')}
                {field('pilotEndsAt', 'Pilot ends', 'date')}
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                {flag('pilot', 'On a pilot')}
                {flag('publicInterest', 'Public-interest allowance')}
                {flag('isTest', 'Test organisation (hidden from Money)')}
              </div>
              {canWrite && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={saving} className="rounded bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid="save-organisation">Save changes</button>
                  <button type="button" disabled={saving} onClick={() => { if (window.confirm('Start the 90-day pilot: 15 records at $0 from today?')) void act(opsStartPilot(id), 'Pilot started — 15 records, 90 days.') }} className="rounded border border-[#3FB950] px-3 py-1.5 text-xs text-[#3FB950] disabled:opacity-40" data-testid="start-pilot">Start pilot</button>
                  <button type="button" disabled={saving} onClick={() => { if (window.confirm('Grant the public-interest allowance: 25 records a year at $0 from today?')) void act(opsGrantPublicInterest(id), 'Public-interest allowance granted — 25 records a year.') }} className="rounded border border-[#3B82F6] px-3 py-1.5 text-xs text-[#3B82F6] disabled:opacity-40" data-testid="grant-public-interest">Grant public-interest allowance</button>
                </div>
              )}
            </form>

            <aside>
              {o.kind === 'CLINIC' && (
                <section className="mb-5 rounded border border-[#30363D] bg-[#0D1117] p-4" data-testid="clinic-verification">
                  <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Clinic verification</h2>
                  <p className="mt-2 text-xs text-[#8B949E]">
                    A clinic receives consented packets only once a person here has verified it and recorded its supervising attorney&rsquo;s Texas bar number — look the number up in the State Bar directory yourself. Clearing it closes the inbox on the clinic&rsquo;s next request.
                  </p>
                  {o.clinicVerifiedAt ? (
                    <div className="mt-3 text-xs" data-testid="clinic-verified">
                      <div>Verified {day(o.clinicVerifiedAt)}{o.clinicVerifiedBy ? ` · by ${o.clinicVerifiedBy}` : ''}</div>
                      <div className="mt-1">Supervising attorney bar no. <span className="font-mono">{o.clinicSupervisingBar ?? '—'}</span></div>
                      {canWrite && (
                        <button type="button" disabled={saving} onClick={() => { if (window.confirm('Clear the clinic verification? Families can no longer deliver packets to this clinic and its inbox closes.')) void act(opsUnverifyClinic(id), 'Clinic verification cleared — audited under your name.') }} className="mt-3 rounded border border-[#D29922] px-3 py-1.5 text-xs text-[#D29922] disabled:opacity-40" data-testid="clinic-unverify">Clear verification</button>
                      )}
                    </div>
                  ) : canWrite ? (
                    <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!supervisingBar.trim()) return; void act(opsVerifyClinic(id, supervisingBar.trim()), 'Clinic verified — packets can now be delivered to its inbox. Audited under your name.'); setSupervisingBar('') }} data-testid="clinic-verify-form">
                      <label className="block grow text-[11px] uppercase tracking-wider text-[#8B949E]">
                        Supervising attorney&rsquo;s bar number
                        <input value={supervisingBar} onChange={(e) => setSupervisingBar(e.target.value)} maxLength={32} inputMode="numeric" aria-label="Supervising attorney's bar number" className="mt-1 block w-full rounded border border-[#30363D] bg-[#161B22] p-1.5 font-mono text-sm normal-case tracking-normal text-[#E6EDF3]" />
                      </label>
                      <button type="submit" disabled={saving || !supervisingBar.trim()} className="rounded bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#0B0E14] disabled:opacity-40" data-testid="clinic-verify">Verify clinic</button>
                    </form>
                  ) : (
                    <p className="mt-3 text-xs text-[#D29922]">Not verified. An Ops administrator records the supervising attorney.</p>
                  )}
                </section>
              )}
              <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Members</h2>
              <div className="mt-2 rounded border border-[#30363D] bg-[#161B22] text-xs" data-testid="members">
                {detail!.members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 border-b border-[#21262D] px-3 py-2 last:border-b-0">
                    <span className="w-24 shrink-0 font-mono text-[10px] text-[#8B949E]">{m.role}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}{m.name ? <span className="text-[#8B949E]"> · {m.email}</span> : null}</span>
                    <span className={`shrink-0 font-mono text-[10px] ${m.barVerified ? 'text-[#3FB950]' : 'text-[#8B949E]'}`}>{m.barVerified ? 'BAR ✓' : m.practiceType ?? ''}</span>
                  </div>
                ))}
                {detail!.invitations.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 border-b border-[#21262D] px-3 py-2 text-[#8B949E] last:border-b-0">
                    <span className="w-24 shrink-0 font-mono text-[10px]">{i.role} · invited</span>
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <span className="shrink-0 font-mono text-[10px]">until {day(i.expiresAt)}</span>
                  </div>
                ))}
                {detail!.members.length === 0 && detail!.invitations.length === 0 && <p className="p-3 text-[#8B949E]">No seats yet.</p>}
              </div>

              {role === 'ADMIN' && (
                <>
                  <h2 className="mt-5 text-[11px] uppercase tracking-wider text-[#8B949E]">Invoices</h2>
                  <div className="mt-2 rounded border border-[#30363D] bg-[#161B22] text-xs" data-testid="organisation-invoices">
                    {invoices?.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-2 border-b border-[#21262D] px-3 py-2 last:border-b-0">
                        <span className="font-mono">{inv.number}</span>
                        <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[10px] ${inv.status === 'PAID' ? 'text-[#3FB950]' : 'text-[#D29922]'}`}>{inv.status}</span>
                        <span className="min-w-0 flex-1 truncate text-[#8B949E]">{inv.lines.length} line{inv.lines.length === 1 ? '' : 's'}{inv.achReference ? ` · ${inv.achReference}` : ''}</span>
                        <span className="font-mono tabular-nums">{usd(inv.totalCents)}</span>
                      </div>
                    ))}
                    {invoices && invoices.length === 0 && <p className="p-3 text-[#8B949E]">No invoices. Draft one on <Link href="/ops/money" className="underline">Money</Link>.</p>}
                    {!invoices && <p className="p-3 text-[#8B949E]">Loading…</p>}
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
