import type { Metadata } from 'next'
import { LEARN_CONTENT } from '../../../../lib/content/learn'

type Articles = typeof LEARN_CONTENT.en.articles
export function generateStaticParams() {
  return Object.keys(LEARN_CONTENT.en.articles).map((slug) => ({ slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = (LEARN_CONTENT.en.articles as Articles)[params.slug as keyof Articles]
  if (!article) return { title: 'Learn — Family Case Review' }
  return { title: `${article.title} — Family Case Review`, description: article.blurb }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
