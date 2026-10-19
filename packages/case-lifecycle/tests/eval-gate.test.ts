import { describe, it, expect } from 'vitest'
import {
  gateVerdict,
  costPerBucket,
  MUST_FIND_RECALL_FLOOR,
  VERDICT_PRECISION_FLOOR,
  EXTENDED_MARGIN_FLOOR,
  type GateLedger,
  type GateScorecard,
} from '../eval-gate'

/**
 * J6 — the eval gate as a pure function (persona_rollout_plan.md §5 J, §7,
 * §8): literal scorecards pass or fail on the ledger's must-find and verdict
 * rules and the plan's cost floor; cost per bucket aggregates correctly.
 */

const ledger: GateLedger = {
  case: 'gary',
  mustFind: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
  verdicts: [],
}

const card = (over: Partial<GateScorecard> = {}): GateScorecard => ({
  mustFindTotal: 5,
  found: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
  missed: [],
  recall: 1,
  precision: null,
  ...over,
})

describe('gateVerdict — must-find rule', () => {
  it('the floor is every canary, the rule the CLI and the console always applied', () => {
    expect(MUST_FIND_RECALL_FLOOR).toBe(1)
  })

  it('passes when every canary is found and the ledger carries no verdicts', () => {
    const v = gateVerdict(ledger, card())
    expect(v).toEqual({ pass: true, reasons: [], recall: 1, precision: null, margin: null })
  })

  it('fails on one miss and names the missed canary', () => {
    const v = gateVerdict(ledger, card({ found: card().found.slice(1), missed: [{ id: 'a', note: 'surrogate analyst' }], recall: 0.8 }))
    expect(v.pass).toBe(false)
    expect(v.reasons).toEqual(['recall_below_floor: 80% found, floor 100%', 'missed:a'])
  })

  it('a ledger with no canaries cannot pass', () => {
    const v = gateVerdict({ case: 'empty', mustFind: [] }, card({ mustFindTotal: 0, found: [], missed: [], recall: 1 }))
    expect(v.pass).toBe(false)
    expect(v.reasons[0]).toMatch(/^no_canaries/)
  })

  it('a ledger threshold below 1 relaxes the floor (the ledger wins over the constant)', () => {
    const relaxed: GateLedger = { ...ledger, thresholds: { minRecall: 0.8 } }
    expect(gateVerdict(relaxed, card({ found: card().found.slice(1), missed: [{ id: 'a' }], recall: 0.8 })).pass).toBe(true)
    expect(gateVerdict(relaxed, card({ found: card().found.slice(2), missed: [{ id: 'a' }, { id: 'b' }], recall: 0.6 })).pass).toBe(false)
  })
})

describe('gateVerdict — attorney verdicts', () => {
  const withVerdicts: GateLedger = {
    ...ledger,
    verdicts: [{ verdict: 'agree' }, { verdict: 'partly' }, { verdict: 'disagree' }, { verdict: 'agree' }],
  }

  it('is silent while the ledger has no verdicts, even with a null precision', () => {
    expect(gateVerdict(ledger, card({ precision: null })).pass).toBe(true)
  })

  it('passes at or above the precision floor and fails below it', () => {
    expect(VERDICT_PRECISION_FLOOR).toBe(0.7)
    expect(gateVerdict(withVerdicts, card({ precision: 0.75 })).pass).toBe(true)
    const red = gateVerdict(withVerdicts, card({ precision: 0.5 }))
    expect(red.pass).toBe(false)
    expect(red.reasons).toEqual(['precision_below_floor: 50% agree or partly, floor 70%'])
  })

  it('a ledger with verdicts but a scorecard without precision is a failure, not a pass by omission', () => {
    const v = gateVerdict(withVerdicts, card({ precision: null }))
    expect(v.pass).toBe(false)
    expect(v.reasons[0]).toMatch(/^precision_missing/)
  })

  it('the ledger threshold overrides the precision constant', () => {
    expect(gateVerdict({ ...withVerdicts, thresholds: { minPrecision: 0.5 } }, card({ precision: 0.5 })).pass).toBe(true)
  })
})

describe('gateVerdict — the Extended cost floor (plan §7)', () => {
  it('passes an EXTENDED record whose margin clears 70% and reports the margin', () => {
    expect(EXTENDED_MARGIN_FLOOR).toBe(0.7)
    const v = gateVerdict(ledger, card(), { bucket: 'EXTENDED', costCents: 2400, priceCents: 34900 })
    expect(v.pass).toBe(true)
    expect(v.margin).toBeCloseTo((34900 - 2400) / 34900, 6)
  })

  it('fails an EXTENDED record whose cost eats more than 30% of the rung price', () => {
    const v = gateVerdict(ledger, card(), { bucket: 'EXTENDED', costCents: 12000, priceCents: 34900 })
    expect(v.pass).toBe(false)
    expect(v.reasons).toEqual([`cost_margin_below_floor: EXTENDED margin 66% on 12000¢ against 34900¢, floor 70%`])
  })

  it('does not apply to other buckets or when the cost or price is unknown', () => {
    expect(gateVerdict(ledger, card(), { bucket: 'STANDARD', costCents: 20000, priceCents: 24900 }).margin).toBeNull()
    expect(gateVerdict(ledger, card(), { bucket: 'EXTENDED', costCents: null, priceCents: 34900 }).pass).toBe(true)
    expect(gateVerdict(ledger, card(), { bucket: 'EXTENDED', costCents: 20000, priceCents: null }).pass).toBe(true)
    expect(gateVerdict(ledger, card(), { bucket: 'LONG', costCents: 20000 }).pass).toBe(true)
  })

  it('reasons stack: a miss and a cost breach are both reported', () => {
    const v = gateVerdict(ledger, card({ found: card().found.slice(1), missed: [{ id: 'a' }], recall: 0.8 }), { bucket: 'EXTENDED', costCents: 20000, priceCents: 34900 })
    expect(v.reasons.map((r) => r.split(':')[0])).toEqual(['recall_below_floor', 'missed', 'cost_margin_below_floor'])
  })
})

describe('costPerBucket', () => {
  it('aggregates mean and total per bucket, with every bucket present', () => {
    const out = costPerBucket([
      { bucket: 'EXTENDED', costCents: 1000 },
      { bucket: 'EXTENDED', costCents: 3000 },
      { bucket: 'STANDARD', costCents: 500 },
      { bucket: 'SHORT', costCents: null }, // queued: bucket known, no cost yet
      { bucket: null, costCents: 999 }, // no bucket: ignored
      { bucket: 'BOGUS', costCents: 1 }, // unknown bucket: ignored
    ])
    expect(out).toEqual({
      SHORT: { n: 0, meanCents: null, totalCents: 0, unpriced: 1 },
      STANDARD: { n: 1, meanCents: 500, totalCents: 500, unpriced: 0 },
      EXTENDED: { n: 2, meanCents: 2000, totalCents: 4000, unpriced: 0 },
      LONG: { n: 0, meanCents: null, totalCents: 0, unpriced: 0 },
    })
  })

  it('rounds the mean to whole cents and handles an empty set', () => {
    expect(costPerBucket([{ bucket: 'SHORT', costCents: 1 }, { bucket: 'SHORT', costCents: 2 }]).SHORT.meanCents).toBe(2)
    expect(costPerBucket([]).EXTENDED).toEqual({ n: 0, meanCents: null, totalCents: 0, unpriced: 0 })
  })
})
