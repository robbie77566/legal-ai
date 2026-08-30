'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

/** Enumeration-safe by design: the confirmation reads the same either way. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await apiFetch('/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {})
    setSent(true)
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-white">Check your email</h1>
        <p className="mt-3 text-sm text-gray-400">
          If an account exists for {email}, a reset link is on its way. It works for one hour.
        </p>
        <Link href="/auth/signin" className="mt-6 inline-block text-sm text-[#D4AF37] underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-semibold text-white">Reset your password</h1>
      <p className="mt-2 text-sm text-gray-400">
        Enter your email and we&rsquo;ll send a reset link.
      </p>
      <label className="mt-5 block">
        <span className="text-sm font-medium text-gray-400">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-[#0B0E14] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-[#D4AF37] px-4 py-2 font-semibold text-[#0B0E14] disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <Link href="/auth/signin" className="mt-4 block text-center text-sm text-gray-500 underline">
        Back to sign in
      </Link>
    </form>
  )
}
