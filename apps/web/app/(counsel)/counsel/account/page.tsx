'use client'

/**
 * /counsel/account — name, email and password on the existing /me routes
 * (PATCH /me, POST /me/email, POST /me/password), plus the professional
 * profile from /counsel/me (bar number, verification, practice type) read
 * only. The family account page is family-specific (reviews, payments,
 * sharing), so only its row pattern and the PasswordField are reused.
 */
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { addCounselBarNumber, apiFetch } from '@/lib/api'
import PasswordField from '@/components/daybreak/PasswordField'
import { useCounsel } from '@/components/counsel/CounselContext'
import { BAR_STATUS_LABEL, LAWYER_GATE_COPY, PRACTICE_TYPES } from '@/lib/counsel'

interface Me { user: { name: string | null; email: string; pendingEmail: string | null; passwordChangedAt: string | null; memberSince: string } }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const input = 'w-full rounded-lg border border-db-line bg-db-surface p-2 text-[15px]'

function Row({ label, value, action, testid }: { label: string; value: React.ReactNode; action?: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-db-line px-4 py-3.5 first:border-t-0" data-testid={testid}>
      <div className="min-w-0"><div className="text-[13px] text-db-muted">{label}</div><div className="break-words">{value}</div></div>
      {action && <div className="shrink-0 text-[15px]">{action}</div>}
    </div>
  )
}

export default function CounselAccount() {
  const { update } = useSession()
  const { me: counsel, reload } = useCounsel()
  const [me, setMe] = useState<Me | null>(null)
  const [editing, setEditing] = useState<'name' | 'email' | 'password' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [bar, setBar] = useState('')

  const load = useCallback(async () => {
    const r = await apiFetch('/me')
    if (r.ok) setMe((await r.json()) as Me)
  }, [])
  useEffect(() => { void load() }, [load])

  const post = async (path: string, method: string, body?: unknown) => {
    setBusy(true)
    setNotice('')
    const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = (await r.json().catch(() => ({}))) as Record<string, string>
    setBusy(false)
    if (!r.ok) {
      setNotice(d.error ?? 'That did not save — please try again.')
      return null
    }
    return d
  }

  if (!me) return <p className="py-10 text-sm text-db-muted">Loading…</p>
  const u = me.user
  const practice = PRACTICE_TYPES.find(([v]) => v === counsel?.user.practiceType)?.[1] ?? counsel?.user.practiceType ?? '—'
  const barStatus = counsel?.user.barVerificationStatus ?? (counsel?.user.barVerified ? 'VERIFIED' : 'PENDING')
  // An invited attorney or owner has no bar number yet; adding one puts it in the staff queue (UPL review 2026-10-23, P1).
  const lawyerSeatRole = counsel?.membership.role === 'OWNER' || counsel?.membership.role === 'ATTORNEY'
  const needsBar = !!counsel && lawyerSeatRole && !counsel.user.barNumber
  const addBar = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice('')
    const r = await addCounselBarNumber(bar.trim())
    const d = (await r.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (!r.ok) return setNotice(d.error ?? 'That did not save — please try again.')
    setBar('')
    setNotice(LAWYER_GATE_COPY.BAR_PENDING)
    reload()
  }

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-db-serif text-3xl font-semibold">Account</h1>
      <p className="mt-1 text-[15px] text-db-muted">Signed in as <span className="font-db-mono">{u.email}</span></p>
      {notice && <p role="status" data-testid="notice" className="mt-3 rounded-xl border border-db-line bg-db-surface p-3 text-sm">{notice}</p>}

      <section className="mt-6" data-testid="profile">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Professional profile</h2>
        <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
          <Row
            label="Texas bar number"
            value={counsel?.user.barNumber ? <span className="font-db-mono">{counsel.user.barNumber}</span> : <span className="text-db-muted">Not given</span>}
            action={counsel?.user.barNumber ? <span className="text-sm text-db-muted" data-testid="bar-status">{BAR_STATUS_LABEL[barStatus]}</span> : undefined}
          />
          {counsel?.user.barNumber && barStatus !== 'VERIFIED' && (
            <p className="border-t border-db-line px-4 py-3 text-sm text-db-muted" data-testid="bar-status-note">{barStatus === 'REJECTED' ? LAWYER_GATE_COPY.BAR_REJECTED : LAWYER_GATE_COPY.BAR_PENDING}</p>
          )}
          {needsBar && (
            <form onSubmit={addBar} className="border-t border-db-line px-4 py-3" data-testid="bar-number-form">
              <p className="text-sm">Your seat opens matters, the clock and the packet once a person on our staff has verified your Texas bar number. Add it here.</p>
              <div className="mt-2 flex gap-2">
                <input aria-label="Texas bar number" required maxLength={32} inputMode="numeric" value={bar} onChange={(e) => setBar(e.target.value)} className={input} />
                <button disabled={busy || !bar.trim()} className="rounded-lg bg-db-accent px-3 font-semibold text-db-surface disabled:opacity-40" data-testid="bar-number-submit">Add</button>
              </div>
            </form>
          )}
          <Row label="Practice type" value={practice} />
          <Row label="Organisation" value={counsel ? `${counsel.organisation.name} · ${counsel.membership.role.charAt(0) + counsel.membership.role.slice(1).toLowerCase()}` : '—'} />
        </div>
      </section>

      <section className="mt-8" data-testid="account">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Sign-in details</h2>
        <div className="mt-2 rounded-xl border border-db-line bg-db-surface">
          <Row label="Name" value={editing === 'name' ? (
            <form className="mt-1 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const d = await post('/me', 'PATCH', { name: form.name }); if (d) { setEditing(null); await update({ name: d.name }); setNotice('Name updated.'); await load(); reload() } }}>
              <input aria-label="Name" value={form.name ?? u.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} required maxLength={100} />
              <button disabled={busy} className="rounded-lg bg-db-accent px-3 font-semibold text-db-surface">Save</button>
            </form>
          ) : (u.name || <span className="text-db-muted">Not set</span>)} action={editing === 'name' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({ name: u.name ?? '' }); setEditing('name') }} className="underline">Change</button>} />

          <Row label="Email" value={<>
            <span className="font-db-mono text-[15px]">{u.email}</span>
            {u.pendingEmail && <div className="mt-1 text-sm" data-testid="pending-email">Pending — check <span className="font-db-mono">{u.pendingEmail}</span> for a confirmation link. <button onClick={async () => { const d = await post('/me/email/pending', 'DELETE'); if (d) { setNotice('Change cancelled.'); await load() } }} className="underline">Cancel</button></div>}
            {editing === 'email' && (
              <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); const d = await post('/me/email', 'POST', { newEmail: form.newEmail, currentPassword: form.currentPassword }); if (d) { setEditing(null); setNotice(`We sent a confirmation link to ${d.pendingEmail}. Your email changes once you open it.`); await load() } }}>
                <input aria-label="New email" type="email" required placeholder="New email address" value={form.newEmail ?? ''} onChange={(e) => setForm({ ...form, newEmail: e.target.value })} className={input} />
                <input aria-label="Current password" type="password" required placeholder="Current password" value={form.currentPassword ?? ''} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={input} />
                <button disabled={busy} className="rounded-lg bg-db-accent px-3 py-2 font-semibold text-db-surface">Send confirmation</button>
              </form>
            )}
          </>} action={editing === 'email' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({}); setEditing('email') }} className="underline">Change</button>} />

          <Row label="Password" value={<>
            {u.passwordChangedAt ? `Last changed ${day(u.passwordChangedAt)}` : 'Set'}
            {editing === 'password' && (
              <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (form.newPassword !== form.confirm) { setNotice('The passwords do not match.'); return } const d = await post('/me/password', 'POST', { currentPassword: form.currentPassword, newPassword: form.newPassword }); if (d) { setEditing(null); await update({ passwordChanged: true }); setNotice('Password changed. Other devices were signed out.'); await load() } }}>
                <input aria-label="Current password" type="password" required placeholder="Current password" value={form.currentPassword ?? ''} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={input} />
                <PasswordField label="New password" value={form.newPassword ?? ''} onChange={(v) => setForm({ ...form, newPassword: v })} testId="new-password" />
                <PasswordField label="Confirm new password" value={form.confirm ?? ''} onChange={(v) => setForm({ ...form, confirm: v })} showRules={false} testId="confirm-password" />
                <button disabled={busy} className="rounded-lg bg-db-accent px-3 py-2 font-semibold text-db-surface">Change password</button>
              </form>
            )}
          </>} action={editing === 'password' ? <button onClick={() => setEditing(null)} className="text-db-muted">Cancel</button> : <button onClick={() => { setForm({}); setEditing('password') }} className="underline">Change</button>} />
        </div>
        <p className="mt-2 text-sm text-db-muted">Member since {day(u.memberSince)}.</p>
      </section>
    </section>
  )
}
