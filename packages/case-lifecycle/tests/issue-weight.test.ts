import { describe, it, expect } from 'vitest'
import { issueWeight, WEIGHT_LEGEND, SURENESS_LEGEND, WEIGHT_COPY, weightLegend, surenessLegend } from '../issue-weight'

/** PO, 2026-09-12: each issue says what kind it is and how sure we are. UPL review 2026-10-23 (E1): the words describe the record. */
describe('issueWeight', () => {
  it('maps severity to weight and tone; confidence to sureness bands', () => {
    expect(issueWeight('dispositive', 0.9)).toMatchObject({ tone: 'urgent', sureness: 'high', percent: 90, badge: 'Stands on its own' })
    expect(issueWeight('dispositive', 0.8).sureness).toBe('high')
    expect(issueWeight('supportive', 0.6)).toMatchObject({ tone: 'review', sureness: 'medium', percent: 60, badge: 'Adds to a bigger picture' })
    expect(issueWeight('supportive', 0.55).sureness).toBe('medium')
    expect(issueWeight('background', 0.3)).toMatchObject({ tone: 'muted', sureness: 'low', badge: 'Background' })
    expect(issueWeight('dispositive', 0.9).line).toBe('Weight: stands on its own · How sure we are: high (90%)')
  })
  it('an old snapshot with no confidence still gets a weight, marked not rated', () => {
    expect(issueWeight('supportive')).toMatchObject({ sureness: 'unrated', percent: null })
    expect(issueWeight('supportive', null).line).toBe('Weight: adds to a bigger picture · How sure we are: not rated')
    expect(issueWeight('dispositive', Number.NaN).sureness).toBe('unrated')
  })
  it('the legend describes the record: "the record alone shows this issue", "matters together with other issues"', () => {
    expect(WEIGHT_LEGEND.find((l) => l.tone === 'urgent')?.means).toMatch(/^The record alone shows this issue/)
    expect(WEIGHT_LEGEND.find((l) => l.tone === 'review')?.means).toBe('This matters together with other issues.')
    expect(weightLegend('en')).toBe(WEIGHT_LEGEND)
    expect(surenessLegend('en')).toBe(SURENESS_LEGEND)
  })
  it('never promises an outcome, never weighs a claim', () => {
    for (const lang of ['en', 'es'] as const) {
      const all = [...weightLegend(lang).map((l) => `${l.badge} ${l.means}`), surenessLegend(lang), issueWeight('dispositive', 0.99, lang).line].join(' ')
      expect(all).not.toMatch(/will win|likely to win|guarantee|you should file|justify relief|carry a filing|unlikely/i)
    }
    expect(SURENESS_LEGEND).toMatch(/not a chance of winning/)
    expect(WEIGHT_COPY.es.sureness).toMatch(/No es una probabilidad de ganar/)
  })
  it('Spanish line and legend', () => {
    expect(issueWeight('supportive', 0.6, 'es').line).toBe('Peso: suma a un cuadro más amplio · Qué tan seguros estamos: media (60%)')
    expect(issueWeight('background', null, 'es').line).toBe('Peso: contexto · Qué tan seguros estamos: sin calificar')
  })
})
