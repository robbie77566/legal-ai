'use client'

/**
 * Your account (your_account spec): the signed-in home. The review first,
 * then the account, payments, sharing, the emails we send, and their data.
 * Every row is a fact with one action; nothing is a form until Change.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { apiFetch, API_URL } from '@/lib/api'
import FamilyNav, { firstName } from '../../../components/daybreak/FamilyNav'
import { trackerModel } from '@/lib/tracker'
import type { CustomerView } from '@hg/case-lifecycle'

interface Review {
  id: string; title: string; status: string; stage: CustomerView; expectedReadyAt: string | null; factsLine: string
  documents: number; pages: number; reportVersions: Array<{ versionNo: number; renderedAt: string }>
  shareLink: { createdAt: string; expiresAt: string; revokedAt: string | null; opens: number } | null; clinicConsent: boolean
}
interface Me {
  user: { name: string | null; email: string; pendingEmail: string | null; passwordChangedAt: string | null; memberSince: string }
  reviews: Review[]
  payments: Array<{ id: string; kind: string; amountCents: number; status: string; free: boolean; promoCode: string | null; cardBrand: string | null; cardLast4: string | null; receiptUrl: string | null; caseTitle: string | null; createdAt: string }>
  refunds: Array<{ id: string; amountCents: number; reason: string; partial: boolean; caseTitle: string | null; createdAt: string }>
  acks: Array<{ ackAt: string; version: string }>
  deletionRequest: { createdAt: string } | null
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`
const day = (iso: string, year = false) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(year ? { year: 'numeric' } : {}) })
const REASON: Record<string, string> = { unreadable_record: 'unreadable pages', customer_request: 'at your request', chargeback: 'chargeback', other: '' }
const KIND: Record<string, string> = { REVIEW: 'Family Case Review', OVERAGE: 'Additional pages', RERUN: 'Re-run', REFUND: 'Refund' }

function primaryAction(r: Review): { href: string; label: string } {
  if (r.status === 'AWAITING_DOCS') return { href: `/case/${r.id}/documents`, label: 'Continue your checklist' }
  if (r.reportVersions.length || r.status === 'READY' || r.status === 'DELIVERED') return { href: `/case/${r.id}/report`, label: 'See your report' }
  return { href: `/case/${r.id}/status`, label: 'Watch progress' }
}
function statusLine(r: Review): string {
  const m = trackerModel(r.stage)
  if (m.overlayCopy) return m.overlayCopy.split(' — ')[0].replace(/\.$/, '') + (r.expectedReadyAt ? ` — expect your report by ${day(r.expectedReadyAt)}.` : '.')
  if (m.delivered || r.reportVersions.length) return 'Your report is ready.'
  if (m.activeIndex === -1) return `Waiting on your documents · ${r.documents} received.`
  return `${m.stages[m.activeIndex]?.label ?? 'In progress'}${r.expectedReadyAt ? ` — expect your report by ${day(r.expectedReadyAt)}.` : '.'}`
}

function Row({ label, value, action, testid }: { label: string; value: React.ReactNode; action?: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-db-line px-4 py-3.5 first:border-t-0" data-testid={testid}>
      <div className="min-w-0"><div className="text-[13px] text-db-muted">{label}</div><div className="break-words">{value}</div></div>
      {action && <div className="shrink-0 text-[15px]">{action}</div>}
    </div>
  )
}

export default function AccountPage() {
  const { update } = useSession()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<'name' | 'email' | 'password' | 'delete' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await apiFetch('/me')
    if (r.status === 401) { window.location.href = '/auth/signin?callbackUrl=/account'; return }
    if (!r.ok) { setError('We could not load your account just now. Please refresh.'); return }
    setMe(await r.json())
  }, [])
  useEffect(() => { void load() }, [load])

  const post = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setNotice('')
    const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setNotice(d.error ?? 'That didn’t save — please try again.'); return null }
    return d
  }

  if (error) return <main className="mx-auto max-w-xl px-5 py-12"><p role="alert" style={{ color: 'var(--db-urgent)' }}>{error}</p></main>
  if (!me) return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">Loading…</main>
  const u = me.user

  return (
    <>
      <FamilyNav />
      <main className="mx-auto max-w-xl px-5 pb-12 pt-2">
        <h1 className="font-db-serif text-[28px] font-semibold" data-testid="greeting">Hello, {firstName(u.name, u.email)}.</h1>
        <p className="mt-1 text-[15px] text-db-muted">Signed in as <span className="font-db-mono">{u.email}</span></p>
        {notice && <p role="status" data-testid="notice" className="mt-3 rounded-xl border border-db-line bg-db-surface p-3 text-sm">{notice}</p>}

        <section className="mt-6" data-testid="reviews">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">{me.reviews.length === 1 ? 'Your review' : 'Your reviews'}</h2>
          <div className="mt-2 space-y-3">
            {me.reviews.map((r, i) => {
              const a = primaryAction(r)
              return (
                <div key={r.id} data-testid="case-card" className={`rounded-xl bg-db-surface p-5 ${i === 0 ? 'border-2 border-db-accent' : 'border border-db-line'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-db-serif text-xl font-semibold">{r.title}</h3>
                    <span className="whitespace-nowrap rounded-full bg-db-accent-soft px-3 py-1 text-xs font-semibold text-db-accent">{r.stage.stage.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-2 text-[15px]">{statusLine(r)}</p>
                  {(r.factsLine || r.documents > 0) && (
                    <p className="mt-1 text-sm text-db-muted">{[r.factsLine, r.documents ? `${r.documents} document${r.documents === 1 ? '' : 's'} · ${r.pages} pages read` : null].filter(Boolean).join(' · ')}</p>
                  )}
                  <Link href={a.href} className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface">{a.label}</Link>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <Link href={`/case/${r.id}`}>Overview</Link><Link href={`/case/${r.id}/documents`}>Documents</Link><Link href={`/case/${r.id}/report`}>Report</Link><Link href={`/case/${r.id}/next-steps`}>Next steps</Link>
                  </div>
                </div>
              )
            })}
            {me.reviews.length === 0 && <p className="text-db-muted">No reviews yet — the free check is where every review starts.</p>}
          </div>
          <Link href="/check" className="mt-3 inline-block rounded-xl border-2 border-db-accent px-5 py-3 font-semibold text-db-accent">Start another review</Link>
        </section>

        <section className="mt-8" id="settings" data-testid="account">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Account</h2>
          <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
            <Row label="Name" value={editing === 'name' ? (
              <form className="mt-1 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const d = await post('/me', 'PATCH', { name: form.name }); if (d) { setEditing(null); await update({ name: d.name }); setNotice('Name updated.'); await load() } }}>
                <input aria-label="Name" value={form.name ?? u.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" required maxLength={100} />
                <button disabled={busy} className="rounded-lg bg-db-accent px-3 font-semibold text-db-surface">Save</button>
              </form>
            ) : (u.name || <span className="text-db-muted">Not set</span>)} action={editing === 'name' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({ name: u.name ?? '' }); setEditing('name') }} className="text-db-accent">Change</button>} />

            <Row label="Email — where we send everything" value={<>
              <span className="font-db-mono text-[15px]">{u.email}</span>
              {u.pendingEmail && <div className="mt-1 text-sm" data-testid="pending-email">Pending — check <span className="font-db-mono">{u.pendingEmail}</span> for a confirmation link. <button onClick={async () => { const d = await post('/me/email/pending', 'DELETE'); if (d) { setNotice('Change cancelled.'); await load() } }} className="underline">Cancel</button></div>}
              {editing === 'email' && (
                <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); const d = await post('/me/email', 'POST', { newEmail: form.newEmail, currentPassword: form.currentPassword }); if (d) { setEditing(null); setNotice(`We sent a confirmation link to ${d.pendingEmail}. Your email changes once you open it.`); await load() } }}>
                  <input aria-label="New email" type="email" required placeholder="New email address" value={form.newEmail ?? ''} onChange={(e) => setForm({ ...form, newEmail: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" />
                  <input aria-label="Current password" type="password" required placeholder="Current password" value={form.currentPassword ?? ''} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" />
                  <button disabled={busy} className="rounded-lg bg-db-accent px-3 py-2 font-semibold text-db-surface">Send confirmation</button>
                </form>
              )}
            </>} action={editing === 'email' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({}); setEditing('email') }} className="text-db-accent">Change</button>} />

            <Row label="Password" value={<>
              {u.passwordChangedAt ? `Last changed ${day(u.passwordChangedAt)}` : 'Set'}
              {editing === 'password' && (
                <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (form.newPassword !== form.confirm) { setNotice('The passwords don’t match.'); return } const d = await post('/me/password', 'POST', { currentPassword: form.currentPassword, newPassword: form.newPassword }); if (d) { setEditing(null); await update({ passwordChanged: true }); setNotice('Password changed. Other devices were signed out.'); await load() } }}>
                  <input aria-label="Current password" type="password" required placeholder="Current password" value={form.currentPassword ?? ''} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" />
                  <input aria-label="New password" type="password" required minLength={12} placeholder="New password (12+ characters)" value={form.newPassword ?? ''} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" />
                  <input aria-label="Confirm new password" type="password" required placeholder="Confirm new password" value={form.confirm ?? ''} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className="w-full rounded-lg border border-db-line p-2 text-[15px]" />
                  <button disabled={busy} className="rounded-lg bg-db-accent px-3 py-2 font-semibold text-db-surface">Change password</button>
                </form>
              )}
            </>} action={editing === 'password' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({}); setEditing('password') }} className="text-db-accent">Change</button>} />
          </div>
        </section>

        <section className="mt-8" data-testid="payments">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Payments &amp; receipts</h2>
          <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
            {me.payments.map((p) => (
              <Row key={p.id} label={`${day(p.createdAt, true)}${p.free ? ` · promo ${p.promoCode ?? ''}` : p.cardLast4 ? ` · ${p.cardBrand ? p.cardBrand[0].toUpperCase() + p.cardBrand.slice(1) : 'Card'} ····${p.cardLast4}` : ''}`}
                value={`${KIND[p.kind] ?? p.kind}${p.caseTitle ? ` · ${p.caseTitle}` : ''}`}
                action={<div className="text-right"><div className="font-db-mono">{usd(p.amountCents)}</div>{p.free ? <span className="text-[13px] text-db-muted">free</span> : p.receiptUrl ? <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-[13px]">Receipt</a> : null}</div>} />
            ))}
            {me.refunds.map((r) => (
              <Row key={r.id} label={`${day(r.createdAt, true)} · usually back on your card within 5–10 business days`}
                value={`Refund${REASON[r.reason] ? ` — ${REASON[r.reason]}` : ''}${r.caseTitle ? ` · ${r.caseTitle}` : ''}`}
                action={<div className="font-db-mono" style={{ color: 'var(--db-signal)' }}>−{usd(r.amountCents)}</div>} />
            ))}
            {me.payments.length === 0 && <p className="p-4 text-db-muted">Nothing paid yet.</p>}
          </div>
          <p className="mt-2 text-sm text-db-muted">Need a refund? Reply to any of our emails or use <Link href="/contact">Contact</Link> — a person reads it.</p>
        </section>

        <section className="mt-8" data-testid="sharing">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Sharing &amp; consent</h2>
          <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
            {me.reviews.map((r) => (
              <Row key={r.id} label={`Lawyer link${me.reviews.length > 1 ? ` · ${r.title}` : ''}`}
                value={r.shareLink ? (r.shareLink.revokedAt ? `Turned off ${day(r.shareLink.revokedAt)}` : `Created ${day(r.shareLink.createdAt)} · expires ${day(r.shareLink.expiresAt)} · opened ${r.shareLink.opens} time${r.shareLink.opens === 1 ? '' : 's'}`) : <span className="text-db-muted">Not yet — available from Next steps once the report is out</span>}
                action={r.reportVersions.length ? <Link href={`/case/${r.id}/next-steps`}>Manage</Link> : undefined} />
            ))}
            <Row label="Share with a legal clinic" value={me.reviews.some((r) => r.clinicConsent) ? 'On' : <span className="text-db-muted">Off — you decide, and you can change it any time</span>}
              action={me.reviews[0] ? <Link href={`/case/${me.reviews[0].id}/next-steps`}>{me.reviews.some((r) => r.clinicConsent) ? 'Manage' : 'Turn on'}</Link> : undefined} />
            <Row label="Terms you agreed to" value={me.acks.length ? `Acknowledged ${me.acks.map((a) => day(a.ackAt, true)).reverse().join(' and ')} · version ${me.acks[0].version}` : <span className="text-db-muted">None yet</span>} action={<Link href="/disclosures">Read</Link>} />
          </div>
        </section>

        <section className="mt-8" data-testid="emails">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Emails we send</h2>
          <div className="mt-2 rounded-xl border border-db-line bg-db-surface p-4 text-[15px]">
            Receipts, when your review starts, when we need something from you, when your report is ready, and one question a week after. Nothing else — we don&rsquo;t send marketing.
          </div>
        </section>

        <section className="mt-8" data-testid="your-data">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Your data</h2>
          <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
            <Row label="Your court documents, as you sent them" value="Download everything you uploaded" action={<a href={`${API_URL}/me/export`} data-testid="export-link">Download</a>} />
            <Row label="We delete your documents and reports. Payment records are kept as the law requires." value={me.deletionRequest ? <span data-testid="deletion-pending">Deletion requested {day(me.deletionRequest.createdAt)} — we&rsquo;ll confirm by email.</span> : 'Delete my account'}
              action={!me.deletionRequest && (editing === 'delete' ? (
                <span className="flex gap-2"><button onClick={() => setEditing(null)} className="text-db-muted">Keep it</button><button data-testid="delete-confirm" disabled={busy} onClick={async () => { const d = await post('/me/delete-request', 'POST'); if (d) { setEditing(null); setNotice('Deletion requested. A person will confirm by email, usually within a day.'); await load() } }} style={{ color: 'var(--db-urgent)' }} className="font-semibold">Yes, request deletion</button></span>
              ) : <button data-testid="delete-request" onClick={() => setEditing('delete')} style={{ color: 'var(--db-urgent)' }}>Request</button>)} />
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between border-t border-db-line pt-4 text-[15px]">
          <Link href="/contact">Contact us</Link>
          <button onClick={() => void signOut({ callbackUrl: '/' })} className="text-db-muted" data-testid="sign-out">Sign out</button>
        </div>
      </main>
    </>
  )
}
