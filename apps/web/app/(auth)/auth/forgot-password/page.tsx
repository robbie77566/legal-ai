'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

/** Enumeration-safe by design: the confirmation reads the same either way. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [limited, setLimited] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setLimited(false)
    // Enumeration-safe: every outcome reads "check your email" EXCEPT the
    // rate limit — silently swallowing a 429 left people re-clicking for an
    // email that was never going to come (2026-09-02).
    const res = await apiFetch('/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)
    if (res?.status === 429) {
      setLimited(true)
      setBusy(false)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-xl font-semibold ">Check your email</h1>
        <p className="mt-3 text-sm text-db-muted">
          If an account exists for {email}, a reset link is on its way. It works for one hour.
        </p>
        <Link href="/auth/signin" className="mt-6 inline-block text-sm text-db-accent underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      {limited && (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--db-urgent)' }}>
          Too many reset requests in a row — please wait 15 minutes and try once more.
        </p>
      )}
      <form onSubmit={submit}>
      <h1 className="text-xl font-semibold ">Reset your password</h1>
      <p className="mt-2 text-sm text-db-muted">
        Enter your email and we&rsquo;ll send a reset link.
      </p>
      <label className="mt-5 block">
        <span className="text-sm font-semibold">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 focus:outline-none focus:ring-2 focus:ring-db-accent"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-db-accent px-4 py-3 font-semibold text-db-surface disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <Link href="/auth/signin" className="mt-4 block text-center text-sm text-db-muted underline">
        Back to sign in
      </Link>
    </form>
    </>
  )
}
