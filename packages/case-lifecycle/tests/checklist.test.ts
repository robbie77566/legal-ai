import { describe, it, expect } from 'vitest'
import { checklistTemplate, checklistReadiness, docPriority, DOC_PRIORITY } from '../checklist'

/** Document priority (PO, 2026-09-12): which papers the review depends on. */
describe('document priority', () => {
  it('every template kind has a tier and a consequence', () => {
    for (const lane of ['TRIAL', 'PLEA'] as const) {
      for (const i of checklistTemplate({ lane, subsequentWrit: true })) {
        expect(DOC_PRIORITY[i.kind], i.kind).toBeDefined()
        expect(docPriority(i.kind).without.length).toBeGreaterThan(20)
        expect(docPriority(i.kind).howTo.length).toBeGreaterThan(20)
      }
    }
  })
  it('the transcript is the trial essential and comes first; plea papers for a plea; prior-writ papers are essential', () => {
    const trial = checklistTemplate({ lane: 'TRIAL', subsequentWrit: false })
    expect(trial[0].kind).toBe('rr_volume')
    expect(trial.filter((i) => docPriority(i.kind).tier === 'essential').map((i) => i.kind)).toEqual(['rr_volume'])
    const plea = checklistTemplate({ lane: 'PLEA', subsequentWrit: false })
    expect(plea.filter((i) => docPriority(i.kind).tier === 'essential').map((i) => i.kind)).toEqual(['plea_papers'])
    const sw = checklistTemplate({ lane: 'TRIAL', subsequentWrit: true })
    // The application is essential; the State's answer and the findings may not exist (writs denied without written order).
    expect(sw.filter((i) => i.kind.startsWith('prior_writ')).map((i) => docPriority(i.kind).tier)).toEqual(['essential', 'strengthens', 'strengthens'])
  })
  it('readiness: transcripts alone are enough for a trial review (both delivered cases); paperwork alone is not', () => {
    const items = checklistTemplate({ lane: 'TRIAL', subsequentWrit: false }).map((i) => ({ ...i, state: i.kind === 'rr_volume' ? 'UPLOADED' : 'NEEDED' }))
    const r = checklistReadiness(items)
    expect(r).toMatchObject({ enough: true, essentialTotal: 1, essentialHave: 1 })
    expect(r.missing.essential).toEqual([])
    expect(r.missing.strengthens.map((m) => m.label)).toEqual(['Judgment and sentence', 'Indictment'])
    expect(r.missing.helpful.map((m) => m.kind)).toEqual(['clerks_record', 'appellate_opinion'])
    expect(r.missing.strengthens[0]).toMatchObject({ kind: 'judgment', without: expect.stringMatching(/time limits/) })

    const paperwork = items.map((i) => ({ ...i, state: i.kind === 'rr_volume' ? 'NEEDED' : 'CONFIRMED' }))
    expect(checklistReadiness(paperwork)).toMatchObject({ enough: false, essentialHave: 0, missing: { essential: [{ kind: 'rr_volume', label: "Reporter's record (trial transcript) volumes" }] } })
  })
  it('an unknown kind is treated as helpful, never as a blocker', () => {
    expect(docPriority('mystery').tier).toBe('helpful')
    expect(checklistReadiness([{ kind: 'mystery', label: 'x', state: 'NEEDED' }]).enough).toBe(true)
  })
})
