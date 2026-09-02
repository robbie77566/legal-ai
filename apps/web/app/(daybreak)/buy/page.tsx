'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import { apiFetch } from '@/lib/api'
import { useLang } from '@/lib/i18n'
import { DISCLOSURE_SET_VERSION } from '@hg/case-lifecycle/disclosures'

/**
 * S1 purchase flow (landing spec §3): [1] disclosure review (W-2 — a distinct
 * step, cards not fine print) → [2] account (the only self-registration
 * surface, CLIENT) → [3] Stripe Checkout. The recorded acknowledgment is
 * posted after sign-in so it carries identity; the API refuses checkout
 * without it (the enforceable invariant).
 */

const DISCLOSURES: [string, string][] = [
  [
    "What this is — and isn't",
    'This is a detailed review of court records — information to help you and a lawyer decide what to do next. It is not legal advice, and we are not a law firm. No attorney-client relationship is created. We never recommend filing anything on your own; a report is something to take to a lawyer.',
  ],
  [
    'No outcome promises',
    "We can't promise relief, release, or any court outcome. We promise a careful, cited review of what's in the record.",
  ],
  [
    'Price and scope',
    "$299 covers everything up to 5,000 pages. More pages: $49 per additional 2,500 — we'll ask first, never surprise you. Audio and video aren't included yet.",
  ],
  [
    'The clock',
    "Your review timeline starts when your documents are complete — we'll tell you the moment that happens.",
  ],
  [
    'Refunds',
    "If we can't read your records, we stop before analyzing and you choose: re-upload or refund.",
  ],
  [
    'Privacy and records',
    "Your records are encrypted, seen only by our review team, kept 12 months, and deleted sooner on request. You confirm you're entitled to possess the records you upload.",
  ],
  [
    'Deadline reality',
    'Legal deadlines can expire. Nothing on this page can tell you your deadline — the review estimates it, and a lawyer must confirm it.',
  ],
]

type Step = 'disclosures' | 'account' | 'paying'

export default function BuyPage() {
  const { data: session } = useSession()
  const [step, setStep] = useState<Step>('disclosures')
  const [acked, setAcked] = useState(false)
  const { lang } = useLang()
  // Promo (promo_codes.md §1): collapsed by default, validated server-side,
  // explicit applied state; $0 renders as Free and skips payment entirely.
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promoError, setPromoError] = useState('')
  const [promo, setPromo] = useState<{ code: string; amountOffCents: number; newTotalCents: number } | null>(null)

  const applyPromo = async () => {
    setPromoError('')
    const res = await apiFetch('/checkout/promo/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: promoInput }),
    })
    if (!res.ok) {
      setPromoError("That code isn't valid")
      return
    }
    setPromo(await res.json())
    setPromoOpen(false)
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const startCheckout = async () => {
    // Ack is recorded with identity, then the session opens Stripe Checkout.
    const ackRes = await apiFetch('/buy/disclosure-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disclosureSetVersion: DISCLOSURE_SET_VERSION }),
    })
    if (!ackRes.ok) {
      // The generic message sent a signed-in ADMIN down a dead end twice
      // (2026-09-01/02): staff accounts cannot buy, and the page should say so.
      if (ackRes.status === 403)
        throw new Error('This account can’t make purchases — staff accounts can’t buy. Sign out and use a customer account.')
      if (ackRes.status === 401) throw new Error('Your session expired — please sign in again.')
      throw new Error('Could not record your acknowledgment — please try again.')
    }

    const draftToken = sessionStorage.getItem('snl_draft_token') ?? undefined
    const res = await apiFetch('/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'review',
        ...(draftToken ? { draftToken } : {}),
        ...(promo ? { promoCode: promo.code } : {}),
      }),
    })
    if (res.status === 503) {
      throw new Error(
        'Payments are not switched on in this environment yet — nothing was charged.'
      )
    }
    if (!res.ok) throw new Error('Could not start checkout — please try again.')
    const { url } = await res.json()
    window.location.href = url
  }

  const continueFromDisclosures = () => {
    setError('')
    // Already signed in (returning family): skip account creation.
    setStep(session?.user ? 'paying' : 'account')
    if (session?.user) {
      setBusy(true)
      startCheckout().catch((e) => {
        setError(e.message)
        setBusy(false)
        setStep('disclosures')
      })
    }
  }

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await apiFetch('/buy/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
      })
      if (!res.ok) throw new Error('Could not create the account — check the password rules below.')

      const signed = await signIn('credentials', { email, password, redirect: false })
      if (signed?.error) {
        throw new Error(
          'An account with this email may already exist — try signing in with your usual password.'
        )
      }
      setStep('paying')
      await startCheckout()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <nav className="mb-8">
        <Link href="/" className="font-db-serif font-bold text-db-accent">
          Family Case Review
        </Link>
      </nav>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}

      {step === 'disclosures' && (
        <div>
          <h1 className="font-db-serif text-2xl font-semibold">
            Before you pay, please read these — they matter.
          </h1>
          {lang === 'es' && (
            <p className="mt-4 rounded-xl border border-db-line bg-db-surface p-3 text-sm text-db-muted">
              Estos términos se muestran en inglés porque la versión en inglés es la que rige
              legalmente. Si necesita ayuda para entenderlos en español, escríbanos a{' '}
              <a className="underline" href="mailto:admin@snotnoselegal.com">admin@snotnoselegal.com</a>{' '}
              antes de comprar.
            </p>
          )}
          <div className="mt-6 space-y-3">
            {DISCLOSURES.map(([title, body]) => (
              <div key={title} className="rounded-xl border border-db-line bg-db-surface p-4">
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-db-muted">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Family Case Review</span>
              <span className="font-db-serif text-lg font-bold">
                {promo ? (
                  promo.newTotalCents === 0 ? (
                    <span className="text-db-signal">Free</span>
                  ) : (
                    <>
                      <s className="mr-2 text-sm font-normal text-db-muted">$299</s>${(promo.newTotalCents / 100).toFixed(0)}
                    </>
                  )
                ) : (
                  '$299'
                )}
              </span>
            </div>
            {promo ? (
              <p className="mt-2 flex items-center gap-2 text-sm">
                <span className="rounded-full bg-db-accent-soft px-3 py-1 font-db-mono text-db-accent">
                  {promo.code} — ${(promo.amountOffCents / 100).toFixed(0)} off
                </span>
                <button
                  type="button"
                  onClick={() => { setPromo(null); setPromoInput('') }}
                  className="text-db-muted underline"
                >
                  remove
                </button>
              </p>
            ) : promoOpen ? (
              <div className="mt-3 flex gap-2">
                <input
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Enter code"
                  autoCapitalize="characters"
                  className="w-full rounded-lg border border-db-line bg-db-surface p-3 font-db-mono uppercase"
                />
                <button type="button" onClick={() => void applyPromo()} className="rounded-lg bg-db-accent px-4 font-semibold text-db-surface">
                  Apply
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setPromoOpen(true)} className="mt-2 text-sm text-db-muted underline">
                Have a promo code?
              </button>
            )}
            {promoError && (
              <p className="mt-2 text-sm" style={{ color: 'var(--db-urgent)' }}>{promoError}</p>
            )}
          </div>

          <label className="mt-6 flex items-start gap-3">
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>I understand what this review is and isn&rsquo;t.</span>
          </label>
          <button
            disabled={!acked || busy}
            onClick={continueFromDisclosures}
            className="mt-6 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            {promo && promo.newTotalCents === 0 ? 'Start your review — free with your code' : 'Continue'}
          </button>
        </div>
      )}

      {step === 'account' && (
        <form onSubmit={submitAccount}>
          <h1 className="font-db-serif text-2xl font-semibold">Create your account</h1>
          <p className="mt-2 text-sm text-db-muted">
            Just an email and password — you&rsquo;ll use them to send documents and read your
            report.
          </p>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Password</span>
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3"
              />
              <span className="mt-1 block text-sm text-db-muted">
                At least 12 characters, with an uppercase letter and a number or symbol.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Your name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            {busy ? 'Setting things up…' : 'Continue to payment'}
          </button>
        </form>
      )}

      {step === 'paying' && (
        <p className="rounded-xl border border-db-line bg-db-surface p-6">
          Taking you to secure payment…
        </p>
      )}
    </main>
  )
}
