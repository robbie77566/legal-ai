'use client'

/**
 * /for-counsel/signup — the professional self-registration surface
 * (persona_rollout_plan.md §3 "sign-up with a Texas bar number", §5 A/F).
 * Email, password (the api's rules, mirrored live by PasswordField), name,
 * Texas bar number, practice type, organisation name and kind. Posts
 * counselSignup, signs in with the NextAuth credentials provider the way
 * /buy does after /buy/account, and lands on /counsel. A duplicate email
 * gets the same neutral answer the family flow gives. When the GLOBAL
 * counsel_surfaces flag is off the form is replaced by "Sign-ups open
 * January 2027".
 *
 * UPL review 2026-10-23 (P1): the account is created PENDING. After the
 * sign-in the page says so — "your bar number is being checked by our
 * staff; matters open once it is verified" — and then lands on /counsel,
 * where the same banner shows until a person verifies the number.
 */
import { useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { counselSignup, type CounselSignupBody } from '@/lib/api'
import PasswordField, { PASSWORD_RULES } from '@/components/daybreak/PasswordField'
import { SIGNUPS_CLOSED, useSignupOpen } from '@/components/professional/SignupStatus'
import { LAWYER_GATE_COPY, PRACTICE_TYPES, organisationKindFor } from '@/lib/counsel'

/** Practice types the staff queue never verifies as a lawyer; the invite flow is their path. */
const NON_LAWYER_PRACTICE = new Set<CounselSignupBody['practiceType']>(['investigator', 'other'])
/** How long the confirmation stays before the page moves on to /counsel. */
const CONTINUE_AFTER_MS = 2500

const field = 'mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-[15px]'

export default function CounselSignup() {
  const { open, loaded } = useSignupOpen()
  const [form, setForm] = useState({ email: '', password: '', name: '', barNumber: '', practiceType: 'writ' as CounselSignupBody['practiceType'], organisationName: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!PASSWORD_RULES.every((rule) => rule(form.password))) {
      setError('The password needs at least 12 characters, an uppercase letter and a number or symbol.')
      return
    }
    setBusy(true)
    setPhase('Creating your account…')
    try {
      const res = await counselSignup({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        barNumber: form.barNumber.trim(),
        barState: 'TX',
        practiceType: form.practiceType,
        organisationName: form.organisationName.trim() || undefined,
        organisationKind: organisationKindFor(form.practiceType),
      })
      if (res.status === 429) throw new Error('Too many attempts from this connection — wait a minute and try again.')
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Could not create the account — check the fields and try again.')
      }
      setPhase('Signing you in…')
      const signed = await signIn('credentials', { email: form.email.trim(), password: form.password, redirect: false })
      if (signed?.error) {
        const lock = /^RateLimit(?::(\d+))?$/.exec(signed.error)
        if (lock) {
          const m = Number(lock[1] ?? 15)
          throw new Error(`Too many sign-in attempts — wait ${m} minute${m === 1 ? '' : 's'} and try again, or use “Forgot password”.`)
        }
        if (signed.error === 'ServiceUnavailable') throw new Error('The service is temporarily unavailable — please try again shortly.')
        // The same neutral line the family flow uses: a duplicate address is never confirmed.
        throw new Error('An account with this email may already exist — try signing in with your usual password.')
      }
      // The account exists and the session is set: say what happens next, then move on.
      setDone(true)
      setBusy(false)
      setPhase('')
      window.setTimeout(() => { window.location.href = '/counsel' }, CONTINUE_AFTER_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setBusy(false)
      setPhase('')
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 pb-12 pt-4">
      <h1 className="font-db-serif text-3xl font-bold">Open a counsel account</h1>
      <p className="mt-2 text-db-muted">
        For attorneys, public defender offices and clinics. Investigators and viewers join an organisation by invitation from its owner.
      </p>

      {done ? (
        <div data-testid="signup-pending" role="status" className="mt-6 rounded-xl border border-db-line bg-db-surface p-5">
          <p className="text-lg font-semibold">Your account is created.</p>
          <p className="mt-2 text-[15px]">{LAWYER_GATE_COPY.BAR_PENDING}</p>
          <p className="mt-2 text-sm text-db-muted">We email you when it is; the first review is free once it is verified.</p>
          <Link href="/counsel" className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface" data-testid="signup-continue">Go to your account</Link>
        </div>
      ) : !loaded ? (
        <p className="mt-6 text-sm text-db-muted" aria-live="polite">Checking whether sign-ups are open…</p>
      ) : !open ? (
        <div data-testid="signups-closed" className="mt-6 rounded-xl border border-db-line bg-db-surface p-5">
          <p className="text-lg font-semibold">{SIGNUPS_CLOSED}</p>
          <p className="mt-2 text-[15px] text-db-muted">
            A public defender office can ask about the free pilot now from <Link href="/for-offices" className="underline">the office page</Link>; the founder answers in person.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} data-testid="counsel-signup-form" className="mt-6 space-y-4">
          {error && (
            <p role="alert" data-testid="signup-error" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
              {error}
            </p>
          )}
          <label className="block">
            <span className="text-sm font-semibold">Email</span>
            <input id="signup-email" type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={set('email')} className={field} />
          </label>
          <PasswordField label="Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <label className="block">
            <span className="text-sm font-semibold">Your name</span>
            <input id="signup-name" required maxLength={100} autoComplete="name" value={form.name} onChange={set('name')} className={field} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Texas bar number</span>
            <input id="signup-bar" required maxLength={32} inputMode="numeric" value={form.barNumber} onChange={set('barNumber')} className={field} />
            <span className="mt-1 block text-xs text-db-muted">Stored unverified; a person on our staff checks it against the State Bar roll. Matters, quotes and the counsel packet open once it is verified, and the first review is then free.</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Practice type</span>
            <select id="signup-practice" value={form.practiceType} onChange={set('practiceType')} className={field}>
              {PRACTICE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {NON_LAWYER_PRACTICE.has(form.practiceType) && (
              <span className="mt-1 block text-xs text-db-muted" data-testid="practice-hint">
                An account with this practice type is not verified as a lawyer and cannot open matters. Investigators and viewers take a free seat by invitation from an organisation owner.
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Organisation name (optional)</span>
            <input id="signup-org" maxLength={120} autoComplete="organization" value={form.organisationName} onChange={set('organisationName')} className={field} />
            <span className="mt-1 block text-xs text-db-muted">The firm, office or clinic. Left blank, your name stands in for it.</span>
          </label>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40" data-testid="signup-submit">
            {busy ? phase || 'Setting things up…' : 'Create the account'}
          </button>
          <p className="text-xs text-db-muted">
            By continuing you confirm you are a licensed professional acting in that capacity. We are not a law firm; the packet is prepared at your direction for your use.
          </p>
        </form>
      )}
      <p className="mt-6 text-sm text-db-muted">
        Already have an account? <Link href="/auth/signin?callbackUrl=/go" className="underline">Sign in</Link>.
      </p>
    </main>
  )
}
