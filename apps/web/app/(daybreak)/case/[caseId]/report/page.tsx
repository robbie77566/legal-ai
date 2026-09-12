'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { API_URL } from '../../../../../lib/api'
import CaseSummaryBlock, { type SummaryRow } from '../../../../../components/daybreak/CaseSummaryBlock'
import { getPaletteVariant } from '../../../../../lib/ab'
import FeedbackCard from '../../../../../components/FeedbackCard'
import { apiFetch } from '@/lib/api'
import CaseNav from '../../../../../components/daybreak/CaseNav'

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
interface Version { versionNo: number; renderedAt: string }
interface Changes {
  fromVersion: number | null
  toVersion: number | null
  added: Array<{ category: string; severity: string; partAText: string }>
  removed: Array<{ category: string; severity: string; partAText: string }>
  keptCount: number | null
}

interface ReportData {
  caseSummary?: SummaryRow[] | null
  bottomLine?: { tier: 'strong' | 'consult' | 'limited'; headline: string; body: string[] } | null
  versionNo?: number
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
  const params = useSearchParams()
  const variant = (params.get('survey') === 'share' ? 'share' : 'report') as 'report' | 'share'
  const requestedVersion = params.get('version')
  // The interstitial is remembered per case (UI spec §5.7): once a family
  // has chosen to read, later visits show a one-line reminder instead.
  const rememberKey = `snl:report-opened:${caseId}`
  const [opened, setOpenedState] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(rememberKey) === '1' } catch { return false }
  })
  const setOpened = (v: boolean) => {
    setOpenedState(v)
    try { if (v) window.localStorage.setItem(rememberKey, '1') } catch { /* private mode etc. */ }
  }
  const [remembered] = useState(opened)
  const [data, setData] = useState<ReportData | null>(null)
  const [notReady, setNotReady] = useState(false)
  const [versions, setVersions] = useState<Version[]>([])
  const [changes, setChanges] = useState<Changes | null>(null)
  const [version, setVersion] = useState<number | null>(requestedVersion ? Number(requestedVersion) : null)

  useEffect(() => {
    if (!opened) return
    const q = version ? `?version=${version}` : ''
    void apiFetch(`/cases/${caseId}/report${q}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setNotReady(true)))
      .catch(() => setNotReady(true))
    void apiFetch(`/cases/${caseId}/report/versions`).then(async (r) => r.ok && setVersions(await r.json())).catch(() => {})
    void apiFetch(`/cases/${caseId}/report/changes`).then(async (r) => r.ok && setChanges(await r.json())).catch(() => {})
  }, [opened, caseId, version])

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
          Your report isn&rsquo;t ready yet — <Link href={`/case/${caseId}/status`} className="underline">the tracker has the latest</Link>, and we&rsquo;ll email you
          the moment it is.
        </p>
      </main>
    )
  }

  if (!data) return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">Loading…</main>

  const nothingFound = data.strongSignals.length === 0 && data.possibleIssues.length === 0

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <CaseNav caseId={caseId} current="report" />
      <h1 className="font-db-serif text-3xl font-semibold">Your case review</h1>
      <CaseSummaryBlock rows={data.caseSummary} />
      {remembered && (
        <p className="mt-2 text-sm text-db-muted" data-testid="gentle-reminder">
          Whatever this says, there is a next step — and you don&rsquo;t have to read it alone.
        </p>
      )}
      {versions.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="version-switcher">
          <span className="text-db-muted">Version:</span>
          {versions.map((v, i) => {
            const active = (version ?? versions[0].versionNo) === v.versionNo
            return (
              <button key={v.versionNo} onClick={() => setVersion(v.versionNo)} aria-pressed={active}
                className={`rounded-full px-3 py-1 ${active ? 'bg-db-accent text-db-surface' : 'border border-db-line text-db-muted'}`}>
                v{v.versionNo}{i === 0 ? ' (current)' : ''} · {new Date(v.renderedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
            )
          })}
        </div>
      )}
      {changes && changes.fromVersion != null && (version == null || version === changes.toVersion) && (
        <section className="mt-4 rounded-xl border border-db-line bg-db-surface p-4" data-testid="what-changed">
          <h2 className="font-db-serif text-lg font-semibold">New since your last report (v{changes.fromVersion} → v{changes.toVersion})</h2>
          {changes.added.length === 0 && changes.removed.length === 0 ? (
            <p className="mt-2 text-sm text-db-muted">The new documents did not change what we found. {changes.keptCount} finding{changes.keptCount === 1 ? '' : 's'} carried over.</p>
          ) : (
            <>
              {changes.added.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--db-signal)' }}>Newly found ({changes.added.length})</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">{changes.added.map((f, i) => <li key={i}>{f.partAText}</li>)}</ul>
                </div>
              )}
              {changes.removed.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-db-muted">No longer found ({changes.removed.length})</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-db-muted">{changes.removed.map((f, i) => <li key={i}>{f.partAText}</li>)}</ul>
                  <p className="mt-1 text-xs text-db-muted">A finding can drop out when a new document answers the question it raised, or when its quote no longer matched the record.</p>
                </div>
              )}
              {changes.keptCount != null && <p className="mt-2 text-xs text-db-muted">{changes.keptCount} finding{changes.keptCount === 1 ? '' : 's'} carried over unchanged.</p>}
            </>
          )}
        </section>
      )}
      {data.bottomLine ? (
        <section className="mt-4 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4" data-testid="bottom-line" data-tier={data.bottomLine.tier}>
          <h2 className="font-db-serif text-lg font-semibold">The bottom line</h2>
          <p className="mt-1 font-semibold">{data.bottomLine.headline}</p>
          {data.bottomLine.body.map((p, i) => (
            <p key={i} className={`mt-2 text-sm ${i === data.bottomLine!.body.length - 1 ? 'text-db-muted' : ''}`}>{p}</p>
          ))}
        </section>
      ) : (
        <p className="mt-2">
          {nothingFound
            ? 'In short: we did not find issues in this record that we can point a lawyer to — and we tell you what that does and doesn’t mean below.'
            : 'In short: we found things in this record a lawyer should look at.'}
        </p>
      )}

      {data.subsequentWritMode && (
        <p className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--db-review)', color: 'var(--db-review)' }}>
          Because a writ was already filed on this conviction, Texas law sets a severe bar for
          another one. Show this report to a lawyer — the findings below are marked for the narrow
          exceptions the law allows.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
        <h2 className="font-db-serif text-lg font-semibold">Everything for your lawyer</h2>
        <div className="mt-3 space-y-3">
          <a
            href={`${API_URL}/cases/${caseId}/report/pdf?palette=${getPaletteVariant()}${version ? `&version=${version}` : ''}`}
            onClick={() => window.dispatchEvent(new Event('snl:pdf-download'))}
            className="block rounded-xl bg-db-accent px-5 py-3 text-center font-semibold text-db-surface"
          >
            Download this report as a PDF
          </a>
          <Link
            href={`/case/${caseId}/documents`}
            className="block rounded-xl border-2 border-db-accent px-5 py-3 text-center font-semibold text-db-accent"
          >
            Download the court documents you uploaded
          </Link>
          <Link
            href={`/case/${caseId}/next-steps`}
            data-testid="next-steps-link"
            className="block rounded-xl border-2 border-db-accent px-5 py-3 text-center font-semibold text-db-accent"
          >
            Send your lawyer a secure link
          </Link>
          <button
            onClick={() => {
              void apiFetch('/checkout/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'rerun', caseId }),
              }).then(async (r) => {
                if (r.ok) window.location.href = (await r.json()).url
              })
            }}
            className="block w-full rounded-xl border border-db-line px-5 py-3 text-center text-sm text-db-muted"
          >
            Got new documents since this report? Add them &amp; re-run — $99
          </button>
        </div>
      </section>

      <FeedbackCard caseId={caseId} variant={variant} />

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
          Take this report to a licensed Texas attorney — that is always the next step. The{' '}
          <a href="https://www.texasbar.com" rel="noopener noreferrer" className="underline" data-testid="lris-link">State Bar of Texas Lawyer Referral &amp; Information Service</a>{' '}
          can help you find one, and{' '}
          <a href="https://www.tifa.org" rel="noopener noreferrer" className="underline" data-testid="tifa-link">TIFA</a>{' '}
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
        <span className="mt-2 block" data-testid="report-site">Family Case Review · <a href="https://www.snotnoselegal.com" className="underline">snotnoselegal.com</a></span>
      </footer>
    </main>
  )
}
