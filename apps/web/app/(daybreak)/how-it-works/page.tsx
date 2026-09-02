'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { HOW_CONTENT as H } from '../../../lib/content/how-it-works'

export default function HowItWorks() {
  const t = useContent(H)
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-db-muted">{t.intro}</p>

      <ol className="mt-8 space-y-4">
        {t.stages.map(([stage, body]) => (
          <li key={stage} className="rounded-xl border border-db-line bg-db-surface p-5">
            <h2 className="font-db-serif text-lg font-semibold">{stage}</h2>
            <p className="mt-2 text-sm text-db-muted">{body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 font-db-serif text-2xl font-semibold">{t.partsTitle}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {t.parts.map(([title, body]) => (
          <div key={title} className="rounded-xl border-2 border-db-accent bg-db-surface p-5">
            <h3 className="font-db-serif font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-db-muted">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center">
        <Link href="/sample-report" className="font-semibold text-db-accent underline">
          {t.sampleLink}
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="font-db-serif text-xl font-semibold">{t.afterTitle}</h2>
        <p className="mt-2 text-db-muted">{t.afterBody}</p>
      </section>

      <div className="py-10 text-center">
        <Link href="/check" className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface">
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
