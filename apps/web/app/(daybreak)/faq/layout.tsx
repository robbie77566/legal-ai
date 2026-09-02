import type { Metadata } from 'next'
import { SITE_FAQ_CONTENT } from '../../../lib/content/site-faq'

export const metadata: Metadata = {
  title: 'FAQ — Family Case Review',
  description:
    'How long the review takes, what file formats work, what happens if we find nothing, how your data is handled, and how paying in installments works.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  // FAQPage structured data (snotnoselegal_site_design.md §5) — English
  // entries only; search engines treat JSON-LD as canonical-language data.
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SITE_FAQ_CONTENT.en.faq.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {children}
    </>
  )
}
