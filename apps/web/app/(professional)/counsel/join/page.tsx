'use client'

/**
 * /counsel/join?token= — accepting an organisation invitation (workstream I;
 * POST /counsel/org/invitations/:token/accept). Public on purpose: the link
 * arrives by email to someone who may have no account yet, so this page
 * lives in the public (professional) group and the middleware leaves it
 * alone. A new colleague gives a name and password; an existing
 * professional of the same organisation just takes the seat. Then sign-in.
 */
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { acceptInvitation } from '@/lib/api'
import PasswordField, { PASSWORD_RULES } from '@/components/daybreak/PasswordField'

function JoinForm() {
  const token = useSearchParams().get('token') ?? ''
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ organisationName: string; role: string; email: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!existing && !PASSWORD_RULES.every((rule) => rule(password))) {
      setError('The password needs at least 12 characters, an uppercase letter and a number or symbol.')
      return
    }
    setBusy(true)
    try {
      const res = await acceptInvitation(token, existing ? {} : { name: name.trim(), password })
      const body = (await res.json().catch(() => ({}))) as { error?: string; organisationName?: string; role?: string; email?: string }
      if (!res.ok) throw new Error(body.error ?? 'The invitation could not be accepted.')
      setDone({ organisationName: body.organisationName ?? 'the organisation', role: (body.role ?? '').toLowerCase(), email: body.email ?? '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invitation could not be accepted.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return <p className="mt-6 text-db-muted">This page needs the link from the invitation email.</p>
  }
  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-db-line bg-db-surface p-5" data-testid="join-done">
        <p className="text-lg font-semibold">You have {done.role ? `an ${done.role}` : 'a'} seat at {done.organisationName}.</p>
        <Link href={`/auth/signin?callbackUrl=/counsel${done.email ? `&email=${encodeURIComponent(done.email)}` : ''}`} className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface" data-testid="join-signin">
          Sign in
        </Link>
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4" data-testid="join-form">
      {error && <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>{error}</p>}
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} className="mt-1 h-5 w-5" />
        <span className="text-[15px]">I already have an account with this email address</span>
      </label>
      {!existing && (
        <>
          <label className="block">
            <span className="text-sm font-semibold">Your name</span>
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-[15px]" autoComplete="name" />
          </label>
          <PasswordField label="Choose a password" value={password} onChange={setPassword} />
        </>
      )}
      <button type="submit" disabled={busy} className="rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40" data-testid="join-submit">
        {busy ? 'Taking your seat…' : 'Take the seat'}
      </button>
    </form>
  )
}

export default function JoinPage() {
  return (
    <main className="mx-auto max-w-xl px-5 pb-12 pt-4">
      <h1 className="font-db-serif text-3xl font-bold">Take your seat</h1>
      <p className="mt-2 text-db-muted">A colleague invited you to their organisation. The link works for 7 days and once.</p>
      <Suspense fallback={<p className="mt-6 text-sm text-db-muted">Loading…</p>}>
        <JoinForm />
      </Suspense>
    </main>
  )
}
