'use client'

/**
 * /counsel/org — the organisation (persona_rollout_plan.md §4 "unlimited
 * users", §5 I): members, pending invitations, the invite form and seat
 * removal for an OWNER; the allowance panel for offices and clinics; packs
 * and the credits list for firms. A PD office or clinic needs the `offices`
 * flag for this page (the api answers 404 — "Not available" — otherwise);
 * packs and credits need counsel_checkout.
 */
import { useCallback, useEffect, useState } from 'react'
import { buyPack, getAllowance, getCounselOrganisation, inviteColleague, listCredits, removeMember, type MembershipRole, type Rung } from '@/lib/api'
import { useCounsel } from '@/components/counsel/CounselContext'
import NotAvailable from '@/components/counsel/NotAvailable'
import { LADDER, PACK_DISCOUNT_PERCENT } from '@/lib/content/professional'

interface Member { userId: string; role: MembershipRole; email: string; name: string | null; practiceType: string | null; barVerified: boolean; since: string }
interface Invitation { id: string; email: string; role: MembershipRole; expiresAt: string }
interface Org {
  organisation: { id: string; kind: string; name: string; legalName: string | null; billingEmail: string | null; pilot: boolean; pilotEndsAt: string | null; allowanceRecords: number; allowanceResetsAt: string | null; publicInterest: boolean }
  membership: { role: MembershipRole }
  members: Member[]
  invitations: Invitation[]
}
interface Allowance { kind: 'PILOT' | 'PUBLIC_INTEREST' | 'OFFICE'; granted: number; used: number; remaining: number; resetsAt: string | null; pilot: boolean }
interface Credit { id: string; packId: string; rung: Rung; issuedAt: string; expiresAt: string; consumedAt: string | null; state: 'LIVE' | 'EXPIRED' | 'CONSUMED' }

const ROLE_LABEL: Record<MembershipRole, string> = { OWNER: 'Owner', ATTORNEY: 'Attorney', INVESTIGATOR: 'Investigator', VIEWER: 'Viewer' }
const KIND_LABEL: Record<string, string> = { FIRM: 'Firm', PD_OFFICE: 'Public defender office', CLINIC: 'Clinic' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const PACK_PRICES: Record<Rung, number> = { SHORT: LADDER[0].price * 5 * (1 - PACK_DISCOUNT_PERCENT / 100), STANDARD: LADDER[1].price * 5 * (1 - PACK_DISCOUNT_PERCENT / 100), EXTENDED: LADDER[2].price * 5 * (1 - PACK_DISCOUNT_PERCENT / 100) }

export default function OrganisationPage() {
  const { me, flags } = useCounsel()
  const [org, setOrg] = useState<Org | null>(null)
  const [dark, setDark] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invite, setInvite] = useState<{ email: string; role: MembershipRole }>({ email: '', role: 'ATTORNEY' })
  const [busy, setBusy] = useState(false)
  const [allowance, setAllowance] = useState<Allowance | null>(null)
  const [credits, setCredits] = useState<Credit[] | null>(null)

  const load = useCallback(async () => {
    const r = await getCounselOrganisation()
    if (r.status === 404) {
      setDark(true)
      return
    }
    if (!r.ok) {
      setError('We could not load the organisation just now. Refresh the page.')
      return
    }
    setOrg((await r.json()) as Org)
    if (flags.counsel_checkout) {
      void getAllowance().then(async (a) => { if (a.ok) setAllowance(((await a.json()) as { allowance: Allowance | null }).allowance) }).catch(() => {})
      void listCredits().then(async (c) => { if (c.ok) setCredits(((await c.json()) as { credits: Credit[] }).credits) }).catch(() => {})
    }
  }, [flags.counsel_checkout])

  useEffect(() => {
    void load()
  }, [load])

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await inviteColleague(invite)
      const body = (await r.json().catch(() => ({}))) as { error?: string; invite?: { delivered: boolean; error?: string; acceptUrl?: string } }
      if (!r.ok) throw new Error(body.error ?? 'Could not send the invitation.')
      setNotice(
        body.invite?.delivered
          ? `Invitation sent to ${invite.email}. The link works for 7 days.`
          : `The invitation was created but the email could not be sent${body.invite?.error ? ` (${body.invite.error})` : ''}. Share this link, which works for 7 days: ${body.invite?.acceptUrl ?? ''}`
      )
      setInvite({ email: '', role: 'ATTORNEY' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m: Member) => {
    if (!window.confirm(`Remove ${m.name || m.email}'s seat? Their account stays; their access to this organisation ends on their next request.`)) return
    setBusy(true)
    setError('')
    try {
      const r = await removeMember(m.userId)
      const body = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(body.error ?? 'Could not remove the seat.')
      setNotice(`${m.name || m.email} no longer has a seat here.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the seat.')
    } finally {
      setBusy(false)
    }
  }

  const pack = async (rung: Rung) => {
    setBusy(true)
    setError('')
    try {
      const r = await buyPack(rung)
      const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (r.status === 503) throw new Error('Payments are not switched on in this environment yet — nothing was charged.')
      if (!r.ok || !body.url) throw new Error(body.error ?? 'Could not start the purchase.')
      window.location.href = body.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the purchase.')
      setBusy(false)
    }
  }

  if (dark) return <NotAvailable what="The organisation page" />
  if (error && !org) return <p role="alert" className="py-10" style={{ color: 'var(--db-urgent)' }}>{error}</p>
  if (!org) return <p className="py-10 text-sm text-db-muted">Loading…</p>

  const owner = org.membership.role === 'OWNER'
  const isFirm = org.organisation.kind === 'FIRM'
  const live = (credits ?? []).filter((c) => c.state === 'LIVE')

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm text-db-muted">{KIND_LABEL[org.organisation.kind] ?? org.organisation.kind}</p>
        <h1 className="mt-1 font-db-serif text-3xl font-semibold" data-testid="org-name">{org.organisation.name}</h1>
        {org.organisation.legalName && <p className="text-sm text-db-muted">{org.organisation.legalName}</p>}
      </div>

      {notice && <p role="status" data-testid="org-notice" className="rounded-xl border border-db-line bg-db-surface p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>{error}</p>}

      {!isFirm && (
        <section data-testid="allowance-panel" className="rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold">{org.organisation.pilot ? 'Pilot allowance' : org.organisation.publicInterest ? 'Public-interest allowance' : 'Allowance'}</h2>
          {allowance ? (
            <p className="mt-2 text-[15px]">
              <span className="font-db-serif text-2xl font-semibold">{allowance.remaining}</span> of {allowance.granted} records left
              {allowance.resetsAt ? ` · ${allowance.pilot ? 'pilot ends' : 'renews'} ${day(allowance.resetsAt)}` : ''}. One record is drawn down when its analysis starts.
            </p>
          ) : org.organisation.allowanceRecords > 0 ? (
            <p className="mt-2 text-[15px]">
              {org.organisation.allowanceRecords} records granted{org.organisation.allowanceResetsAt ? ` until ${day(org.organisation.allowanceResetsAt)}` : ''}.
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-db-muted">No allowance yet. For a public defender office the pilot is 15 records in 90 days, free; for a clinic, 25 records a year. Ask us to start it.</p>
          )}
        </section>
      )}

      {isFirm && flags.counsel_checkout && (
        <section data-testid="packs-panel" className="rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold">Five-record packs</h2>
          <p className="mt-1 text-sm text-db-muted">Five records of one rung, {PACK_DISCOUNT_PERCENT}% off, good for twelve months. A credit is spent automatically when a record of that rung or lower is quoted.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {LADDER.map((r) => (
              <button key={r.rung} type="button" disabled={busy || !owner} onClick={() => void pack(r.rung)} className="rounded-xl border border-db-line p-4 text-left hover:border-db-accent disabled:opacity-50" data-testid={`pack-${r.rung}`}>
                <span className="block text-xs font-semibold uppercase tracking-wider text-db-muted">{r.label} × 5</span>
                <span className="mt-1 block font-db-serif text-2xl font-semibold">${PACK_PRICES[r.rung].toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                <span className="block text-xs text-db-muted">{r.pages}</span>
              </button>
            ))}
          </div>
          {!owner && <p className="mt-2 text-xs text-db-muted">Only an owner buys packs.</p>}
          <h3 className="mt-5 text-sm font-semibold">Credits</h3>
          {credits === null ? (
            <p className="mt-1 text-sm text-db-muted">Loading…</p>
          ) : credits.length === 0 ? (
            <p className="mt-1 text-sm text-db-muted" data-testid="credits-empty">No credits yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-db-line text-sm" data-testid="credits-list">
              {credits.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{c.rung.charAt(0) + c.rung.slice(1).toLowerCase()} credit · issued {day(c.issuedAt)}</span>
                  <span className={c.state === 'LIVE' ? 'font-semibold' : 'text-db-muted'}>{c.state === 'LIVE' ? `Unspent · expires ${day(c.expiresAt)}` : c.state === 'CONSUMED' ? `Spent ${c.consumedAt ? day(c.consumedAt) : ''}` : `Expired ${day(c.expiresAt)}`}</span>
                </li>
              ))}
            </ul>
          )}
          {live.length > 0 && <p className="mt-2 text-xs text-db-muted">{live.length} unspent.</p>}
        </section>
      )}

      <section data-testid="members" className="rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-xl font-semibold">Members</h2>
        <ul className="mt-3 divide-y divide-db-line">
          {org.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid={`member-${m.role}`}>
              <div>
                <span className="font-semibold">{m.name || m.email}</span>
                {m.name && <span className="ml-2 font-db-mono text-xs text-db-muted">{m.email}</span>}
                <div className="text-sm text-db-muted">
                  {ROLE_LABEL[m.role]}{m.barVerified ? ' · bar verified' : ''} · since {day(m.since)}
                </div>
              </div>
              {owner && m.userId !== me?.user.id && (
                <button type="button" onClick={() => void remove(m)} disabled={busy} className="text-sm underline" style={{ color: 'var(--db-urgent)' }} data-testid={`remove-${m.userId}`}>
                  Remove seat
                </button>
              )}
            </li>
          ))}
        </ul>
        {org.invitations.length > 0 && (
          <div className="mt-4" data-testid="invitations">
            <h3 className="text-sm font-semibold">Pending invitations</h3>
            <ul className="mt-1 text-sm text-db-muted">
              {org.invitations.map((i) => (
                <li key={i.id}>{i.email} · {ROLE_LABEL[i.role]} · expires {day(i.expiresAt)}</li>
              ))}
            </ul>
          </div>
        )}
        {owner ? (
          <form onSubmit={sendInvite} className="mt-5 flex flex-wrap items-end gap-2" data-testid="invite-form">
            <label className="block grow">
              <span className="text-sm font-semibold">Invite a colleague</span>
              <input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="email" className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-2.5 text-[15px]" aria-label="Colleague's email" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Seat</span>
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as MembershipRole })} className="mt-1 rounded-lg border border-db-line bg-db-surface p-2.5 text-[15px]" aria-label="Seat">
                {(['OWNER', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER'] as MembershipRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy} className="rounded-lg bg-db-accent px-4 py-2.5 font-semibold text-db-surface disabled:opacity-40" data-testid="invite-submit">
              Send invitation
            </button>
            <p className="w-full text-xs text-db-muted">Investigator and viewer seats are free and unlimited. The link in the email works for 7 days.</p>
          </form>
        ) : (
          <p className="mt-4 text-sm text-db-muted">Only an owner invites colleagues or removes a seat.</p>
        )}
      </section>
    </section>
  )
}
