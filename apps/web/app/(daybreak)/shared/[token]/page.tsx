'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/**
 * The attorney's view of a shared packet (ENG-8): token-gated, plain.
 *
 * UPL review 2026-10-23 (E2): the page renders the `sections` the API
 * builds with `attorneyPacketSections` — the same JSON the sealed attorney
 * packet PDF (`GET /cases/:id/attorney-packet.pdf`) prints — so what the
 * lawyer reads here and what the family hands over on paper never drift.
 * The page knows the section ids and nothing else about the content.
 */

interface SummaryRow { label: string; value: string | null; source: 'record' | 'family' | null; where: string | null }
interface PacketFinding {
  id: string
  category: string
  severity: string
  severityLabel: string
  confidence?: number
  partBText: string
  labels: string | null
  develop: string | null
  dependsOn: string[]
  citations: { volume: string | null; page: number | null; line?: number | null; excerpt: string; where: string }[]
}
type Section =
  | { id: 'cover'; title: string; coverLine: { en: string; es: string }; statement: string; notice: string; caseTitle: string; reportId: string; versionNo: number; templateVersion: string; reportTemplateVersion: string; renderedAt: string; subsequentWritMode: boolean }
  | { id: 'case_summary'; rows: SummaryRow[] }
  | { id: 'posture'; line: string }
  | { id: 'time_computation'; asOf: string; lines: { label: string; value: string }[]; note: string }
  | { id: 'part_b'; findings: PacketFinding[]; droppedByReverification: number }
  | { id: 'priority'; intro: string; items: { id: string; category: string; severityLabel: string; labels: string }[]; unknownPreservation: number }
  | { id: 'checklist'; intro: string; items: string[] }

interface SharedPacket { notice: string; sections: Section[] }

const TONE_VAR: Record<string, string> = { dispositive: 'var(--db-urgent)', supportive: 'var(--db-review)', background: 'var(--db-none)' }

function SectionView({ s }: { s: Section }) {
  switch (s.id) {
    case 'cover':
      return (
        <header data-testid="packet-cover">
          <h1 className="font-db-serif text-2xl font-semibold">{s.title}</h1>
          <p className="mt-1 text-lg">{s.caseTitle}</p>
          <p className="mt-3 font-semibold" data-testid="packet-cover-line">{s.coverLine.en}</p>
          <p className="mt-1 text-sm text-db-muted" lang="es">{s.coverLine.es}</p>
          <p className="mt-3 text-sm" data-testid="packet-statement">{s.statement}</p>
          <p className="mt-2 text-sm text-db-muted">{s.notice}</p>
          <p className="mt-2 font-db-mono text-xs text-db-muted">
            Report {s.reportId} · version {s.versionNo} · rendered {s.renderedAt} · packet template {s.templateVersion} · report template {s.reportTemplateVersion}
          </p>
          {s.subsequentWritMode && (
            <p className="mt-2 text-sm" style={{ color: 'var(--db-review)' }}>
              The case facts record a prior application on this conviction; the findings are marked for the subsequent-application analysis.
            </p>
          )}
        </header>
      )
    case 'case_summary':
      return (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4" data-testid="packet-summary">
          <h2 className="font-semibold">About this case</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {s.rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="font-semibold">{r.label}</dt>
                <dd className={r.value ? '' : 'text-db-muted'}>
                  {r.value ?? 'not stated in the record'}
                  {r.value && r.where ? <span className="text-db-muted"> ({r.where})</span> : r.value && r.source === 'family' ? <span className="text-db-muted"> — as the family stated</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )
    case 'posture':
      return <p className="mt-4 rounded-lg border border-db-line bg-db-surface px-3 py-2 font-db-mono text-xs" data-testid="packet-posture">{s.line}</p>
    case 'time_computation':
      return (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4 text-sm" data-testid="packet-time">
          <h2 className="font-semibold">Time computation (as of {s.asOf})</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {s.lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="font-semibold">{l.label}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-db-muted">{s.note}</p>
        </section>
      )
    case 'part_b':
      return (
        <section className="mt-6" data-testid="packet-part-b">
          <h2 className="font-db-serif text-xl font-semibold">Part B — findings on the record</h2>
          <p className="mt-1 text-sm text-db-muted">
            {s.findings.length} finding{s.findings.length === 1 ? '' : 's'} verified against the record at render
            {s.droppedByReverification > 0 ? `; ${s.droppedByReverification} failed re-verification and are not shown` : ''}. Record citations and doctrine categories only.
          </p>
          <ol className="mt-4 space-y-4">
            {s.findings.map((f, i) => (
              <li key={f.id} className="rounded-xl border border-l-4 border-db-line bg-db-surface p-4" style={{ borderLeftColor: TONE_VAR[f.severity] ?? 'var(--db-line)' }} data-testid="packet-finding">
                <p className="font-db-mono text-xs uppercase text-db-muted">
                  {i + 1}. {f.severityLabel} · {f.category.replace(/_/g, ' ')}
                  {typeof f.confidence === 'number' ? ` · confidence ${Math.round(f.confidence * 100)}%` : ''}
                </p>
                <p className="mt-2">{f.partBText}</p>
                {(f.labels || f.develop || f.dependsOn.length > 0) && (
                  <div className="mt-2 space-y-1 text-xs text-db-muted" data-testid="packet-counsel-fields">
                    {f.labels && <p>{f.labels}</p>}
                    {f.develop && <p><span className="font-semibold">To develop:</span> {f.develop}</p>}
                    {f.dependsOn.length > 0 && <p>Depends on records not provided: {f.dependsOn.join('; ')}</p>}
                  </div>
                )}
                {f.citations.map((c, j) => (
                  <p key={j} className="mt-2 border-l-2 border-db-accent pl-3 font-db-mono text-sm text-db-muted">
                    Record ({c.where}) — “{c.excerpt}”
                  </p>
                ))}
              </li>
            ))}
            {s.findings.length === 0 && (
              <li className="rounded-xl border border-db-line bg-db-surface p-4 text-db-muted">
                The review recorded no finding that met the reporting threshold and verified at render. A clean screen is not a verdict on every possible claim.
              </li>
            )}
          </ol>
        </section>
      )
    case 'priority':
      return (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4 text-sm" data-testid="packet-priority">
          <h2 className="font-semibold">For counsel — issues by priority</h2>
          <p className="mt-1 text-xs text-db-muted">{s.intro}</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {s.items.map((it) => (
              <li key={it.id}>
                <span className="font-semibold">{it.category.replace(/_/g, ' ')}</span> — {it.severityLabel}
                <span className="block text-xs text-db-muted">{it.labels}</span>
              </li>
            ))}
          </ol>
          {s.unknownPreservation > 0 && (
            <p className="mt-2 text-xs text-db-muted">{s.unknownPreservation} issue(s) carry no preservation call — the record excerpt did not show an objection and ruling.</p>
          )}
        </section>
      )
    case 'checklist':
      return (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4" data-testid="packet-checklist">
          <h2 className="font-semibold">Investigation checklist</h2>
          <p className="mt-1 text-xs text-db-muted">{s.intro}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{s.items.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )
  }
}

export default function SharedReport() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<SharedPacket | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    void apiFetch(`/shared/${token}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setGone(true)))
      .catch(() => setGone(true))
  }, [token])

  if (gone) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <p className="rounded-xl border border-db-line bg-db-surface p-6">
          This link is no longer available — it may have expired or been turned off by the family.
        </p>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-2xl px-5 py-12 text-db-muted">Loading…</main>

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {(data.sections ?? []).map((s) => <SectionView key={s.id} s={s} />)}
      <footer className="mt-8 border-t border-db-line pt-4 text-sm text-db-muted" data-testid="packet-site">
        Snot Nose Legal · <a href="https://www.snotnoselegal.com" className="underline">snotnoselegal.com</a> · {data.notice}
      </footer>
    </main>
  )
}
