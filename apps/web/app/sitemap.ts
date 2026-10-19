import type { MetadataRoute } from 'next'
import { isStagingSite } from '@/lib/site-env'

/** Public, indexable pages only (snotnoselegal_site_design.md §5). */
const BASE = 'https://www.snotnoselegal.com'

export default function sitemap(): MetadataRoute.Sitemap {
  if (isStagingSite()) return []
  return [
    '', '/review', '/how-it-works', '/pricing', '/about', '/faq', '/contact', '/learn',
    '/learn/what-is-an-11-07-writ', '/learn/the-federal-one-year-deadline',
    '/learn/why-the-first-writ-matters-most', '/learn/what-ineffective-assistance-means',
    '/sample-report', '/how-to-get-documents', '/disclosures', '/privacy', '/accessibility',
    // Professional marketing pages (workstream F): indexable, never linked from the family nav.
    '/for-counsel', '/for-offices', '/for-offices/security', '/for-investigators',
  ].map(
    (path) => ({ url: `${BASE}${path}`, changeFrequency: 'weekly' as const })
  )
}
