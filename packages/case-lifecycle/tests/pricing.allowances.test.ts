import { describe, it, expect } from 'vitest'
import { pilotAllowance, publicInterestAllowance, officeAllowance, decrementAllowance, renewAllowance, type AllowanceLedger } from '../index'

const start = '2026-01-10T00:00:00.000Z'

function drain(ledger: AllowanceLedger, n: number, at: string): AllowanceLedger {
  let l = ledger
  for (let i = 1; i <= n; i++) {
    const r = decrementAllowance(l, at)
    expect(r.ok, `record ${i}`).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.remaining).toBe(ledger.granted - i)
    l = r.ledger
  }
  return l
}

describe('B3 — allowances', () => {
  it('PD pilot: 15 records for 90 days, then refused', () => {
    const ledger = pilotAllowance(start)
    expect(ledger).toEqual({ kind: 'PILOT', granted: 15, used: 0, startsAt: start, resetsAt: '2026-04-10T00:00:00.000Z', renews: false })
    const at = '2026-02-01T00:00:00.000Z'
    const drained = drain(ledger, 15, at)
    expect(drained.used).toBe(15)
    expect(decrementAllowance(drained, at)).toEqual({ ok: false, reason: 'EXHAUSTED', remaining: 0 })
  })

  it('PD pilot: refused after day 90 even with records left, and before it starts', () => {
    const ledger = pilotAllowance(start)
    expect(decrementAllowance(ledger, '2026-04-09T23:59:59.000Z').ok).toBe(true)
    expect(decrementAllowance(ledger, '2026-04-10T00:00:00.000Z')).toEqual({ ok: false, reason: 'PERIOD_ENDED', remaining: 15 })
    expect(decrementAllowance(ledger, '2026-01-09T00:00:00.000Z')).toEqual({ ok: false, reason: 'NOT_STARTED', remaining: 15 })
    // A pilot does not renew; it converts to an Office plan (plan §4) — that is the persistence layer's job.
    expect(renewAllowance(ledger)).toBeNull()
  })

  it('public interest: 25 records a year at 0, then refused; renews on the anniversary', () => {
    const ledger = publicInterestAllowance(start)
    expect(ledger).toEqual({ kind: 'PUBLIC_INTEREST', granted: 25, used: 0, startsAt: start, resetsAt: '2027-01-10T00:00:00.000Z', renews: true })
    const at = '2026-06-01T00:00:00.000Z'
    const drained = drain(ledger, 25, at)
    expect(decrementAllowance(drained, at)).toEqual({ ok: false, reason: 'EXHAUSTED', remaining: 0 })
    expect(renewAllowance(drained)).toEqual({ kind: 'PUBLIC_INTEREST', granted: 25, used: 0, startsAt: '2027-01-10T00:00:00.000Z', resetsAt: '2028-01-10T00:00:00.000Z', renews: true })
  })

  it('office tiers: 50 / 120 / 250 records a year', () => {
    expect(officeAllowance(50, start)).toEqual({ kind: 'OFFICE', tier: 50, granted: 50, used: 0, startsAt: start, resetsAt: '2027-01-10T00:00:00.000Z', renews: true })
    expect(officeAllowance(120, start)).toMatchObject({ tier: 120, granted: 120 })
    expect(officeAllowance(250, start)).toMatchObject({ tier: 250, granted: 250 })
    const drained = drain(officeAllowance(50, start), 50, '2026-07-01T00:00:00.000Z')
    expect(decrementAllowance(drained, '2026-07-01T00:00:00.000Z')).toEqual({ ok: false, reason: 'EXHAUSTED', remaining: 0 })
    // Past the period end the old ledger refuses; the renewed one accepts.
    expect(decrementAllowance(officeAllowance(50, start), '2027-01-10T00:00:00.000Z')).toEqual({ ok: false, reason: 'PERIOD_ENDED', remaining: 50 })
    const renewed = renewAllowance(drained)
    expect(renewed).toMatchObject({ kind: 'OFFICE', tier: 50, granted: 50, used: 0, startsAt: '2027-01-10T00:00:00.000Z' })
    expect(decrementAllowance(renewed!, '2027-01-10T00:00:00.000Z')).toMatchObject({ ok: true, remaining: 49 })
  })

  it('a leap day start resets on the last day of February', () => {
    expect(publicInterestAllowance('2028-02-29T00:00:00.000Z').resetsAt).toBe('2029-02-28T00:00:00.000Z')
  })

  it('decrement is pure: the input ledger is not mutated', () => {
    const ledger = officeAllowance(50, start)
    decrementAllowance(ledger, '2026-07-01T00:00:00.000Z')
    expect(ledger.used).toBe(0)
  })
})
