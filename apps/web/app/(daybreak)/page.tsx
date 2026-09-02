'use client'

/**
 * Brand home (snotnoselegal_site_design.md §3) — the calm front door for
 * the visitor who ISN'T ready to convert: due-diligence relatives, search
 * traffic, the skeptical. Same single CTA as everywhere; steadier voice.
 * The conversion landing lives at /review (ads point there).
 */
import Link from 'next/link'
import SiteNav from '../../components/site/SiteNav'
import { useContent } from '../../lib/i18n'
import { HOME_CONTENT as H } from '../../lib/content/home'

export default function BrandHome() {
  const t = useContent(H)
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />

      <header className="py-10">
        <h1 className="font-db-serif text-4xl font-bold leading-tight">{t.heroTitle}</h1>
        <p className="mt-5 text-db-muted">
          {t.heroBody}
          <strong className="text-db-ink">{t.heroPrice}</strong>
        </p>
        <Link
          href="/check"
          className="mt-7 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {t.cta}
        </Link>
        <p className="mt-3 text-sm text-db-muted">{t.ctaSub}</p>
      </header>

      <section className="py-6">
        <h2 className="font-db-serif text-2xl font-semibold">{t.stepsTitle}</h2>
        <ol className="mt-4 space-y-4">
          {t.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-db-mono text-db-accent">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-6">
        <h2 className="font-db-serif text-2xl font-semibold">{t.trustTitle}</h2>
        <ul className="mt-4 space-y-3">
          {t.trust.map((line) => (
            <li key={line} className="rounded-xl border border-db-line bg-db-surface p-4">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="py-6">
        <h2 className="font-db-serif text-2xl font-semibold">{t.learnTitle}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {t.learnCards.map(([title, blurb, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-db-line bg-db-surface p-4 hover:border-db-accent"
            >
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-db-muted">{blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-db-line bg-db-surface p-6">
        <h2 className="font-db-serif text-xl font-semibold">{t.honestTitle}</h2>
        <p className="mt-2 text-db-muted">{t.honestBody}</p>
      </section>

      <div className="py-10 text-center">
        <Link
          href="/check"
          className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {t.footerCta}
        </Link>
      </div>
    </main>
  )
}
