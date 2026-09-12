'use client'

/** Invite acceptance (auth design §4.6): the first password for an account an Admin created. */
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import PasswordField from '../../../../components/daybreak/PasswordField'

function SetupForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const userId = params.get('id') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('The passwords don’t match.')
      return
    }
    setBusy(true)
    const res = await apiFetch('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, password }),
    }).catch(() => null)
    if (res?.ok) {
      const body = await res.json().catch(() => ({}))
      router.push(`/auth/signin?welcome=1${body?.email ? `&email=${encodeURIComponent(body.email)}` : ''}`)
      return
    }
    const body = await res?.json().catch(() => ({}))
    setError(body?.error ?? 'This invite link is invalid or has expired — ask the person who added you to resend it.')
    setBusy(false)
  }

  if (!token || !userId) {
    return (
      <div>
        <h1 className="text-xl font-semibold">This link isn&rsquo;t complete</h1>
        <p className="mt-3 text-sm text-db-muted">Use the full link from your invite email, or ask the person who added you to resend it.</p>
        <Link href="/auth/signin" className="mt-5 inline-block text-sm text-db-accent underline">Go to sign in</Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} data-testid="setup-form">
      <h1 className="text-xl font-semibold">Welcome — set your password</h1>
      <p className="mt-2 text-sm text-db-muted">You&rsquo;ll sign in with your email address and this password from now on.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5">
        <PasswordField label="Password" value={password} onChange={setPassword} testId="new-password" />
      </div>
      <div className="mt-4">
        <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} showRules={false} testId="confirm-password" />
      </div>
      <button type="submit" disabled={busy} className="mt-5 w-full rounded-xl bg-db-accent px-4 py-3 font-semibold text-db-surface disabled:opacity-40">
        {busy ? 'Saving…' : 'Set password and continue'}
      </button>
    </form>
  )
}

export default function SetupPassword() {
  return (
    <Suspense>
      <SetupForm />
    </Suspense>
  )
}
