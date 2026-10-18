import { describe, it, expect } from 'vitest'
import { classifyRecord, familyOverage, priceForBucket, DEFAULT_PRICE_BOOK } from '../index'

const at = '2026-02-01T00:00:00.000Z'

describe('B1 — record buckets from reporter pages (plan §4)', () => {
  const cases: Array<[number, string, number]> = [
    [99, 'SHORT', 14900],
    [100, 'STANDARD', 24900],
    [500, 'STANDARD', 24900],
    [501, 'EXTENDED', 34900],
    [1500, 'EXTENDED', 34900],
  ]
  for (const [pages, bucket, cents] of cases) {
    it(`${pages} reporter pages → ${bucket} at ${cents}`, () => {
      const r = classifyRecord({ reporterPages: pages })
      expect(r.bucket).toBe(bucket)
      const p = priceForBucket(DEFAULT_PRICE_BOOK, r.bucket, 'ATTORNEY', at)
      expect(p.kind).toBe('PRICE')
      if (p.kind === 'PRICE') expect(p.cents).toBe(cents)
    })
  }

  it('1,501 reporter pages → LONG, which is a quote from 49900 for attorneys', () => {
    const r = classifyRecord({ reporterPages: 1501 })
    expect(r.bucket).toBe('LONG')
    const p = priceForBucket(DEFAULT_PRICE_BOOK, r.bucket, 'ATTORNEY', at)
    expect(p).toMatchObject({ kind: 'QUOTE_REQUIRED', from: 49900 })
  })

  it('zero and one page are SHORT; the boundaries are reported', () => {
    expect(classifyRecord({ reporterPages: 0 }).bucket).toBe('SHORT')
    expect(classifyRecord({ reporterPages: 1 }).bucket).toBe('SHORT')
    expect(classifyRecord({ reporterPages: 1 }).boundaries).toEqual({
      SHORT: { min: 0, max: 99 },
      STANDARD: { min: 100, max: 500 },
      EXTENDED: { min: 501, max: 1500 },
      LONG: { min: 1501, max: null },
    })
  })

  it("clerk's record and exhibit pages are metered but never move the bucket", () => {
    const r = classifyRecord({ reporterPages: 99, clerkPages: 3000, exhibitPages: 4000 })
    expect(r.bucket).toBe('SHORT')
    expect(r.meteredPages).toEqual({ reporter: 99, clerk: 3000, exhibit: 4000, total: 7099 })
    const s = classifyRecord({ reporterPages: 500, clerkPages: 1 })
    expect(s.bucket).toBe('STANDARD')
    expect(s.meteredPages).toEqual({ reporter: 500, clerk: 1, exhibit: 0, total: 501 })
    expect(classifyRecord({ reporterPages: 1500, exhibitPages: 10_000 }).bucket).toBe('EXTENDED')
  })

  it('rejects a negative or fractional page count', () => {
    expect(() => classifyRecord({ reporterPages: -1 })).toThrow()
    expect(() => classifyRecord({ reporterPages: 10.5 })).toThrow()
    expect(() => classifyRecord({ reporterPages: 10, clerkPages: -2 })).toThrow()
  })
})

describe("today's family overage rule as a pure function (not wired into the family path)", () => {
  it('5,000 pages are included; the first block starts at page 5,001', () => {
    expect(familyOverage(0)).toEqual({ meteredPages: 0, includedPages: 5000, blockPages: 2500, blockCents: 4900, purchasedBlocks: 0, allowance: 5000, blocksNeeded: 0, cents: 0 })
    expect(familyOverage(5000).blocksNeeded).toBe(0)
    expect(familyOverage(5001)).toMatchObject({ blocksNeeded: 1, cents: 4900 })
    expect(familyOverage(7500)).toMatchObject({ blocksNeeded: 1, cents: 4900 })
    expect(familyOverage(7501)).toMatchObject({ blocksNeeded: 2, cents: 9800 })
  })
  it('already-purchased blocks extend the allowance (the intake overage gate)', () => {
    expect(familyOverage(7500, 1)).toMatchObject({ blocksNeeded: 0, cents: 0, allowance: 7500 })
    expect(familyOverage(7501, 1)).toMatchObject({ blocksNeeded: 1, cents: 4900, allowance: 7500 })
  })
})
