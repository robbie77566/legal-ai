'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { API_URL } from '../../../../../lib/api'
import CaseSummaryBlock, { type SummaryRow, type SummaryGap } from '../../../../../components/daybreak/CaseSummaryBlock'
import { getPaletteVariant } from '../../../../../lib/ab'
import FeedbackCard from '../../../../../components/FeedbackCard'
import { apiFetch } from '@/lib/api'
import { tpl, useContent } from '@/lib/i18n'
import { NEW_EVIDENCE_CONTENT } from '@/lib/content/new-evidence'
import { REPORT_DEADLINE_CONTENT } from '@/lib/content/report-deadlines'
import { issueWeight, WEIGHT_LEGEND, SURENESS_LEGEND, federalWindowEndDate, hasStructuredFields, preservedLabel, harmLabel, vehicleLabel, rankIssues, investigationChecklist, AI_GENERATED_LABEL, QUALITY_CHECKED, LRIS_URL, NO_REFERRAL_FEE } from '@hg/case-lifecycle'
import { ATTORNEY_PACKET_CONTENT } from '@/lib/content/attorney-packet'
import { useFlags } from '@/lib/flags'
import CaseNav from '../../../../../components/daybreak/CaseNav'
import NotASubstitute from '../../../../../components/NotASubstitute'

/**
 * S6 gated delivery (UI spec §5.7): the interstitial must be dismissed by
 * choice; findings render grouped Strong signals / Possible issues /
 * Nothing found — "nothing found" is NEUTRAL, never red; every section ends
 * with a next step; nothing here is legal advice and the page says so.
 */

interface ReportFinding {
  category: string
  severity: string
  confidence?: number
  partAText: string
  /** Absent while Part B is sealed (family_part_b off): the API omits the attorney fields. */
  partBText?: string
  citations: { volume: string | null; page: number | null; excerpt: string }[]
  preserved?: string
  harmStandard?: string
  vehicle?: string
  develop?: string
  dependsOn?: string[]
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
  notes?: string[]
}

interface ReportData {
  caseSummary?: SummaryRow[] | null
  summaryGap?: SummaryGap | null
  rerunPriceCents?: number
  bottomLine?: { tier: 'strong' | 'consult' | 'limited'; headline: string; body: string[] } | null
  versionNo?: number
  strongSignals: ReportFinding[]
  possibleIssues: ReportFinding[]
  subsequentWritMode: boolean
  renderedAt: string
  deadlinePosture?: DeadlinePosture | null
  /** FR-10 (K3): from the case facts — the family said there is evidence never presented; `note` is their words. */
  newEvidence?: { told: true; note?: string } | null
}

/** Tone colors follow the weight (PO, 2026-09-12): the most serious issue is
 *  red, not green — green read as "good news" next to a strong signal. */
const TONE_VAR = { urgent: 'var(--db-urgent)', review: 'var(--db-review)', muted: 'var(--db-none)' } as const

function FindingCard({ f, partB }: { f: ReportFinding; partB: boolean }) {
  const w = issueWeight(f.severity, f.confidence)
  return (
    <div
      className="rounded-xl border-l-4 border border-db-line bg-db-surface p-4"
      style={{ borderLeftColor: TONE_VAR[w.tone] }}
      data-testid="finding-card"
      data-tone={w.tone}
    >
      <p className="text-sm font-semibold" style={{ color: TONE_VAR[w.tone] }} data-testid="finding-weight">
        {w.line}
      </p>
      <p className="mt-1">{f.partAText}</p>
      {f.citations[0] && (
        <p className="mt-2 font-db-mono text-sm text-db-muted">
          {f.citations[0].volume ?? 'Record'}
          {f.citations[0].page ? `, p. ${f.citations[0].page}` : ''}: “{f.citations[0].excerpt}”
        </p>
      )}
      {/* UPL review 2026-10-23: counsel decision pending (question 3) — the
          Part B fold renders only while family_part_b is on; otherwise the
          attorney content is the sealed packet (ForYourLawyerCard). */}
      {partB ? (
        <details className="mt-2 text-sm text-db-muted">
          <summary className="cursor-pointer">For your lawyer (Part B)</summary>
          <p className="mt-1">{f.partBText}</p>
          {hasStructuredFields(f) && (
            <div className="mt-2 space-y-1 text-xs" data-testid="finding-counsel-fields">
              <p>{preservedLabel(f.preserved)} · {vehicleLabel(f.vehicle)} · {harmLabel(f.harmStandard)}</p>
              {f.develop && <p><span className="font-semibold">To develop:</span> {f.develop}</p>}
              {f.dependsOn && f.dependsOn.length > 0 && <p style={{ color: 'var(--db-review)' }}>Depends on records not provided: {f.dependsOn.join('; ')}</p>}
            </div>
          )}
        </details>
      ) : (
        f.dependsOn && f.dependsOn.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--db-review)' }} data-testid="finding-depends-on">Depends on records not provided: {f.dependsOn.join('; ')}</p>
        )
      )}
    </div>
  )
}

/**
 * UPL review 2026-10-23 (E2, recommendation 5): with Part B sealed, the one
 * card that replaces the Part B folds and the priority section — where the
 * attorney content is and the two ways it reaches the lawyer.
 */
function ForYourLawyerCard({ caseId, version }: { caseId: string; version: number | null }) {
  const copy = useContent(ATTORNEY_PACKET_CONTENT)
  return (
    <section className="mt-8 rounded-xl border-2 border-db-accent bg-db-surface p-5" data-testid="for-your-lawyer">
      <h2 className="font-db-serif text-xl font-semibold">{copy.title}</h2>
      <p className="mt-2">{copy.body}</p>
      <div className="mt-4 flex flex-col gap-3">
        <a
          href={`${API_URL}/cases/${caseId}/attorney-packet.pdf${version ? `?version=${version}` : ''}`}
          onClick={() => window.dispatchEvent(new Event('snl:attorney-packet-download'))}
          className="block rounded-xl bg-db-accent px-5 py-3 text-center font-semibold text-db-surface"
          data-testid="attorney-packet-download"
        >
          {copy.download}
        </a>
        <Link
          href={`/case/${caseId}/next-steps`}
          className="block rounded-xl border-2 border-db-accent px-5 py-3 text-center font-semibold text-db-accent"
          data-testid="attorney-packet-share"
        >
          {copy.share}
        </Link>
      </div>
      <p className="mt-3 text-sm text-db-muted">{copy.sealedNote}</p>
    </section>
  )
}

/**
 * FR-10 (K3, UI spec §5.7): the new-evidence flag as its own card — what the
 * family told us, in their words, never evaluated and never inferred.
 */
function NewEvidenceCard({ flag }: { flag: { told: true; note?: string } | null | undefined }) {
  const copy = useContent(NEW_EVIDENCE_CONTENT)
  if (!flag?.told) return null
  const note = flag.note?.trim()
  return (
    <section className="mt-8 rounded-xl border-l-4 border border-db-line bg-db-surface p-4" style={{ borderLeftColor: 'var(--db-review)' }} data-testid="new-evidence-card">
      <h2 className="font-db-serif text-xl font-semibold">{copy.title}</h2>
      <p className="mt-2">{copy.body}</p>
      <p className="mt-3 text-sm font-semibold text-db-muted">{copy.said}</p>
      <p className="mt-1" data-testid="new-evidence-note">{note ? <q>{note}</q> : copy.answeredYes}</p>
      <p className="mt-3 text-sm text-db-muted">{copy.next}</p>
    </section>
  )
}

/**
 * "Time limits" as description (UPL review 2026-10-23, E5): the verify
 * sentence first at body size, the dates given and what was counted from
 * them, the rule, and nothing else. No "CLOSED", no bold day count, no
 * urgency. Same copy as the PDF, in both languages.
 */
function DeadlineSection({ d }: { d: DeadlinePosture }) {
  const copy = useContent(REPORT_DEADLINE_CONTENT)
  const date = federalWindowEndDate({ expired: d.aedpa.expired, tollingNow: d.aedpa.tollingNow, estimatedExpiryDate: d.aedpa.estimatedExpiryDate, finalityDate: d.finalityDate, daysTolled: d.aedpa.daysTolled })
  const count = d.aedpa.expired
    ? date ? tpl(copy.ended, { date }) : copy.endedNoDate
    : d.aedpa.tollingNow
      ? copy.paused
      : date ? tpl(copy.open, { date }) : copy.openNoDate
  return (
    <section className="mt-6 rounded-xl border border-db-line p-4" data-testid="deadline-section">
      <h2 className="font-db-serif text-lg font-semibold">{tpl(copy.title, { asOf: d.asOf })}</h2>
      <p className="mt-2 text-sm" data-testid="deadline-verify">{copy.verify}</p>
      <p className="mt-2 text-sm" data-testid="deadline-count">{count}</p>
      <p className="mt-2 text-sm text-db-muted" data-testid="deadline-basis">
        {tpl(copy.basis, { finalityDate: d.finalityDate, finalityBasis: d.finalityBasis, daysElapsed: d.aedpa.daysElapsed })}
        {d.aedpa.daysTolled > 0 ? tpl(copy.basisTolled, { daysTolled: d.aedpa.daysTolled }) : ''} {copy.pauseRule}
      </p>
      {d.lachesUrgency && <p className="mt-2 text-sm text-db-muted" data-testid="deadline-laches">{copy.laches}</p>}
    </section>
  )
}

/** The two things a manual appellate review ends with — for the lawyer, not the family. */
function CounselSection({ findings }: { findings: ReportFinding[] }) {
  if (!findings.some(hasStructuredFields)) return null
  const ranked = rankIssues(findings)
  const checklist = investigationChecklist(findings)
  return (
    <section className="mt-8 rounded-xl border border-db-line bg-db-surface p-4 text-sm" data-testid="counsel-section">
      <details>
        <summary className="cursor-pointer font-semibold">For your lawyer: issues by priority and what to obtain</summary>
        <p className="mt-2 text-db-muted">Ordered by weight, then preservation, then the review standard. Preservation calls are this review&rsquo;s reading of the record and must be verified by your lawyer.</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5" data-testid="ranked-issues">
          {ranked.map((f, i) => (
            <li key={i}>
              <span className="font-semibold">{f.category.replace(/_/g, ' ')}</span>
              <span className="block text-xs text-db-muted">{preservedLabel(f.preserved)} · {vehicleLabel(f.vehicle)} · {harmLabel(f.harmStandard)}</span>
            </li>
          ))}
        </ol>
        {checklist.length > 0 && (
          <>
            <h3 className="mt-4 font-semibold">Investigation checklist</h3>
            <p className="text-xs text-db-muted">What would need to be obtained or done to prove or rule out the issues above. This is for the attorney; it is not a recommendation to file anything.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5" data-testid="investigation-checklist">
              {checklist.map((item, i) => <li key={i}>{item}</li>)}
            </ol>
          </>
        )}
      </details>
    </section>
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
  const ruleCopy = useContent(REPORT_DEADLINE_CONTENT)
  // UPL review 2026-10-23: counsel decision pending (question 3). The API is
  // the real gate (it omits the attorney fields while the flag is off); this
  // only chooses which card to draw. Dark until the flags load.
  const { flags } = useFlags()
  const partB = flags.family_part_b

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
      <NotASubstitute className="mt-3 text-db-muted" />
      <CaseSummaryBlock rows={data.caseSummary} gap={data.summaryGap} rerunPriceCents={data.rerunPriceCents} />
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
          {changes.notes && changes.notes.length > 0 && (
            <div className="mt-2" data-testid="what-changed-notes">
              <p className="text-sm font-semibold">What is different in this version</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{changes.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          {changes.added.length === 0 && changes.removed.length === 0 ? (
            <p className="mt-2 text-sm text-db-muted">{changes.notes && changes.notes.length > 0 ? 'What we found has not changed.' : 'The new documents did not change what we found.'} {changes.keptCount} finding{changes.keptCount === 1 ? '' : 's'} carried over.</p>
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
        <p className="mt-2" data-testid="in-short">{nothingFound ? ruleCopy.inShortNone : ruleCopy.inShortFound}</p>
      )}

      {data.subsequentWritMode && (
        <p className="mt-4 rounded-xl border border-db-line p-4 text-sm" data-testid="subsequent-writ-rule">
          {ruleCopy.subsequentWrit}
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

      {data.deadlinePosture && <DeadlineSection d={data.deadlinePosture} />}

      {data.strongSignals.length + data.possibleIssues.length > 0 && (
        <section className="mt-8 rounded-xl border border-db-line bg-db-surface p-4 text-sm" data-testid="weight-legend">
          <h2 className="font-semibold">How to read each issue</h2>
          <ul className="mt-2 space-y-1">
            {WEIGHT_LEGEND.map((l) => (
              <li key={l.tone}>
                <span className="font-semibold" style={{ color: TONE_VAR[l.tone] }}>{l.badge}:</span> {l.means}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-db-muted">{SURENESS_LEGEND}</p>
        </section>
      )}

      {data.strongSignals.length > 0 && (
        <section className="mt-8">
          <h2 className="font-db-serif text-xl font-semibold" style={{ color: 'var(--db-urgent)' }}>
            Strong signals
          </h2>
          <div className="mt-3 space-y-3">
            {data.strongSignals.map((f, i) => (
              <FindingCard key={i} f={f} partB={partB} />
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
              <FindingCard key={i} f={f} partB={partB} />
            ))}
          </div>
        </section>
      )}

      {partB ? (
        <CounselSection findings={[...data.strongSignals, ...data.possibleIssues]} />
      ) : (
        <ForYourLawyerCard caseId={caseId} version={version} />
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

      <NewEvidenceCard flag={data.newEvidence} />

      <section className="mt-8 rounded-xl border-2 border-db-accent bg-db-accent-soft p-5">
        <h2 className="font-db-serif text-xl font-semibold">What to do next</h2>
        <p className="mt-2">
          Take this report to an attorney licensed in Texas — that is always the next step. The{' '}
          <a href={LRIS_URL} rel="noopener noreferrer" className="underline" data-testid="lris-link">State Bar of Texas Lawyer Referral &amp; Information Service</a>{' '}
          can help you find one ({NO_REFERRAL_FEE.en}), and{' '}
          <a href="https://www.tifa.org" rel="noopener noreferrer" className="underline" data-testid="tifa-link">TIFA</a>{' '}
          offers family support along the way.
        </p>
        <p className="mt-3 text-sm text-db-muted" data-testid="first-writ-rule">{ruleCopy.firstWrit}</p>
      </section>

      <footer className="mt-8 border-t border-db-line pt-4 text-sm text-db-muted" data-testid="report-footer">
        <NotASubstitute className="text-sm" />
        <span className="mt-2 block">
          {AI_GENERATED_LABEL.en}. {QUALITY_CHECKED.en} Not a prediction of any outcome. Sharing this
          report does not by itself create an attorney-client relationship or privilege.
        </span>
        <span className="mt-2 block" data-testid="report-site">Snot Nose Legal · <a href="https://www.snotnoselegal.com" className="underline">snotnoselegal.com</a></span>
      </footer>
    </main>
  )
}
