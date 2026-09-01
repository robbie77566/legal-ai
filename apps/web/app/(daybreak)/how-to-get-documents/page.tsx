'use client'

/**
 * The documents guide (i18n_localization.md §2 education requirement):
 * free, public, bilingual — every document in plain words, what it looks
 * like, exactly how to ask for it (with a phone script), what it costs,
 * and what file formats we accept. Written for a reader who has never
 * touched a court file.
 */
import Link from 'next/link'
import { useContent, LangSwitch } from '../../../lib/i18n'
import { GUIDE_CONTENT as G } from '../../../lib/content/guide'


export default function DocumentsGuide() {
  const t = useContent(G)
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-db-serif font-bold text-db-accent">
          Family Case Review
        </Link>
        <LangSwitch />
      </div>

      <h1 className="mt-6 font-db-serif text-3xl font-semibold">{t.title}</h1>
      <p className="mt-3">{t.intro}</p>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">{t.formatsTitle}</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        {t.formats.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">{t.clerkTitle}</h2>
      <p className="mt-2">{t.clerkIntro}</p>
      <blockquote className="mt-3 rounded-xl border border-db-line bg-db-surface p-4 italic">
        {t.script}
      </blockquote>
      <p className="mt-3 text-sm text-db-muted">{t.clerkNote}</p>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">{t.docsTitle}</h2>
      <div className="mt-3 space-y-4">
        {t.docs.map((d) => (
          <details key={d.name} className="rounded-xl border border-db-line bg-db-surface p-4">
            <summary className="cursor-pointer font-semibold">{d.name}</summary>
            <p className="mt-2">{d.what}</p>
            <p className="mt-2 text-sm text-db-muted">{d.looks}</p>
            <p className="mt-2 text-sm">{d.how}</p>
          </details>
        ))}
      </div>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">{t.cantTitle}</h2>
      <p className="mt-2">{t.cant}</p>

      <div className="mt-8 space-y-3">
        <Link
          href="/check"
          className="block rounded-xl bg-db-accent px-6 py-4 text-center text-lg font-semibold text-db-surface"
        >
          {t.cta}
        </Link>
        <Link href="/" className="block text-center text-sm text-db-muted underline">
          {t.back}
        </Link>
      </div>
    </main>
  )
}
