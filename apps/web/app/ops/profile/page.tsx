'use client'

/**
 * Your profile (ops console, 2026-09-09): who you are signed in as — first,
 * last, phone, email, role — and your password. Reached from the header chip
 * on every ops page. Uses the same server actions as the legacy staff
 * account page so there is one write path.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { getProfile, updateProfile, changePassword, type Profile } from '@/app/dashboard/account/_actions'

const ROLE_WORDS: Record<string, string> = {
  ADMIN: 'Ops administrator — everything, including money and deletion',
  SUPPORT: 'Support — customer-facing surfaces; money and deletion need an admin',
  ATTORNEY: 'Attorney reviewer — the QA queue',
  INVESTIGATOR: 'Investigator', VIEWER: 'Viewer', CLIENT: 'Customer',
}
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const field = 'w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#D4AF37] focus:outline-none'

export default function ProfilePage() {
  const { update } = useSession()
  const [p, setP] = useState<Profile | null | undefined>(undefined)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  const load = async () => setP(await getProfile())
  useEffect(() => { void load() }, [])

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true); setNotice(null)
    try {
      const fd = new FormData(e.currentTarget)
      const r = await updateProfile(null, fd)
      if (r.success) {
        const name = [fd.get('firstName'), fd.get('lastName')].filter(Boolean).join(' ')
        await update({ name })
        setNotice({ tone: 'ok', text: 'Profile saved.' })
        await load()
      } else setNotice({ tone: 'bad', text: r.error ?? 'Could not save' })
    } finally { setSaving(false) }
  }

  const savePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPwError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    if (fd.get('newPassword') !== fd.get('confirmPassword')) { setPwError('The passwords don’t match'); return }
    const r = await changePassword(null, fd)
    if (r.success) {
      await update({ passwordChanged: true })
      setPwOpen(false); form.reset()
      setNotice({ tone: 'ok', text: 'Password changed. Other devices are signed out.' })
      await load()
    } else setPwError(r.error ?? 'Could not change the password')
  }

  if (p === undefined) return <p className="text-sm text-[#8B949E]">Loading your profile…</p>
  if (p === null) return <p className="text-sm text-[#F85149]">Not signed in.</p>

  return (
    <div className="max-w-2xl">
      <p className="text-xs text-[#8B949E]"><Link href="/ops" className="underline">Overview</Link> / Your profile</p>
      <h1 className="mt-1 font-serif text-xl font-bold text-[#D4AF37]" data-testid="profile-title">
        {p.name || p.email}
      </h1>
      <p className="mt-1 text-xs text-[#8B949E]" data-testid="profile-meta">
        <span className="font-mono">{p.email}</span> · {p.role} · member since {day(p.memberSince)}
      </p>
      {notice && (
        <p role="status" data-testid="profile-notice" className="mt-3 rounded border px-3 py-2 text-sm" style={{ borderColor: notice.tone === 'ok' ? '#3FB950' : '#F85149', color: notice.tone === 'ok' ? '#3FB950' : '#F85149' }}>
          {notice.text}
        </p>
      )}

      <section className="mt-6 rounded border border-[#30363D] bg-[#0D1117] p-4" data-testid="profile-form">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Profile</h2>
        <form onSubmit={(e) => void saveProfile(e)} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[#8B949E]">First name
              <input name="firstName" required maxLength={60} defaultValue={p.firstName ?? p.name?.split(' ')[0] ?? ''} className={`mt-1 ${field}`} />
            </label>
            <label className="text-xs text-[#8B949E]">Last name
              <input name="lastName" required maxLength={60} defaultValue={p.lastName ?? p.name?.split(' ').slice(1).join(' ') ?? ''} className={`mt-1 ${field}`} />
            </label>
          </div>
          <label className="block text-xs text-[#8B949E]">Phone
            <input name="phone" type="tel" maxLength={30} defaultValue={p.phone ?? ''} placeholder="+1 555 555 5555" className={`mt-1 ${field}`} />
          </label>
          <div className="grid gap-3 border-t border-[#21262D] pt-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-[#8B949E]">Email (sign-in)</p>
              <p className="font-mono text-sm" data-testid="profile-email">{p.email}</p>
              <p className="mt-1 text-[11px] text-[#8B949E]">Changing a staff email is done by an admin on the Team page.</p>
            </div>
            <div>
              <p className="text-xs text-[#8B949E]">Role</p>
              <p className="text-sm" data-testid="profile-role"><span className="font-mono">{p.role}</span> — {ROLE_WORDS[p.role] ?? p.role}</p>
            </div>
          </div>
          <button type="submit" disabled={saving} className="rounded bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0B0E14] disabled:opacity-50" data-testid="profile-save">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded border border-[#30363D] bg-[#0D1117] p-4" data-testid="password-section">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Password</h2>
          {!pwOpen && <button onClick={() => setPwOpen(true)} className="text-sm text-[#D4AF37]" data-testid="password-change">Change password</button>}
        </div>
        <p className="mt-1 text-xs text-[#8B949E]">
          {p.passwordChangedAt ? `Last changed ${day(p.passwordChangedAt)}.` : 'Never changed.'}{' '}
          Forgot it? <Link href="/auth/forgot-password" className="underline">Email me a reset link</Link>.
        </p>
        {pwOpen && (
          <form onSubmit={(e) => void savePassword(e)} className="mt-3 space-y-3">
            <PasswordInput id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" />
            <PasswordInput id="newPassword" name="newPassword" label="New password (12+ characters, an uppercase letter, a number or symbol)" autoComplete="new-password" />
            <PasswordInput id="confirmPassword" name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
            {pwError && <p role="alert" className="rounded border border-[#F85149] px-3 py-2 text-sm text-[#F85149]">{pwError}</p>}
            <div className="flex gap-3">
              <button type="submit" className="rounded bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0B0E14]" data-testid="password-save">Update password</button>
              <button type="button" onClick={() => { setPwOpen(false); setPwError(null) }} className="px-3 py-2 text-sm text-[#8B949E]">Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
