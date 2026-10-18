/**
 * Staging must never be indexed (render.staging.yaml, environment_reference
 * → Staging): the same web code serves staging.snotnoselegal.com, and the
 * production rules there would invite crawlers to list test pages beside the
 * real site. The deployment is recognised from NEXTAUTH_URL's host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('isStagingSite', () => {
  it('is true only for a staging.* host', async () => {
    const { isStagingSite } = await import('@/lib/site-env')
    expect(isStagingSite('https://staging.snotnoselegal.com')).toBe(true)
    expect(isStagingSite('https://www.snotnoselegal.com')).toBe(false)
    expect(isStagingSite('http://localhost:3000')).toBe(false)
    expect(isStagingSite('not a url')).toBe(false)
    expect(isStagingSite(undefined)).toBe(false)
  })
})

describe('staging (NEXTAUTH_URL=https://staging.snotnoselegal.com)', () => {
  beforeEach(() => vi.stubEnv('NEXTAUTH_URL', 'https://staging.snotnoselegal.com'))

  it('robots.txt disallows everything and names no sitemap', async () => {
    const robots = (await import('@/app/robots')).default
    const r = robots()
    expect(r.rules).toEqual({ userAgent: '*', disallow: '/' })
    expect(r.sitemap).toBeUndefined()
  })

  it('sitemap is empty', async () => {
    const sitemap = (await import('@/app/sitemap')).default
    expect(sitemap()).toEqual([])
  })

  it('root metadata carries noindex, nofollow', async () => {
    const { metadata } = await import('@/app/layout')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('production (NEXTAUTH_URL=https://www.snotnoselegal.com)', () => {
  beforeEach(() => vi.stubEnv('NEXTAUTH_URL', 'https://www.snotnoselegal.com'))

  it('robots.txt allows the public site and keeps the private surfaces out', async () => {
    const r = (await import('@/app/robots')).default()
    expect(r.rules).toMatchObject({ userAgent: '*', allow: '/' })
    expect((r.rules as { disallow: string[] }).disallow).toContain('/case/')
    expect(r.sitemap).toBe('https://www.snotnoselegal.com/sitemap.xml')
  })

  it('sitemap lists the public pages and root metadata sets no robots rule', async () => {
    expect((await import('@/app/sitemap')).default().length).toBeGreaterThan(10)
    expect((await import('@/app/layout')).metadata.robots).toBeUndefined()
  })
})
