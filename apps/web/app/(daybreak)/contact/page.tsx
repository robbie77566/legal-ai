'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { CONTACT_CONTENT as C } from '../../../lib/content/contact'

export default function Contact() {
  const t = useContent(C)
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-db-muted">{t.body}</p>
      <p className="mt-4 rounded-xl border-2 border-db-accent bg-db-surface p-5 text-center">
        <a href={`mailto:${t.email}`} className="font-db-mono text-lg font-semibold text-db-accent underline">
          {t.email}
        </a>
        <span className="mt-1 block text-sm text-db-muted">{t.response}</span>
      </p>
      <section className="mt-8">
        <h2 className="font-db-serif text-xl font-semibold">{t.canTitle}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-db-muted">
          {t.can.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-xl font-semibold">{t.cantTitle}</h2>
        <p className="mt-2 text-db-muted">{t.cant}</p>
      </section>
      <div className="py-10 text-center">
        <Link href="/check" className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface">
          {t.cta}
        </Link>
      </div>
    </main>
  )
}
