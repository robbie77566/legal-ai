'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import SiteNav from '../../../../components/site/SiteNav'
import { useContent } from '../../../../lib/i18n'
import { LEARN_CONTENT as L } from '../../../../lib/content/learn'

const CTA = {
  en: { back: '← All articles', cta: 'Start the free check', missing: 'That article doesn’t exist — here are all of them.' },
  es: { back: '← Todos los artículos', cta: 'Empiece la revisión gratis', missing: 'Ese artículo no existe — aquí están todos.' },
}

export default function LearnArticle() {
  const { slug } = useParams<{ slug: string }>()
  const t = useContent(L)
  const ui = useContent(CTA)
  const article = t.articles[slug as keyof typeof t.articles]

  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <Link href="/learn" className="mt-6 inline-block text-sm text-db-accent underline">
        {ui.back}
      </Link>
      {!article ? (
        <p className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">{ui.missing}</p>
      ) : (
        <>
          <h1 className="mt-4 font-db-serif text-3xl font-bold leading-tight">{article.title}</h1>
          {article.sections.map(([heading, body]) => (
            <section key={heading} className="mt-7">
              <h2 className="font-db-serif text-xl font-semibold">{heading}</h2>
              <p className="mt-2 text-db-muted">{body}</p>
            </section>
          ))}
          <p className="mt-8 rounded-xl border border-db-line bg-db-surface p-4 text-sm text-db-muted">
            {t.disclaimer}
          </p>
          <div className="py-10 text-center">
            <Link
              href="/check"
              className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
            >
              {ui.cta}
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
