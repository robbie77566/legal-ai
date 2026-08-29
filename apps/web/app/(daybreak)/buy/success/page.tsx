'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

/**
 * Post-checkout landing: the case is created by the Stripe webhook, which can
 * lag by a few seconds (and reconciliation covers a lost webhook within the
 * hour) — poll briefly, honestly.
 */
export default function BuySuccess() {
  const [caseId, setCaseId] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let tries = 0
    const poll = async () => {
      try {
        const res = await apiFetch('/cases')
        if (res.ok) {
          const cases = await res.json()
          if (Array.isArray(cases) && cases.length > 0) {
            setCaseId(cases[0].id)
            return
          }
        }
      } catch {
        /* keep polling */
      }
      tries += 1
      if (tries === 10) setSlow(true)
      if (tries < 60) setTimeout(poll, 2000)
    }
    void poll()
  }, [])

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <div className="rounded-xl border-2 border-db-accent bg-db-accent-soft p-6">
        <h1 className="font-db-serif text-2xl font-semibold">Payment received — thank you.</h1>
        {caseId ? (
          <>
            <p className="mt-3">
              Your case is set up. Next: a few short questions build your personal document
              checklist.
            </p>
            <Link
              href={`/case/${caseId}/interview`}
              className="mt-5 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
            >
              Start the case questions
            </Link>
          </>
        ) : (
          <p className="mt-3 text-db-muted" aria-live="polite">
            Setting up your case — this usually takes a few seconds…
            {slow && (
              <span className="mt-2 block">
                It&rsquo;s taking a little longer than usual. Your payment is safe; this page will
                update on its own, and we&rsquo;ll email you either way.
              </span>
            )}
          </p>
        )}
      </div>
    </main>
  )
}
