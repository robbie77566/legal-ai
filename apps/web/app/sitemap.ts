import type { MetadataRoute } from 'next'

/** Public, indexable pages only (snotnoselegal_site_design.md §5). */
const BASE = 'https://www.snotnoselegal.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    '', '/review', '/how-it-works', '/pricing', '/about', '/faq', '/contact', '/learn',
    '/learn/what-is-an-11-07-writ', '/learn/the-federal-one-year-deadline',
    '/learn/why-the-first-writ-matters-most', '/learn/what-ineffective-assistance-means',
    '/sample-report', '/how-to-get-documents', '/disclosures', '/privacy', '/accessibility',
  ].map(
    (path) => ({ url: `${BASE}${path}`, changeFrequency: 'weekly' as const })
  )
}
