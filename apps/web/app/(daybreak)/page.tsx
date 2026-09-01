'use client'

import Link from 'next/link'
import CtaLink from '../../components/ab/CtaLink'
import PaletteExperiment from '../../components/ab/PaletteExperiment'
import { useContent, LangSwitch } from '../../lib/i18n'
import { LANDING_CONTENT as L } from '../../lib/content/landing'

/**
 * Daybreak landing (landing_page_spec.md §2). The conversion event is the
 * FREE eligibility check, not the sale — one CTA, repeated. Copy below is
 * the §2 canon: changes require R-5 tone review, and EVERY string change
 * updates both languages (i18n_localization.md R7).
 */


export default function DaybreakLanding() {
  const t = useContent(L)
  return (
    <main className="mx-auto max-w-2xl px-5 pb-28 sm:pb-16">
      <PaletteExperiment pingView />
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-db-line bg-db-surface p-3 sm:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <CtaLink
          href="/check"
          position="sticky"
          className="block w-full rounded-xl bg-db-accent px-6 py-4 text-center text-lg font-semibold text-db-surface"
        >
          {t.ctaSticky}
        </CtaLink>
      </div>

      <nav className="flex items-center justify-between gap-2 py-5">
        <span className="font-db-serif text-lg font-bold text-db-accent">Family Case Review</span>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <CtaLink
            href="/check"
            position="nav"
            className="inline-flex min-h-11 items-center rounded-full bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
          >
            {t.ctaNav}
          </CtaLink>
        </div>
      </nav>

      <header className="py-10">
        <h1 className="font-db-serif text-4xl font-bold leading-tight">{t.heroTitle}</h1>
        <p className="mt-5 text-db-muted">
          {t.heroBody}
          <strong className="text-db-ink">{t.heroPrice}</strong>
        </p>
        <CtaLink
          href="/check"
          position="hero"
          className="mt-7 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {t.cta}
        </CtaLink>
        <p className="mt-3 text-sm text-db-muted">{t.heroSub}</p>
      </header>

      <section className="rounded-xl border border-db-line bg-db-surface p-6">
        <p>{t.problem}</p>
      </section>

      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">{t.howTitle}</h2>
        <ol className="mt-4 space-y-4">
          {t.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-db-mono text-db-accent">{i + 1}</span>
              <span>
                {step}
                {i === 1 && (
                  <Link
                    href="/how-to-get-documents"
                    className="mt-1 block text-sm text-db-accent underline"
                  >
                    {t.guideLink}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-db-muted">{t.howNote}</p>
      </section>

      <section className="py-4">
        <h2 className="font-db-serif text-2xl font-semibold">{t.checksTitle}</h2>
        <ul className="mt-4 space-y-3">
          {t.checks.map((c) => (
            <li key={c} className="rounded-xl border border-db-line bg-db-surface p-4">
              {c}
              <span className="mt-1 block text-sm text-db-muted">{t.checksCite}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-db-muted">{t.checksNote}</p>
      </section>

      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">{t.reportTitle}</h2>
        <p className="mt-3">
          <strong>{t.reportBody1a}</strong>
          {t.reportBody1b}
          <strong>{t.reportBody1c}</strong>
          {t.reportBody1d}
        </p>
        <p className="mt-3 text-db-muted">{t.reportBody2}</p>
      </section>

      <section className="rounded-xl border-2 border-db-accent bg-db-surface p-6">
        <p className="font-db-serif text-3xl font-bold">
          $299 <span className="text-base font-normal text-db-muted">{t.priceUnit}</span>
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {t.priceItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-db-muted">{t.priceNote}</p>
        <p className="mt-3 text-sm text-db-muted">{t.refundNote}</p>
      </section>

      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">{t.fitTitle}</h2>
        <p className="mt-3">
          <strong>{t.fitYesLabel}</strong>
          {t.fitYes}
        </p>
        <p className="mt-3">
          <strong>{t.fitNoLabel}</strong>
          {t.fitNo}
        </p>
      </section>

      <section className="py-4">
        <h2 className="font-db-serif text-2xl font-semibold">{t.faqTitle}</h2>
        <div className="mt-4 space-y-2">
          {t.faq.map(([q, a]) => (
            <details key={q} className="rounded-xl border border-db-line bg-db-surface p-4">
              <summary className="cursor-pointer font-semibold">{q}</summary>
              <p className="mt-2 text-db-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="py-8 text-center">
        <CtaLink
          href="/check"
          position="footer"
          className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {t.cta}
        </CtaLink>
      </div>

      <footer className="border-t border-db-line pt-6 text-sm text-db-muted">
        <p>{t.footerLegal}</p>
        <p className="mt-3">
          <Link href="/auth/signin" className="underline">
            {t.staffSignIn}
          </Link>
        </p>
      </footer>
    </main>
  )
}
