'use client'

/**
 * Sample report (snotnoselegal_site_design.md §3): fidelity to the REAL
 * report page — same card anatomy (signal/review tones, mono citation,
 * collapsible Part B) with fully fictional content. The banner leads:
 * nothing here is a real case.
 */
import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { SAMPLE_REPORT_CONTENT as S } from '../../../lib/content/sample-report'

function SampleCard({
  f,
  tone,
  partBLabel,
}: {
  f: { partA: string; cite: string; partB: string }
  tone: 'signal' | 'review'
  partBLabel: string
}) {
  return (
    <div
      className="rounded-xl border border-l-4 border-db-line bg-db-surface p-4"
      style={{ borderLeftColor: tone === 'signal' ? 'var(--db-signal)' : 'var(--db-review)' }}
    >
      <p>{f.partA}</p>
      <p className="mt-2 font-db-mono text-sm text-db-muted">{f.cite}</p>
      <details className="mt-2 text-sm text-db-muted">
        <summary className="cursor-pointer">{partBLabel}</summary>
        <p className="mt-1">{f.partB}</p>
      </details>
    </div>
  )
}

export default function SampleReport() {
  const t = useContent(S)
  const partBLabel = useContent({ en: 'For your lawyer (Part B)', es: 'Para su abogado (Parte B)' })
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />

      <p
        data-testid="sample-banner"
        className="mt-6 rounded-xl border-2 p-4 text-sm font-semibold"
        style={{ borderColor: 'var(--db-review)', color: 'var(--db-review)' }}
      >
        {t.banner}
      </p>

      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-db-muted">{t.intro}</p>

      <h2 className="mt-8 font-db-serif text-2xl font-semibold">{t.strongTitle}</h2>
      <p className="mt-1 text-sm text-db-muted">{t.strongIntro}</p>
      <div className="mt-4 space-y-3">
        {t.strong.map((f) => (
          <SampleCard key={f.cite} f={f} tone="signal" partBLabel={partBLabel} />
        ))}
      </div>

      <h2 className="mt-8 font-db-serif text-2xl font-semibold">{t.reviewTitle}</h2>
      <div className="mt-4 space-y-3">
        {t.review.map((f) => (
          <SampleCard key={f.cite} f={f} tone="review" partBLabel={partBLabel} />
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-xl font-semibold">{t.deadlineTitle}</h2>
        <p className="mt-2 text-sm text-db-muted">{t.deadlineBody}</p>
      </section>

      <section className="mt-4 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-xl font-semibold">{t.nothingTitle}</h2>
        <p className="mt-2 text-sm text-db-muted">{t.nothingBody}</p>
      </section>

      <div className="py-10 text-center">
        <p className="font-db-serif text-lg font-semibold">{t.ctaLead}</p>
        <Link
          href="/check"
          className="mt-4 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
