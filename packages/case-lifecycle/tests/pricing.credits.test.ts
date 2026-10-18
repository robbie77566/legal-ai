import { describe, it, expect } from 'vitest'
import { issuePackCredits, consumeCredit, type Credit } from '../index'

const purchasedAt = '2026-01-15T12:00:00.000Z'

describe('B2 — five-record pack', () => {
  it('issues five credits at 10% off five rungs with a 12-month expiry', () => {
    const pack = issuePackCredits({ rung: 'STANDARD', purchasedAt, packId: 'pack-1' })
    expect(pack.credits).toHaveLength(5)
    expect(pack.records).toBe(5)
    expect(pack.listCents).toBe(124500)
    expect(pack.discountCents).toBe(12450)
    expect(pack.totalCents).toBe(112050)
    expect(pack.discountPercent).toBe(10)
    expect(pack.expiresAt).toBe('2027-01-15T12:00:00.000Z')
    for (const c of pack.credits) {
      expect(c).toMatchObject({ rung: 'STANDARD', issuedAt: purchasedAt, expiresAt: '2027-01-15T12:00:00.000Z', packId: 'pack-1', consumedAt: null })
    }
    expect(pack.credits.map((c) => c.id)).toEqual(['pack-1-1', 'pack-1-2', 'pack-1-3', 'pack-1-4', 'pack-1-5'])
    expect(issuePackCredits({ rung: 'SHORT', purchasedAt }).totalCents).toBe(67050)
    expect(issuePackCredits({ rung: 'EXTENDED', purchasedAt }).totalCents).toBe(157050)
  })

  it('five consumptions succeed, the sixth is refused with a typed reason', () => {
    let credits: Credit[] = issuePackCredits({ rung: 'STANDARD', purchasedAt, packId: 'p' }).credits
    const at = '2026-03-01T00:00:00.000Z'
    for (let i = 1; i <= 5; i++) {
      const r = consumeCredit(credits, { rung: 'STANDARD', at })
      expect(r.ok, `consumption ${i}`).toBe(true)
      if (!r.ok) return
      expect(r.credit.consumedAt).toBe(at)
      credits = r.credits
      expect(credits.filter((c) => c.consumedAt === null)).toHaveLength(5 - i)
    }
    const sixth = consumeCredit(credits, { rung: 'STANDARD', at })
    expect(sixth).toEqual({ ok: false, reason: 'PACK_EXHAUSTED' })
  })

  it('a credit expired at +12 months is skipped, never consumed', () => {
    const credits = issuePackCredits({ rung: 'STANDARD', purchasedAt, packId: 'p' }).credits
    const dayBefore = consumeCredit(credits, { rung: 'STANDARD', at: '2027-01-15T11:59:59.000Z' })
    expect(dayBefore.ok).toBe(true)
    const onExpiry = consumeCredit(credits, { rung: 'STANDARD', at: '2027-01-15T12:00:00.000Z' })
    expect(onExpiry).toEqual({ ok: false, reason: 'EXPIRED' })
    const later = consumeCredit(credits, { rung: 'STANDARD', at: '2027-06-01T00:00:00.000Z' })
    expect(later).toEqual({ ok: false, reason: 'EXPIRED' })
    // A live pack beside an expired one: only the live credits are candidates.
    const live = issuePackCredits({ rung: 'STANDARD', purchasedAt: '2027-01-01T00:00:00.000Z', packId: 'live' }).credits
    const r = consumeCredit([...credits, ...live], { rung: 'STANDARD', at: '2027-06-01T00:00:00.000Z' })
    expect(r.ok && r.credit.packId).toBe('live')
  })

  it('rung rule: exact rung first, then the next higher rung; a lower rung never covers a bigger record', () => {
    const short = issuePackCredits({ rung: 'SHORT', purchasedAt, packId: 'short' }).credits
    const ext = issuePackCredits({ rung: 'EXTENDED', purchasedAt: '2026-01-01T00:00:00.000Z', packId: 'ext' }).credits
    const at = '2026-03-01T00:00:00.000Z'
    // A SHORT record uses a SHORT credit even though an older EXTENDED credit exists.
    const r1 = consumeCredit([...ext, ...short], { rung: 'SHORT', at })
    expect(r1.ok && r1.credit.rung).toBe('SHORT')
    // A STANDARD record has no STANDARD credit: it takes the EXTENDED one, never a SHORT one.
    const r2 = consumeCredit([...short, ...ext], { rung: 'STANDARD', at })
    expect(r2.ok && r2.credit.rung).toBe('EXTENDED')
    // An EXTENDED record with only SHORT credits left is refused.
    expect(consumeCredit(short, { rung: 'EXTENDED', at })).toEqual({ ok: false, reason: 'RUNG_TOO_LOW' })
  })

  it('the soonest-expiring credit of the chosen rung goes first', () => {
    const a = issuePackCredits({ rung: 'SHORT', purchasedAt: '2026-02-01T00:00:00.000Z', packId: 'a' }).credits
    const b = issuePackCredits({ rung: 'SHORT', purchasedAt: '2026-01-01T00:00:00.000Z', packId: 'b' }).credits
    const r = consumeCredit([...a, ...b], { rung: 'SHORT', at: '2026-03-01T00:00:00.000Z' })
    expect(r.ok && r.credit.packId).toBe('b')
  })

  it('an empty wallet is PACK_EXHAUSTED; a credit cannot be used before it is issued', () => {
    expect(consumeCredit([], { rung: 'SHORT', at: '2026-03-01T00:00:00.000Z' })).toEqual({ ok: false, reason: 'PACK_EXHAUSTED' })
    const credits = issuePackCredits({ rung: 'SHORT', purchasedAt }).credits
    expect(consumeCredit(credits, { rung: 'SHORT', at: '2026-01-01T00:00:00.000Z' })).toEqual({ ok: false, reason: 'NOT_YET_VALID' })
  })

  it('consumption is pure: the input credits are not mutated', () => {
    const credits = issuePackCredits({ rung: 'SHORT', purchasedAt }).credits
    consumeCredit(credits, { rung: 'SHORT', at: '2026-03-01T00:00:00.000Z' })
    expect(credits.every((c) => c.consumedAt === null)).toBe(true)
  })

  it('refuses to issue a LONG pack', () => {
    // @ts-expect-error LONG is not a purchasable rung
    expect(() => issuePackCredits({ rung: 'LONG', purchasedAt })).toThrow()
  })
})
