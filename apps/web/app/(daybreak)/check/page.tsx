'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
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

function OutcomeScreen({ result }: { result: EligibilityResult }) {
  const resources = (
    <ul className="mt-4 space-y-2 text-sm">
      <li>
        <a className="underline" href="https://www.tifa.org" rel="noopener noreferrer">
          TIFA — Texas Inmate Families Association (peer support)
        </a>
      </li>
      <li>
        <a className="underline" href="https://www.texasbar.com" rel="noopener noreferrer">
          State Bar of Texas Lawyer Referral &amp; Information Service
        </a>
      </li>
    </ul>
  )

  switch (result.outcome) {
    case 'capital':
      return (
        <div data-testid="outcome-capital" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">This service is not right for a death-penalty case.</h2>
          <p className="mt-3">
            Capital cases have a legal right to appointed post-conviction counsel and their own
            strict deadlines. Please don&rsquo;t pay anyone for a review like ours — use the counsel
            the law provides.
          </p>
          <p className="mt-3">
            Start with the Office of Capital and Forensic Writs and your appointed attorney.
          </p>
          {resources}
        </div>
      )
    case 'pending_appeal':
      return (
        <div data-testid="outcome-pending" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">The conviction isn&rsquo;t final yet.</h2>
          <p className="mt-3">
            While the direct appeal is still being decided, a writ filed now would be dismissed.
            The right moment is after the appeal is decided — come back then and we&rsquo;ll be
            ready.
          </p>
        </div>
      )
    case 'misdemeanor':
    case 'discharged':
    case 'not_fit_other':
      return (
        <div data-testid="outcome-notfit" className="rounded-xl border border-db-line bg-db-surface p-6">
          <h2 className="font-db-serif text-2xl font-semibold">This review isn&rsquo;t the right fit — here&rsquo;s what is.</h2>
          <p className="mt-3">
            {result.outcome === 'misdemeanor'
              ? 'Misdemeanor convictions follow a different path (Article 11.09) than the one this review covers.'
              : result.outcome === 'discharged'
                ? 'Once a sentence is fully finished, this kind of writ is generally unavailable — but expunction or record-sealing may be worth asking a lawyer about.'
                : 'This review covers Texas state convictions only.'}{' '}
            These groups can point you in the right direction:
          </p>
          {resources}
        </div>
      )
    default: {
      // fit_trial / fit_plea / prior_writ_warned
      return (
        <div data-testid="outcome-fit" className="rounded-xl border-2 border-db-accent bg-db-accent-soft p-6">
          <h2 className="font-db-serif text-2xl font-semibold">This looks like a fit.</h2>
          {result.outcome === 'prior_writ_warned' && (
            <p className="mt-3 rounded-lg border border-db-review p-3 text-sm" style={{ color: 'var(--db-review)' }}>
              <strong>Read this first:</strong> because a writ was already filed on this conviction,
              Texas law sets a severe bar for a second one. Our review will look specifically for
              the narrow exceptions — but you should know going in that the bar is high.
            </p>
          )}
          {result.outcome === 'fit_plea' && (
            <p className="mt-3 text-sm text-db-muted">
              A plea case has a thinner record than a trial, so the review focuses on the plea
              papers — we&rsquo;ll tell you honestly what a plea record can and cannot show.
            </p>
          )}
          {result.appealRestorationEmphasis && (
            <p className="mt-3 text-sm">
              You said the lawyer never filed the appeal you asked for — that can itself be one of
              the most winnable claims, and the review checks for it specifically.
            </p>
          )}
          {result.newEvidenceFlag && (
            <p className="mt-3 text-sm text-db-muted">
              The evidence you mentioned that was never presented will be flagged in your report
              for a lawyer — it&rsquo;s important, even though a record review can&rsquo;t evaluate it.
            </p>
          )}
          <p className="mt-4">Here&rsquo;s what happens next: review the details, create an account, and send the documents at your own pace.</p>
          <Link
            href="/buy"
            className="mt-5 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
          >
            Continue — $299, one price
          </Link>
        </div>
      )
    }
  }
}

export default function EligibilityCheck() {
  const [answers, setAnswers] = useState<EligibilityAnswers>({})
  const [history, setHistory] = useState<QuestionId[]>([])

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
          if (d?.token) sessionStorage.setItem('snl_draft_token', d.token)
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
                className="block w-full rounded-xl border border-db-line bg-db-surface p-4 text-left hover:border-db-accent focus:outline-none focus:ring-2 focus:ring-db-accent"
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
