import type { MetadataRoute } from 'next'
import { isStagingSite } from '@/lib/site-env'

export default function robots(): MetadataRoute.Robots {
  // Staging: nothing is indexable, and no sitemap points crawlers anywhere.
  if (isStagingSite()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in and funnel-private surfaces stay out of the index.
      disallow: ['/case/', '/cases', '/account', '/ops', '/qa', '/buy', '/check', '/auth/', '/api/', '/counsel', '/for-counsel/signup'],
    },
    sitemap: 'https://www.snotnoselegal.com/sitemap.xml',
  }
}
