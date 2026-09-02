'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { ABOUT_CONTENT as A } from '../../../lib/content/about'

export default function About() {
  const t = useContent(A)
  const sections: [string, string][] = [
    [t.whoTitle, t.whoBody],
    [t.whyTitle, t.whyBody],
    [t.howTitle, t.howBody],
    [t.notTitle, t.notBody],
  ]
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      {sections.map(([title, body]) => (
        <section key={title} className="mt-8">
          <h2 className="font-db-serif text-xl font-semibold">{title}</h2>
          <p className="mt-2 text-db-muted">{body}</p>
        </section>
      ))}
      <div className="py-10 text-center">
        <Link href="/check" className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface">
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
