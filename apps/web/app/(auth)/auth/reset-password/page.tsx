'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

function ResetForm() {
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
    const res = await apiFetch('/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, password }),
    }).catch(() => null)
    if (res?.ok) {
      router.push('/auth/signin?reset=1')
      return
    }
    const body = await res?.json().catch(() => ({}))
    setError(body?.error ?? 'This reset link is invalid or has expired — request a new one.')
    setBusy(false)
  }

  if (!token || !userId) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-white">This link isn&rsquo;t complete</h1>
        <p className="mt-3 text-sm text-gray-400">
          Use the full link from your email, or request a new one.
        </p>
        <Link href="/auth/forgot-password" className="mt-5 inline-block text-sm text-[#D4AF37] underline">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-semibold text-white">Choose a new password</h1>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <label className="mt-5 block">
        <span className="text-sm font-medium text-gray-400">New password</span>
        <input
          type="password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-[#0B0E14] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
        />
        <span className="mt-1 block text-xs text-gray-500">
          At least 12 characters, with an uppercase letter and a number or symbol.
        </span>
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-gray-400">Confirm password</span>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-[#0B0E14] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-[#D4AF37] px-4 py-2 font-semibold text-[#0B0E14] disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
