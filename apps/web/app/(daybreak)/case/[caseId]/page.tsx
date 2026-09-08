'use client'

/**
 * Case home (customer_journey_ux_review G-C1): where a family lands for one
 * review. What we know about the case, where it is, and the one thing to do
 * next — with every other page one click away.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { trackerModel, formatCivilDate } from '@/lib/tracker'
import CaseNav from '../../../../components/daybreak/CaseNav'
import type { CustomerView } from '@hg/case-lifecycle'

interface Checklist {
  status: string
  customer: CustomerView
  expectedReadyAt: string | null
  slaStartedAt: string | null
  items: Array<{ id: string; state: string }>
  documents: Array<{ id: string; quarantined: boolean }>
  facts?: Record<string, unknown>
  factLines?: Array<{ key: string; label: string; value: string | null; derived?: boolean; shapesReview?: boolean }>
  rerun?: { reportCount: number; lastReportAt: string | null } | null
}
interface Version { versionNo: number; renderedAt: string }

function primaryAction(status: string, caseId: string, hasReport: boolean): { href: string; label: string; why: string } {
  if (status === 'AWAITING_DOCS') return { href: `/case/${caseId}/documents`, label: 'Add documents', why: 'Your review starts when you tell us your records are complete.' }
  if (hasReport || status === 'READY' || status === 'DELIVERED') return { href: `/case/${caseId}/report`, label: 'Open your report', why: 'Your report is ready to read and to take to a lawyer.' }
  if (status === 'REFUNDED') return { href: `/case/${caseId}/report`, label: 'Open your report', why: 'This review was refunded. Anything you already received stays available.' }
  return { href: `/case/${caseId}/status`, label: 'See progress', why: 'Your review is running. You don’t need to stay on this page.' }
}

export default function CaseHome() {
  const { caseId } = useParams<{ caseId: string }>()
  const [data, setData] = useState<Checklist | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    void (async () => {
      const [c, v] = await Promise.all([apiFetch(`/cases/${caseId}/checklist`), apiFetch(`/cases/${caseId}/report/versions`)])
      if (c.ok) setData(await c.json()); else setMissing(true)
      if (v.ok) setVersions(await v.json())
    })()
  }, [caseId])

  if (missing) return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">We couldn&rsquo;t open that review. <Link href="/cases" className="underline">Back to your reviews</Link>.</main>
  if (!data) return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">Loading…</main>

  const lines = (data.factLines ?? []).filter((l) => l.value)
  const conviction = lines.find((l) => l.key === 'conviction')?.value
  const model = trackerModel(data.customer)
  const action = primaryAction(data.status, caseId, versions.length > 0)
  const editable = data.status === 'AWAITING_DOCS'
  const needsJudgmentDate = !lines.some((l) => l.key === 'judgmentDate')
  const found = data.items.filter((i) => i.state !== 'NEEDED').length

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <CaseNav caseId={caseId} current="overview" />
      <p className="text-xs text-db-muted"><Link href="/cases" className="underline">Your reviews</Link></p>
      <h1 className="mt-1 font-db-serif text-2xl font-semibold" data-testid="case-home-title">{conviction ? `Review · ${conviction.split(' · ').slice(0, 2).join(' · ')}` : 'Your review'}</h1>

      <section data-testid="stage" className="mt-4 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4">
        <p className="text-sm text-db-muted">
          {model.activeIndex === -1
            ? `Waiting on your documents · ${found} of ${data.items.length} found`
            : model.delivered
              ? 'Your report is ready'
              : `${model.stages[model.activeIndex]?.label ?? 'In progress'}${data.expectedReadyAt ? ` · expect your report by ${formatCivilDate(data.expectedReadyAt)}` : ''}`}
        </p>
        {data.rerun && <p className="mt-1 text-sm">This is a re-run — your earlier report still stands.</p>}
        {model.overlayCopy && <p className="mt-2 text-sm" style={{ color: 'var(--db-review)' }}>{model.overlayCopy}</p>}
        <p className="mt-2 text-sm">{action.why}</p>
        <Link href={action.href} data-testid="primary-action" className="mt-3 inline-block rounded-xl bg-db-accent px-6 py-3 font-semibold text-db-surface">{action.label}</Link>
      </section>

      <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-db-muted" aria-label="Stages">
        {model.stages.map((s, i) => (
          <li key={s.id} className={i < model.activeIndex || model.delivered ? 'text-db-ink line-through decoration-db-line' : i === model.activeIndex ? 'font-semibold text-db-accent' : ''}>{s.label}</li>
        ))}
      </ol>

      <section data-testid="about-case" className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-db-serif text-lg font-semibold">About this case</h2>
          <Link href={`/case/${caseId}/interview`} className="text-sm text-db-accent underline">{editable ? 'Change' : 'Correct county, year, or dates'}</Link>
        </div>
        <p className="mt-1 text-xs text-db-muted">What you told us. Your checklist and review are built from these answers — you won&rsquo;t be asked them again.{!editable && ' How it was decided, the appeal, and any prior writ are locked now — a re-run is where they can change.'}</p>
        {lines.length ? (
          <dl className="mt-3 grid grid-cols-[minmax(0,40%)_1fr] gap-x-4 gap-y-1.5 text-sm">
            {lines.map((l) => (
              <div key={l.key} className="contents">
                <dt className="text-db-muted">{l.label}</dt>
                <dd>{l.value}{l.derived && <span className="ml-1 text-xs text-db-muted">(chosen from your answers)</span>}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-3 text-sm text-db-muted">Nothing recorded yet.</p>}
        {needsJudgmentDate && (
          <p className="mt-3 rounded-lg border border-db-line p-3 text-sm" data-testid="unlock-deadlines">
            <strong>Add the judgment date</strong> to unlock the time-limits section of your report. It&rsquo;s on the judgment paper.{' '}
            <Link href={`/case/${caseId}/interview`} className="text-db-accent underline">Add it</Link>
          </p>
        )}
      </section>

      {versions.length > 0 && (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4" data-testid="reports">
          <h2 className="font-db-serif text-lg font-semibold">Your reports</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {versions.map((v, i) => (
              <li key={v.versionNo} className="flex items-center justify-between gap-3">
                <span>Report v{v.versionNo}{i === 0 ? ' — current' : ''} · {new Date(v.renderedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                <Link href={`/case/${caseId}/report?version=${v.versionNo}`} className="text-db-accent underline">Open</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
