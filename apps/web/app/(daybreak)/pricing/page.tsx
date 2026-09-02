'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { PRICING_CONTENT as P } from '../../../lib/content/pricing'

export default function Pricing() {
  const t = useContent(P)
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-db-muted">{t.intro}</p>

      <section className="mt-8 rounded-xl border-2 border-db-accent bg-db-surface p-6">
        <h2 className="font-db-serif text-xl font-semibold">{t.includedTitle}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {t.included.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-db-serif text-xl font-semibold">{t.addonsTitle}</h2>
        <div className="mt-3 space-y-3">
          {t.addons.map(([label, body]) => (
            <div key={label} className="rounded-xl border border-db-line bg-db-surface p-4">
              <p className="font-semibold">{label}</p>
              <p className="mt-1 text-sm text-db-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-db-serif text-xl font-semibold">{t.freeTitle}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-db-muted">
          {t.free.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-xl font-semibold">{t.anchorTitle}</h2>
        <p className="mt-2 text-db-muted">{t.anchorBody}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-db-serif text-xl font-semibold">{t.payTitle}</h2>
        <p className="mt-2 text-db-muted">{t.payBody}</p>
      </section>

      <div className="py-10 text-center">
        <Link href="/check" className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface">
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
