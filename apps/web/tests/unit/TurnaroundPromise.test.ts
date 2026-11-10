import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Founder decision 2026-11-10: the family promise is "within 2 hours", never
 * "10 business days", and no surface says a person reviews the report. These
 * phrases must not come back in any customer-facing text — content files,
 * family pages, components, the emails, the PDFs, the brand constants.
 */
const ROOT = resolve(__dirname, '../../..', '..')
const SCAN = [
  'apps/web/lib/content',
  'apps/web/lib/tracker.ts',
  'apps/web/app/(daybreak)',
  'apps/web/app/(professional)',
  'apps/web/components',
  'packages/email/index.ts',
  'packages/case-lifecycle/brand.ts',
  'packages/reports',
]

const FORBIDDEN: [RegExp, string][] = [
  [/\b(within|in|of|due)\s+(10|ten)\s+business\s+days\b/i, 'ten-business-day turnaround'],
  [/\bten business days\b/i, 'ten-business-day turnaround'],
  [/\b(dentro de|en)\s+(10|diez)\s+días\s+hábiles\b|\bdiez días hábiles\b/i, 'ten-business-day turnaround (es)'],
  [/\bwithin 24 hours\b/i, '24-hour promise'],
  [/\bhuman review\b/i, 'human review'],
  [/\brevisión humana\b/i, 'human review (es)'],
  [/\b(review staff|staff review|quality reviewer|legal reviewer|trained legal|review team)\b/i, 'a human reviewer'],
  [/\b(personal|equipo) de revisión\b/i, 'a human reviewer (es)'],
  [/\ba person (reads|checks|verif|looks|will|on our staff)/i, 'a person doing the work'],
  [/\b(una persona|por una persona)\b/i, 'a person doing the work (es)'],
]

function files(dir: string, out: string[] = []): string[] {
  const full = join(ROOT, dir)
  if (statSync(full).isFile()) return [...out, full]
  for (const name of readdirSync(full)) {
    if (name === 'node_modules' || name === 'tests' || name === '__tests__' || name === '.next') continue
    const p = join(full, name)
    if (statSync(p).isDirectory()) files(join(dir, name), out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('the turnaround promise and the absence of human review', () => {
  const all = SCAN.flatMap((d) => files(d))

  it('scans a meaningful set of customer-facing files', () => {
    expect(all.length).toBeGreaterThan(40)
  })

  it('no customer-facing file promises ten business days or names a human reviewer', () => {
    const hits: string[] = []
    for (const f of all) {
      const text = readFileSync(f, 'utf8')
      for (const [re, label] of FORBIDDEN) {
        const m = text.match(re)
        if (m) hits.push(`${f.replace(ROOT + '/', '')}: ${label} — "${m[0]}"`)
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('the shared turnaround constant is two hours and the brand sentence names only automated gates', async () => {
    const { LAUNCH_SLA_HOURS, QUALITY_CHECKED } = await import('@hg/case-lifecycle')
    expect(LAUNCH_SLA_HOURS).toBe(2)
    expect(QUALITY_CHECKED.en).toMatch(/automated quality gates/)
    expect(QUALITY_CHECKED.en).not.toMatch(/staff|person|reviewer/i)
    expect(QUALITY_CHECKED.es).not.toMatch(/personal|persona|revisor/i)
  })
})
