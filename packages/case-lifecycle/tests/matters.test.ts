import { describe, it, expect } from 'vitest'
import {
  MatterCreateSchema,
  MatterPatchSchema,
  matterTitle,
  matterCaseShape,
  matterFactsLocked,
  trapInputsForMatter,
  screenWeights,
  orderScreensByWeight,
  MATTER_LOCKED_AFTER_DOCS_COMPLETE,
  MATTER_EDITABLE_FIELDS,
  CASE_STATUSES,
  VEHICLES,
  computeTrapClock,
} from '../index'

/** Matter intake (persona plan §5 C): the pure half the api and web share. */
describe('matters: schema', () => {
  it('accepts the plan\'s fields, defaults the posture flags and upper-cases the initials', () => {
    const m = MatterCreateSchema.parse({ vehicle: '11.07', county: 'Harris', clientInitials: 'jd', sentenceImposedAt: '9/1/2026' })
    expect(m).toEqual({ vehicle: '11.07', county: 'Harris', clientInitials: 'JD', sentenceImposedAt: '2026-09-01', priorWrits: 0, subsequentWrit: false, capital: false })
  })

  it('refuses a client name, a fifth letter, an unknown vehicle, an unknown key and an unreadable date', () => {
    const base = { vehicle: '11.07', county: 'Harris', clientInitials: 'JD' }
    expect(MatterCreateSchema.safeParse({ ...base, clientInitials: 'John Doe' }).success).toBe(false)
    expect(MatterCreateSchema.safeParse({ ...base, clientInitials: 'ABCDE' }).success).toBe(false)
    expect(MatterCreateSchema.safeParse({ ...base, vehicle: 'mandamus' }).success).toBe(false)
    expect(MatterCreateSchema.safeParse({ ...base, clientName: 'John' }).success).toBe(false)
    expect(MatterCreateSchema.safeParse({ ...base, judgmentSignedAt: 'soon' }).success).toBe(false)
    // Blank dates mean "not given".
    expect(MatterCreateSchema.parse({ ...base, judgmentSignedAt: '' }).judgmentSignedAt).toBeUndefined()
  })

  it('the patch schema covers exactly the editable fields and lets null clear a value', () => {
    expect(Object.keys(MatterPatchSchema.shape).sort()).toEqual([...MATTER_EDITABLE_FIELDS].sort())
    expect(MatterPatchSchema.parse({ recordFiledAt: null, court: null })).toEqual({ recordFiledAt: null, court: null })
    expect(MatterPatchSchema.safeParse({ vehicle: '11.07' }).success).toBe(false)
  })
})

describe('matters: case shape', () => {
  it('titles the case with initials and the vehicle label — never a name', () => {
    expect(matterTitle('jd', 'direct_appeal')).toBe('JD — Direct appeal')
    expect(matterTitle('AB', '2254')).toBe(`AB — ${VEHICLES['2254'].label}`)
  })

  it('writes what the interview would have written; a prior writ means subsequent-writ mode', () => {
    const now = new Date('2026-10-18T12:00:00Z')
    const s = matterCaseShape({ county: 'Harris', lane: 'PLEA', priorWrits: 2, subsequentWrit: false, judgmentSignedAt: '2026-09-03', sentenceImposedAt: '2026-09-01' }, now)
    expect(s).toEqual({
      facts: { jurisdiction: 'texas', capital: 'no', county: 'Harris', convictionYear: 2026, trialOrPlea: 'plea', priorWrit: 'yes', judgmentDate: '2026-09-01', source: { interviewAt: now.toISOString() } },
      deadlineFacts: { judgmentDate: '2026-09-01' },
      convictionYear: 2026,
      lane: 'PLEA',
      subsequentWrit: true,
    })
    // Signed judgment only; no lane; nothing to lock.
    const t = matterCaseShape({ county: 'Bexar', priorWrits: 0, subsequentWrit: false, judgmentSignedAt: '2019-09-12' })
    expect(t.facts).toMatchObject({ convictionYear: 2019, judgmentDate: '2019-09-12', priorWrit: 'no' })
    expect(t.lane).toBeUndefined()
    expect(matterCaseShape({ county: 'Bexar', priorWrits: 0, subsequentWrit: false }).deadlineFacts).toBeNull()
  })

  it('locks the judgment dates once the case is past DOCS_COMPLETE (QUOTED is still before the pipeline)', () => {
    const locked = CASE_STATUSES.filter(matterFactsLocked)
    expect(locked).toEqual(['DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW', 'QA_REJECTED', 'READY', 'DELIVERED', 'REFUNDED', 'DELETED'])
    expect(MATTER_LOCKED_AFTER_DOCS_COMPLETE).toEqual(['judgmentSignedAt', 'sentenceImposedAt'])
  })

  it('feeds the TRAP clock from the matter\'s own date columns', () => {
    const inputs = trapInputsForMatter({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-09-01', noticeOfAppealFiledAt: '2026-09-20', recordFiledAt: null }, '2026-10-01')
    expect(inputs).toEqual({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-09-01', noticeOfAppealFiledAt: '2026-09-20', today: '2026-10-01' })
    const clock = computeTrapClock(inputs)
    expect(clock.steps.find((s) => s.id === 'noa')).toMatchObject({ rule: 'TRAP 26.2', due: '2026-10-01', status: 'done', late: false })
  })
})

describe('matters: screen weights', () => {
  it('ranks the vehicle\'s weighted screens from 1; no vehicle → undefined', () => {
    expect(screenWeights('pdr_clock')).toEqual({ preserved_error: 1, sentencing: 2 })
    expect(screenWeights(null)).toBeUndefined()
    expect(screenWeights(undefined)).toBeUndefined()
  })

  it('orders a lane\'s screens by weight, unweighted ones after in their original order, and never adds or drops one', () => {
    const lane = ['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification']
    expect(orderScreensByWeight(lane, undefined)).toEqual(lane)
    expect(orderScreensByWeight(lane, screenWeights('11.07'))).toEqual(['iac', 'brady', 'junk_science', 'sentencing', 'identification', 'preserved_error', 'voir_dire'])
    expect(orderScreensByWeight(lane, screenWeights('pdr_clock'))).toEqual(['preserved_error', 'sentencing', 'iac', 'brady', 'junk_science', 'voir_dire', 'identification'])
    expect(orderScreensByWeight(['plea_lane', 'sentencing'], screenWeights('11.07'))).toEqual(['sentencing', 'plea_lane'])
  })
})
