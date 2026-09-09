'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'

function Confirm() {
  const params = useSearchParams()
  const [state, setState] = useState<'busy' | 'done' | 'error'>('busy')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const token = params.get('token'); const userId = params.get('id')
    if (!token || !userId) { setState('error'); setError('This link isn’t complete — use the full link from your email.'); return }
    void apiFetch('/me/email/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, userId }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) { setEmail(d.email); setState('done') } else { setError(d.error ?? 'This link is invalid or has expired.'); setState('error') } })
      .catch(() => { setError('Something went wrong — please try the link again.'); setState('error') })
  }, [params])
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <div className="rounded-xl border border-db-line bg-db-surface p-6">
        {state === 'busy' && <p className="text-db-muted">Confirming…</p>}
        {state === 'done' && (<><h1 className="font-db-serif text-2xl font-semibold">Your email is updated</h1><p className="mt-3">From now on, sign in with <span className="font-db-mono">{email}</span>. Everything we send goes there.</p><Link href="/account" className="mt-5 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface">Back to your account</Link></>)}
        {state === 'error' && (<><h1 className="font-db-serif text-2xl font-semibold">We couldn&rsquo;t confirm that</h1><p className="mt-3 text-db-muted">{error}</p><Link href="/account" className="mt-5 inline-block text-db-accent underline">Go to your account</Link></>)}
      </div>
    </main>
  )
}
export default function ConfirmEmail() { return <Suspense><Confirm /></Suspense> }
