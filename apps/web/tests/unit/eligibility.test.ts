/**
 * S0 vehicle-routing tests (PRD US-0). These rules are launch-gate-reviewed
 * by counsel — every branch is pinned here so a copy/UI refactor can never
 * silently change legal routing.
 */
import { describe, it, expect } from 'vitest'
import {
  routeEligibility,
  nextQuestion,
  questionCount,
  type EligibilityAnswers,
} from '@/lib/eligibility'

const fitBase: EligibilityAnswers = {
  jurisdiction: 'texas',
  offenseLevel: 'felony',
  capital: 'no',
  custody: 'incarcerated',
  trialOrPlea: 'trial',
  appeal: 'decided',
  priorWrit: 'no',
  newEvidence: 'no',
}

describe('S0 routing — hard exits', () => {
  it('non-Texas convictions are not a fit, immediately', () => {
    expect(routeEligibility({ jurisdiction: 'federal' })?.outcome).toBe('not_fit_other')
    expect(routeEligibility({ jurisdiction: 'other_state' })?.outcome).toBe('not_fit_other')
    expect(nextQuestion({ jurisdiction: 'federal' })).toBeNull()
  })

  it('misdemeanors route to the 11.09 resource path', () => {
    const r = routeEligibility({ jurisdiction: 'texas', offenseLevel: 'misdemeanor' })
    expect(r?.outcome).toBe('misdemeanor')
    expect(r?.canPurchase).toBe(false)
  })

  it('capital cases are a RED LINE — excluded regardless of every other answer', () => {
    const r = routeEligibility({ ...fitBase, capital: 'yes' })
    expect(r?.outcome).toBe('capital')
    expect(r?.canPurchase).toBe(false)
    expect(r?.vehicle).toBeNull()
  })

  it('a fully discharged sentence is an honest not-a-fit', () => {
    expect(routeEligibility({ ...fitBase, custody: 'discharged' })?.outcome).toBe('discharged')
  })

  it('a pending direct appeal means come back at mandate — never a sale now', () => {
    const r = routeEligibility({ ...fitBase, appeal: 'pending' })
    expect(r?.outcome).toBe('pending_appeal')
    expect(r?.canPurchase).toBe(false)
  })
})

describe('S0 routing — fit paths and vehicles', () => {
  it('trial conviction, appeal decided → fit_trial on 11.07', () => {
    const r = routeEligibility(fitBase)
    expect(r).toEqual(
      expect.objectContaining({ outcome: 'fit_trial', vehicle: '11.07', lane: 'trial', canPurchase: true })
    )
  })

  it('plea conviction → fit_plea (reduced screen set, FR-5a)', () => {
    expect(routeEligibility({ ...fitBase, trialOrPlea: 'plea' })?.outcome).toBe('fit_plea')
  })

  it('probation routes to Art. 11.072, not 11.07', () => {
    const r = routeEligibility({ ...fitBase, custody: 'probation' })
    expect(r?.vehicle).toBe('11.072')
    expect(r?.canPurchase).toBe(true)
  })

  it('a prior writ switches to subsequent-writ mode: proceeds WITH the §4 warning', () => {
    const r = routeEligibility({ ...fitBase, priorWrit: 'yes' })
    expect(r?.outcome).toBe('prior_writ_warned')
    expect(r?.canPurchase).toBe(true)
    expect(r?.vehicle).toBe('11.07')
  })

  it('"there was no appeal" is a branch, not a dead end (FR-11)', () => {
    const answers: EligibilityAnswers = { ...fitBase, appeal: 'none' }
    expect(nextQuestion(answers)).toBe('noAppealReason')
    const r = routeEligibility({ ...answers, noAppealReason: 'never_filed_requested' })
    expect(r?.outcome).toBe('fit_trial')
    expect(r?.appealRestorationEmphasis).toBe(true)
  })

  it('the new-evidence flag is carried, never dropped (FR-10)', () => {
    expect(routeEligibility({ ...fitBase, newEvidence: 'yes' })?.newEvidenceFlag).toBe(true)
  })
})

describe('S0 routing — wizard flow mechanics', () => {
  it('asks questions in order and reports null mid-wizard', () => {
    expect(nextQuestion({})).toBe('jurisdiction')
    expect(routeEligibility({ jurisdiction: 'texas' })).toBeNull()
    expect(nextQuestion({ jurisdiction: 'texas' })).toBe('offenseLevel')
  })

  it('skips the no-appeal follow-up when an appeal was decided', () => {
    const a: EligibilityAnswers = { ...fitBase }
    delete a.priorWrit
    expect(nextQuestion(a)).toBe('priorWrit')
    expect(questionCount(fitBase)).toBe(8)
    expect(questionCount({ ...fitBase, appeal: 'none' })).toBe(9)
  })
})
