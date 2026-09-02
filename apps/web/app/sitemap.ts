import type { MetadataRoute } from 'next'

/** Public, indexable pages only (snotnoselegal_site_design.md §5). */
const BASE = 'https://www.snotnoselegal.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/review', '/pricing', '/about', '/faq', '/contact', '/how-to-get-documents', '/disclosures', '/privacy', '/accessibility'].map(
    (path) => ({ url: `${BASE}${path}`, changeFrequency: 'weekly' as const })
  )
}
