'use client'

import Link from 'next/link'
import SiteNav from '../../../components/site/SiteNav'
import { useContent } from '../../../lib/i18n'
import { LEARN_CONTENT as L } from '../../../lib/content/learn'

export default function LearnHub() {
  const t = useContent(L)
  return (
    <main className="mx-auto max-w-2xl px-5">
      <SiteNav />
      <h1 className="mt-6 font-db-serif text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-db-muted">{t.intro}</p>

      <div className="mt-6 space-y-3">
        <Link
          href="/how-to-get-documents"
          className="block rounded-xl border-2 border-db-accent bg-db-surface p-4 hover:bg-db-accent-soft"
        >
          <span className="block font-semibold">{t.guideCard.title}</span>
          <span className="mt-1 block text-sm text-db-muted">{t.guideCard.blurb}</span>
        </Link>
        {Object.entries(t.articles).map(([slug, article]) => (
          <Link
            key={slug}
            href={`/learn/${slug}`}
            className="block rounded-xl border border-db-line bg-db-surface p-4 hover:border-db-accent"
          >
            <span className="block font-semibold">{article.title}</span>
            <span className="mt-1 block text-sm text-db-muted">{article.blurb}</span>
          </Link>
        ))}
      </div>

      <p className="mt-8 rounded-xl border border-db-line bg-db-surface p-4 text-sm text-db-muted">
        {t.disclaimer}
      </p>
    </main>
  )
}
