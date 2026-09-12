'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/**
 * Post-checkout landing: the case is created by the Stripe webhook, which can
 * lag by a few seconds (and reconciliation covers a lost webhook within the
 * hour) — poll briefly, honestly, and for THIS session's case (a family with
 * two reviews must never be sent into the other one).
 */
function Success() {
  const sessionId = useSearchParams().get('session_id')
  const [caseId, setCaseId] = useState<string | null>(null)
  const [interviewNeeded, setInterviewNeeded] = useState(true)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let tries = 0
    const poll = async () => {
      try {
        const res = await apiFetch(`/checkout/fulfillment?session_id=${encodeURIComponent(sessionId)}`)
        if (res.ok) {
          const d = await res.json()
          if (d?.caseId) {
            // Repeat buyer (2026-09-12): the details are on file and the
            // checklist is already built — straight to the documents.
            setInterviewNeeded(d.interviewNeeded !== false)
            setCaseId(d.caseId)
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
  }, [sessionId])

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <div className="rounded-xl border-2 border-db-accent bg-db-accent-soft p-6">
        <h1 className="font-db-serif text-2xl font-semibold">Payment received — thank you.</h1>
        {caseId ? (
          <>
            <p className="mt-3">
              {interviewNeeded
                ? 'Your case is set up. Next: confirm a few details about the case — most are already filled in from your free check — and we build your personal document checklist.'
                : 'Your case is set up, and we used the details already on file from your earlier review — nothing to answer again. Your document checklist is ready.'}
            </p>
            <Link
              href={`/case/${caseId}/${interviewNeeded ? 'interview' : 'documents'}`}
              data-testid="continue"
              className="mt-5 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
            >
              {interviewNeeded ? 'Continue to your case' : 'Continue to your documents'}
            </Link>
          </>
        ) : !sessionId ? (
          <p className="mt-3 text-db-muted">
            Your payment went through. <Link href="/cases" className="underline">Open your reviews</Link> to continue.
          </p>
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

export default function BuySuccess() {
  return (
    <Suspense>
      <Success />
    </Suspense>
  )
}
