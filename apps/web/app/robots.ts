import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in and funnel-private surfaces stay out of the index.
      disallow: ['/case/', '/cases', '/ops', '/qa', '/buy', '/check', '/auth/', '/api/'],
    },
    sitemap: 'https://www.snotnoselegal.com/sitemap.xml',
  }
}
