'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { SITE_FAQ_CONTENT as F } from '../../../lib/content/site-faq'

export default function SiteFaq() {
  const t = useContent(F)
  const cta = useContent({ en: 'Start the free check', es: 'Empiece la revisión gratis' })
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <div className="mt-6 space-y-2">
        {t.faq.map(([q, a]) => (
          <details key={q} className="rounded-xl border border-db-line bg-db-surface p-4">
            <summary className="cursor-pointer font-semibold">{q}</summary>
            <p className="mt-2 text-db-muted">{a}</p>
          </details>
        ))}
      </div>
      <div className="py-10 text-center">
        <Link href="/check" className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface">
          {cta}
        </Link>
      </div>
    </main>
  )
}
