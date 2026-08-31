'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { API_URL } from '../../../../../lib/api'
import { getPaletteVariant } from '../../../../../lib/ab'
import { apiFetch } from '@/lib/api'

/**
 * S6 gated delivery (UI spec §5.7): the interstitial must be dismissed by
 * choice; findings render grouped Strong signals / Possible issues /
 * Nothing found — "nothing found" is NEUTRAL, never red; every section ends
 * with a next step; nothing here is legal advice and the page says so.
 */

interface ReportFinding {
  category: string
  severity: string
  partAText: string
  partBText: string
  citations: { volume: string | null; page: number | null; excerpt: string }[]
}
interface DeadlinePosture {
  finalityDate: string
  finalityBasis: string
  aedpa: {
    daysElapsed: number
    daysTolled: number
    daysRemaining: number
    expired: boolean
    estimatedExpiryDate: string | null
    tollingNow: boolean
  }
  lachesUrgency: boolean
  asOf: string
}
interface ReportData {
  strongSignals: ReportFinding[]
  possibleIssues: ReportFinding[]
  subsequentWritMode: boolean
  renderedAt: string
  deadlinePosture?: DeadlinePosture | null
}

function FindingCard({ f, tone }: { f: ReportFinding; tone: 'signal' | 'review' }) {
  return (
    <div
      className="rounded-xl border-l-4 border border-db-line bg-db-surface p-4"
      style={{ borderLeftColor: tone === 'signal' ? 'var(--db-signal)' : 'var(--db-review)' }}
    >
      <p>{f.partAText}</p>
      {f.citations[0] && (
        <p className="mt-2 font-db-mono text-sm text-db-muted">
          {f.citations[0].volume ?? 'Record'}
          {f.citations[0].page ? `, p. ${f.citations[0].page}` : ''}: “{f.citations[0].excerpt}”
        </p>
      )}
      <details className="mt-2 text-sm text-db-muted">
        <summary className="cursor-pointer">For your lawyer (Part B)</summary>
        <p className="mt-1">{f.partBText}</p>
      </details>
    </div>
  )
}

export default function CaseReport() {
  const { caseId } = useParams<{ caseId: string }>()
  const [opened, setOpened] = useState(false)
  const [data, setData] = useState<ReportData | null>(null)
  const [notReady, setNotReady] = useState(false)

  useEffect(() => {
    if (!opened) return
    void apiFetch(`/cases/${caseId}/report`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setNotReady(true)))
      .catch(() => setNotReady(true))
  }, [opened, caseId])

  if (!opened) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <div className="rounded-xl border border-db-line bg-db-surface p-6">
          <h1 className="font-db-serif text-2xl font-semibold">Before you open your report</h1>
          <p className="mt-3">
            This report says what we found in the court record — and what we didn&rsquo;t. It may
            not contain the news you hoped for. Whatever it says, there is a next step, and you
            don&rsquo;t have to read it alone — some families read it together.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => setOpened(true)}
              className="rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
            >
              Read it now
            </button>
            <span className="text-center text-sm text-db-muted">
              Or come back later — it will be right here.
            </span>
          </div>
        </div>
      </main>
    )
  }

  if (notReady) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <p className="rounded-xl border border-db-line bg-db-surface p-6">
          Your report isn&rsquo;t ready yet — the tracker has the latest, and we&rsquo;ll email you
          the moment it is.
        </p>
      </main>
    )
  }

  if (!data) return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">Loading…</main>

  const nothingFound = data.strongSignals.length === 0 && data.possibleIssues.length === 0

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-3xl font-semibold">Your case review</h1>
      <p className="mt-2">
        {nothingFound
          ? 'In short: we did not find issues in this record that we can point a lawyer to — and we tell you what that does and doesn’t mean below.'
          : 'In short: we found things in this record a lawyer should look at.'}
      </p>

      {data.subsequentWritMode && (
        <p className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--db-review)', color: 'var(--db-review)' }}>
          Because a writ was already filed on this conviction, Texas law sets a severe bar for
          another one. Show this report to a lawyer — the findings below are marked for the narrow
          exceptions the law allows.
        </p>
      )}

      <a
        href={`${API_URL}/cases/${caseId}/report/pdf?palette=${getPaletteVariant()}`}
        className="mt-5 inline-block rounded-xl border-2 border-db-accent px-5 py-3 font-semibold text-db-accent"
      >
        Download the PDF — easy to text or email to a lawyer
      </a>

      {data.deadlinePosture && (
        <section
          className="mt-6 rounded-xl border p-4"
          style={{ borderColor: data.deadlinePosture.aedpa.expired ? 'var(--db-review)' : 'var(--db-line)' }}
        >
          <h2 className="font-db-serif text-lg font-semibold">Time limits (as of {data.deadlinePosture.asOf})</h2>
          {data.deadlinePosture.aedpa.expired ? (
            <p className="mt-2 text-sm">
              Based on the dates you provided, the one-year federal habeas window appears to have
              closed. An attorney should verify — exceptions exist, and state filings remain possible.
            </p>
          ) : data.deadlinePosture.aedpa.tollingNow ? (
            <p className="mt-2 text-sm">
              The one-year federal clock is currently paused while a state application is pending.
              About {data.deadlinePosture.aedpa.daysRemaining} days will remain when the state court
              rules. A state filing pauses this clock only while it is pending — it does not restart it.
            </p>
          ) : (
            <p className="mt-2 text-sm">
              About <strong>{data.deadlinePosture.aedpa.daysRemaining} days</strong> appear to remain in
              the one-year federal habeas window (estimated end:{' '}
              {data.deadlinePosture.aedpa.estimatedExpiryDate ?? 'n/a'}). A properly filed state
              application pauses this clock while it is pending — but only while it is pending.
            </p>
          )}
          {data.deadlinePosture.lachesUrgency && (
            <p className="mt-2 text-sm text-db-muted">
              This conviction is old. Texas state habeas has no fixed deadline, but courts can refuse
              applications that waited too long — acting promptly matters.
            </p>
          )}
          <p className="mt-2 text-xs text-db-muted">
            Estimates from the dates your family provided; an attorney must verify every date before
            relying on them.
          </p>
        </section>
      )}

      {data.strongSignals.length > 0 && (
        <section className="mt-8">
          <h2 className="font-db-serif text-xl font-semibold" style={{ color: 'var(--db-signal)' }}>
            Strong signals
          </h2>
          <div className="mt-3 space-y-3">
            {data.strongSignals.map((f, i) => (
              <FindingCard key={i} f={f} tone="signal" />
            ))}
          </div>
        </section>
      )}

      {data.possibleIssues.length > 0 && (
        <section className="mt-8">
          <h2 className="font-db-serif text-xl font-semibold" style={{ color: 'var(--db-review)' }}>
            Possible issues
          </h2>
          <div className="mt-3 space-y-3">
            {data.possibleIssues.map((f, i) => (
              <FindingCard key={i} f={f} tone="review" />
            ))}
          </div>
        </section>
      )}

      {nothingFound && (
        <section className="mt-8 rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold text-db-muted">Nothing found</h2>
          <p className="mt-2">
            A clean screen is not a verdict on innocence or on every possible claim — it means the
            specific problems we check for didn&rsquo;t show in this record. A lawyer can look at
            things outside the record that we cannot.
          </p>
        </section>
      )}

      <section className="mt-8 rounded-xl border-2 border-db-accent bg-db-accent-soft p-5">
        <h2 className="font-db-serif text-xl font-semibold">What to do next</h2>
        <p className="mt-2">
          Take this report to a licensed Texas attorney — that is always the next step. The State
          Bar of Texas Lawyer Referral &amp; Information Service can help you find one, and TIFA
          offers family support along the way.
        </p>
        <p className="mt-3 text-sm text-db-muted">
          A first writ must raise every claim it can — claims left out are ordinarily lost. This
          report is an inventory for a lawyer to complete, not the whole universe of what&rsquo;s
          possible.
        </p>
      </section>

      <footer className="mt-8 border-t border-db-line pt-4 text-sm text-db-muted">
        Information about court records — not legal advice, and not a prediction of any outcome.
        Prepared with AI assistance and approved by a trained legal reviewer. Sharing this report
        does not by itself create an attorney-client relationship or privilege.
      </footer>
    </main>
  )
}
