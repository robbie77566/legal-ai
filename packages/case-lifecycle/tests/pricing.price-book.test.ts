import { describe, it, expect } from 'vitest'
import { DEFAULT_PRICE_BOOK, resolvePrice, priceForBucket, type PriceBook } from '../index'

const at = '2026-02-01T00:00:00.000Z'

describe('B4 — the family price book equals the api defaults (PRICES_CENTS)', () => {
  it('review / overage / rerun are 29900 / 4900 / 9900', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'REVIEW', at })?.cents).toBe(29900)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'OVERAGE', at })?.cents).toBe(4900)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'RERUN', at })?.cents).toBe(9900)
  })
  it('every bucket prices a family record at the flat 29900 — families never see the ladder', () => {
    for (const bucket of ['SHORT', 'STANDARD', 'EXTENDED', 'LONG'] as const) {
      expect(priceForBucket(DEFAULT_PRICE_BOOK, bucket, 'FAMILY', at)).toMatchObject({ kind: 'PRICE', cents: 29900, sku: 'REVIEW', rung: bucket })
    }
  })
})

describe('the counsel ladder and the rest of §4 as data', () => {
  it('counsel rungs 14900 / 24900 / 34900, re-run 9900, long quote from 49900 (not purchasable)', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'COUNSEL_SHORT', at })?.cents).toBe(14900)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'COUNSEL_STANDARD', at })?.cents).toBe(24900)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'COUNSEL_EXTENDED', at })?.cents).toBe(34900)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'RERUN', at })?.cents).toBe(9900)
    const long = resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'COUNSEL_LONG', at })
    expect(long).toMatchObject({ cents: 49900, purchasable: false, terms: { kind: 'QUOTE_FROM' } })
  })
  it('five-record packs: 10% off five rungs, 12-month expiry', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'PACK_SHORT', at })).toMatchObject({ cents: 67050, terms: { kind: 'PACK', records: 5, discountPercent: 10, expiryMonths: 12, rung: 'SHORT' } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'PACK_STANDARD', at })?.cents).toBe(112050)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'PACK_EXTENDED', at })?.cents).toBe(157050)
  })
  it('promotions: first review free (≤500 pages, verified bar, monthly cap) and the 15% partner code', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'FIRST_REVIEW_FREE', at })).toMatchObject({ cents: 0, terms: { kind: 'FREE_FIRST', maxPages: 500, requiresBarVerification: true, monthCap: 10 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'ATTORNEY', sku: 'PARTNER_CODE', at })).toMatchObject({ cents: 0, terms: { kind: 'PARTNER_CODE', discountPercent: 15, firstPaidOnly: true } })
  })
  it('offices: 50 / 120 / 250 records a year at 900000 / 1800000 / 3000000; pilot 15 records for 90 days at 0', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'OFFICE', sku: 'OFFICE_50', at })).toMatchObject({ cents: 900000, terms: { kind: 'ALLOWANCE', records: 50, periodDays: 365 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'OFFICE', sku: 'OFFICE_120', at })).toMatchObject({ cents: 1800000, terms: { records: 120 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'OFFICE', sku: 'OFFICE_250', at })).toMatchObject({ cents: 3000000, terms: { records: 250 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'OFFICE', sku: 'PD_PILOT', at })).toMatchObject({ cents: 0, terms: { kind: 'ALLOWANCE', records: 15, periodDays: 90 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'OFFICE', sku: 'RERUN', at })?.cents).toBe(9900)
  })
  it('clinics: 25 records a year at 0, then Office rates', () => {
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'CLINIC', sku: 'PUBLIC_INTEREST', at })).toMatchObject({ cents: 0, terms: { kind: 'ALLOWANCE', records: 25, periodDays: 365 } })
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'CLINIC', sku: 'OFFICE_50', at })?.cents).toBe(900000)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'CLINIC', sku: 'OFFICE_250', at })?.cents).toBe(3000000)
  })
  it('every row is usd, labelled, dated, and an audience/sku pair appears once', () => {
    const seen = new Set<string>()
    for (const row of DEFAULT_PRICE_BOOK.rows) {
      expect(row.currency).toBe('usd')
      expect(row.label.length).toBeGreaterThan(0)
      expect(row.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(Number.isInteger(row.cents) && row.cents >= 0).toBe(true)
      const key = `${row.audience}:${row.sku}`
      expect(seen.has(key), `duplicate row ${key}`).toBe(false)
      seen.add(key)
    }
  })
})

describe('resolvePrice picks the row in effect', () => {
  const book: PriceBook = {
    rows: [
      { audience: 'FAMILY', sku: 'REVIEW', cents: 29900, currency: 'usd', effectiveFrom: '2025-01-01', effectiveTo: '2026-06-01', label: 'old' },
      { audience: 'FAMILY', sku: 'REVIEW', cents: 34900, currency: 'usd', effectiveFrom: '2026-06-01', label: 'new' },
    ],
  }
  it('before the change: 29900; from the change date: 34900; before any row: null', () => {
    expect(resolvePrice(book, { audience: 'FAMILY', sku: 'REVIEW', at: '2026-05-31T23:59:59Z' })?.cents).toBe(29900)
    expect(resolvePrice(book, { audience: 'FAMILY', sku: 'REVIEW', at: '2026-06-01T00:00:00Z' })?.cents).toBe(34900)
    expect(resolvePrice(book, { audience: 'FAMILY', sku: 'REVIEW', at: '2024-12-31T00:00:00Z' })).toBeNull()
    expect(resolvePrice(book, { audience: 'ATTORNEY', sku: 'COUNSEL_SHORT', at })).toBeNull()
  })
  it('two overlapping rows: the later effectiveFrom wins', () => {
    const overlapping: PriceBook = { rows: [
      { audience: 'FAMILY', sku: 'REVIEW', cents: 29900, currency: 'usd', effectiveFrom: '2025-01-01', label: 'a' },
      { audience: 'FAMILY', sku: 'REVIEW', cents: 34900, currency: 'usd', effectiveFrom: '2026-01-01', label: 'b' },
    ] }
    expect(resolvePrice(overlapping, { audience: 'FAMILY', sku: 'REVIEW', at })?.cents).toBe(34900)
  })
  it('priceForBucket reports a missing rung as NO_PRICE rather than guessing', () => {
    expect(priceForBucket(book, 'SHORT', 'ATTORNEY', at)).toEqual({ kind: 'NO_PRICE', audience: 'ATTORNEY', sku: 'COUNSEL_SHORT' })
    // Offices and clinics are allowance-funded: no per-record rung in the default book.
    expect(priceForBucket(DEFAULT_PRICE_BOOK, 'SHORT', 'OFFICE', at)).toEqual({ kind: 'NO_PRICE', audience: 'OFFICE', sku: 'COUNSEL_SHORT' })
    expect(priceForBucket(DEFAULT_PRICE_BOOK, 'STANDARD', 'CLINIC', at)).toMatchObject({ kind: 'NO_PRICE' })
  })
  it('LONG is a quote for every professional audience, from 49900', () => {
    for (const audience of ['ATTORNEY', 'OFFICE', 'CLINIC'] as const) {
      expect(priceForBucket(DEFAULT_PRICE_BOOK, 'LONG', audience, at)).toEqual({ kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' })
    }
  })
})
