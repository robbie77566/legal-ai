'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { useContent } from '@/lib/i18n'
import { CHECK_OUTCOME_COPY } from '@/lib/content/check-outcomes'
import { LRIS_URL, NO_REFERRAL_FEE } from '@hg/case-lifecycle'
import NotASubstitute from '@/components/NotASubstitute'
import {
  nextQuestion,
  routeEligibility,
  questionNumber,
  questionCount,
  type EligibilityAnswers,
  type QuestionId,
  type EligibilityResult,
} from '@/lib/eligibility'

/**
 * S0 eligibility wizard (UI spec §5.2): one question per screen, full-width
 * tappable answer cards, "I'm not sure" always acceptable, outcomes are
 * distinct screens — never toasts, never dead ends. The routing lives in
 * lib/eligibility (unit-tested; counsel-gated); this file is presentation.
 */

const QUESTIONS: Record<
  QuestionId,
  { text: string; help?: string; options: { value: string; label: string }[] }
> = {
  jurisdiction: {
    text: 'Was the conviction in a Texas state court?',
    options: [
      { value: 'texas', label: 'Yes — a Texas state court' },
      { value: 'federal', label: 'No — a federal court' },
      { value: 'other_state', label: 'No — another state' },
    ],
  },
  offenseLevel: {
    text: 'Was it a felony or a misdemeanor?',
    help: 'A felony usually means prison (TDCJ) was possible. If unsure, the judgment paper says.',
    options: [
      { value: 'felony', label: 'Felony' },
      { value: 'misdemeanor', label: 'Misdemeanor' },
    ],
  },
  capital: {
    text: 'Is this a death-penalty case?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
    ],
  },
  custody: {
    text: 'Where are they in the sentence right now?',
    options: [
      { value: 'incarcerated', label: 'In prison (TDCJ or SAFP)' },
      { value: 'parole', label: 'Out on parole or mandatory supervision' },
      { value: 'probation', label: 'On probation (community supervision)' },
      { value: 'discharged', label: 'The sentence is fully finished' },
    ],
  },
  trialOrPlea: {
    text: 'Was there a trial, or a guilty plea?',
    options: [
      { value: 'trial', label: 'A trial — a jury or a judge decided' },
      { value: 'plea', label: 'A plea — they pleaded guilty or no contest' },
    ],
  },
  appeal: {
    text: 'What happened with the direct appeal?',
    help: 'The direct appeal is the automatic first challenge after a conviction.',
    options: [
      { value: 'decided', label: 'It was decided (denied or affirmed)' },
      { value: 'pending', label: 'It’s still being decided' },
      { value: 'none', label: 'There was no appeal' },
    ],
  },
  noAppealReason: {
    text: 'Why was there no appeal?',
    help: 'This matters more than most people know.',
    options: [
      { value: 'never_filed_requested', label: 'The lawyer never filed one, even though we wanted it' },
      { value: 'chose_not', label: 'They chose not to appeal' },
      { value: 'unsure', label: 'I’m not sure' },
    ],
  },
  priorWrit: {
    text: 'Has anyone ever filed a writ of habeas corpus on this conviction?',
    help: 'Sometimes one was filed from prison years ago — "I’m not sure" is a fine answer.',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
      { value: 'unsure', label: 'I’m not sure' },
    ],
  },
  newEvidence: {
    text: 'Is there evidence that was never presented — like a recantation, an alibi, or a new witness?',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' },
    ],
  },
}

/**
 * Outcome screens say product fit only (UPL review 2026-10-23, E6): what
 * this review is built for and what the record or the rule says — never
 * whether a filing would be dismissed, unavailable or winnable. The
 * sentences live in CHECK_OUTCOME_COPY, both languages.
 */
function OutcomeScreen({ result }: { result: EligibilityResult }) {
  const copy = useContent(CHECK_OUTCOME_COPY)
  const resources = (
    <ul className="mt-4 space-y-2 text-sm">
      <li>
        <a className="underline" href="https://www.tifa.org" rel="noopener noreferrer">
          {copy.resources.tifa}
        </a>
      </li>
      <li>
        <a className="underline" href={LRIS_URL} rel="noopener noreferrer" data-testid="lris-link">
          {copy.resources.lris}
        </a>{' '}
        <span className="text-db-muted">{NO_REFERRAL_FEE.en}</span>
      </li>
    </ul>
  )

  // UPL review 2026-10-23 (E6, rec 1): the statement sits at the top of
  // every outcome screen, before the outcome itself.
  return (
    <div data-testid="outcome">
      <NotASubstitute className="mb-4 text-db-muted" />
      {outcomeCard(result, resources)}
    </div>
  )
}

function outcomeCard(result: EligibilityResult, resources: React.ReactNode) {
  switch (result.outcome) {
    case 'capital':
      return (
        <div data-testid="outcome-capital" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">{copy.capital.title}</h2>
          <p className="mt-3">{copy.capital.body}</p>
          <p className="mt-3">{copy.capital.next}</p>
          {resources}
        </div>
      )
    case 'pending_appeal':
      return (
        <div data-testid="outcome-pending" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">{copy.pending.title}</h2>
          <p className="mt-3">{copy.pending.body}</p>
          <CheckBackLater />
        </div>
      )
    case 'misdemeanor':
    case 'discharged':
    case 'not_fit_other':
      return (
        <div data-testid="outcome-notfit" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">{copy.notFit.title}</h2>
          <p className="mt-3">
            {result.outcome === 'misdemeanor' ? copy.notFit.misdemeanor : result.outcome === 'discharged' ? copy.notFit.discharged : copy.notFit.other}{' '}
            {copy.notFit.resources}
          </p>
          {resources}
        </div>
      )
    default: {
      // fit_trial / fit_plea / prior_writ_warned
      return (
        <div data-testid="outcome-fit" className="rounded-xl border-2 border-db-accent bg-db-accent-soft p-6">
          <h2 className="font-db-serif text-2xl font-semibold">{copy.fit.title}</h2>
          {result.outcome === 'prior_writ_warned' && (
            <p className="mt-3 rounded-lg border border-db-review p-3 text-sm" style={{ color: 'var(--db-review)' }} data-testid="outcome-prior-writ">
              <strong>{copy.fit.priorWritLead}</strong> {copy.fit.priorWrit}
            </p>
          )}
          {result.outcome === 'fit_plea' && <p className="mt-3 text-sm text-db-muted">{copy.fit.plea}</p>}
          {result.appealRestorationEmphasis && <p className="mt-3 text-sm" data-testid="outcome-appeal-restoration">{copy.fit.appealRestoration}</p>}
          {result.newEvidenceFlag && <p className="mt-3 text-sm text-db-muted">{copy.fit.newEvidence}</p>}
          <p className="mt-4">{copy.fit.next}</p>
          <Link
            href="/buy"
            className="mt-5 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
          >
            {copy.fit.cta}
          </Link>
        </div>
      )
    }
  }
}

/** G-E1: the one not-fit outcome that becomes a fit later — leave an email, get one reminder. */
function CheckBackLater() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  if (state === 'done') {
    return <p className="mt-4 rounded-xl border border-db-line p-3 text-sm" data-testid="lead-done">Thank you — we&rsquo;ll check back in about 3 months, once. If the appeal is decided sooner, just take the check again.</p>
  }
  return (
    <form
      className="mt-4 rounded-xl border border-db-line p-3"
      data-testid="lead-form"
      onSubmit={(e) => {
        e.preventDefault(); setState('busy')
        void apiFetch('/eligibility/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, outcome: 'pending_appeal' }) })
          .then((r) => setState(r.ok ? 'done' : 'error')).catch(() => setState('error'))
      }}
    >
      <p className="text-sm font-semibold">Want us to check back?</p>
      <p className="mt-1 text-xs text-db-muted">Leave an email and we&rsquo;ll ask once, in about 3 months, whether the appeal has been decided. Nothing else, ever.</p>
      <div className="mt-2 flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" className="w-full rounded-lg border border-db-line bg-db-surface p-2 text-sm" />
        <button disabled={state === 'busy'} className="rounded-lg bg-db-accent px-4 text-sm font-semibold text-db-surface disabled:opacity-40">Remind me</button>
      </div>
      {state === 'error' && <p className="mt-2 text-xs" style={{ color: 'var(--db-urgent)' }}>That didn&rsquo;t save — please try again.</p>}
    </form>
  )
}

export default function EligibilityCheck() {
  // Resume banner labels: "a fit" / "not a fit" only (UPL review 2026-10-23, E6).
  const outcomeWords: Record<string, string> = useContent(CHECK_OUTCOME_COPY).words
  const [answers, setAnswers] = useState<EligibilityAnswers>({})
  const [history, setHistory] = useState<QuestionId[]>([])
  const [resume, setResume] = useState<{ answers: EligibilityAnswers; outcome: string } | null>(null)

  // G-E2: a finished check is resumable from the same browser (the token
  // lives 30 days server-side). Offered, never forced.
  useEffect(() => {
    let token: string | null = null
    try { token = window.localStorage.getItem('snl_draft_token') } catch { token = null }
    if (!token) return
    void apiFetch(`/eligibility/draft/${encodeURIComponent(token)}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.answers && d?.outcome) setResume({ answers: d.answers as EligibilityAnswers, outcome: d.outcome }) })
      .catch(() => {})
  }, [])

  const current = nextQuestion(answers)
  const result = routeEligibility(answers)

  const answer = (q: QuestionId, value: string) => {
    const next = { ...answers, [q]: value } as EligibilityAnswers
    setAnswers(next)
    setHistory([...history, q])
    const routed = routeEligibility(next)
    if (routed) {
      // Anonymous outcome logging + resumable draft (ENG-7); fire-and-forget —
      // the family's flow never blocks on it.
      void apiFetch('/eligibility/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: next, outcome: routed.outcome }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.token) {
            sessionStorage.setItem('snl_draft_token', d.token)
            try { window.localStorage.setItem('snl_draft_token', d.token) } catch { /* private mode */ }
          }
        })
        .catch(() => {})
    }
  }

  const back = () => {
    const prev = [...history]
    const last = prev.pop()
    if (!last) return
    const next = { ...answers }
    delete next[last]
    setAnswers(next)
    setHistory(prev)
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-db-serif font-bold text-db-accent">
          Snot Nose Legal
        </Link>
        {history.length > 0 && !result && (
          <button onClick={back} className="text-sm text-db-muted underline">
            Back
          </button>
        )}
      </nav>

      {resume && !result && history.length === 0 && (
        <div className="mb-6 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4 text-sm" data-testid="resume-check">
          <p className="font-semibold">You finished this check before.</p>
          <p className="mt-1">Your answers came out as <strong>{outcomeWords[resume.outcome] ?? resume.outcome}</strong>. Pick up where you left off, or start fresh.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setAnswers(resume.answers); try { sessionStorage.setItem('snl_draft_token', window.localStorage.getItem('snl_draft_token') ?? '') } catch { /* ignore */ } setResume(null) }} className="rounded-lg bg-db-accent px-4 py-2 font-semibold text-db-surface" data-testid="resume-yes">Pick up where I left off</button>
            <button onClick={() => { try { window.localStorage.removeItem('snl_draft_token') } catch { /* ignore */ } setResume(null) }} className="rounded-lg border border-db-line px-4 py-2" data-testid="resume-no">Start over</button>
          </div>
        </div>
      )}
      {result ? (
        <OutcomeScreen result={result} />
      ) : current ? (
        <div>
          <p className="text-sm text-db-muted">
            Question {questionNumber(answers, current)} of ~{questionCount(answers)}
          </p>
          <h1 className="mt-2 font-db-serif text-2xl font-semibold leading-snug">
            {QUESTIONS[current].text}
          </h1>
          {QUESTIONS[current].help && (
            <p className="mt-2 text-sm text-db-muted">{QUESTIONS[current].help}</p>
          )}
          <div role="radiogroup" aria-label={QUESTIONS[current].text} className="mt-6 space-y-3">
            {QUESTIONS[current].options.map((o) => (
              <button
                key={o.value}
                role="radio"
                aria-checked="false"
                onClick={() => answer(current, o.value)}
                className="block w-full rounded-xl border border-db-line bg-db-surface p-4 text-left hover:border-db-accent active:border-db-accent active:bg-db-accent-soft focus:outline-none focus:ring-2 focus:ring-db-accent"
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm text-db-muted">
            Not sure about something? Pick the closest answer — every path leads somewhere useful.
          </p>
        </div>
      ) : null}
    </main>
  )
}
