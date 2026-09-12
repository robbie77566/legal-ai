import { describe, it, expect } from 'vitest'
import { issueWeight, WEIGHT_LEGEND, SURENESS_LEGEND } from '../issue-weight'

/** PO, 2026-09-12: each issue says how much it could matter and how sure we are. */
describe('issueWeight', () => {
  it('maps severity to weight and tone; confidence to sureness bands', () => {
    expect(issueWeight('dispositive', 0.9)).toMatchObject({ tone: 'urgent', sureness: 'high', percent: 90, badge: 'Could stand on its own' })
    expect(issueWeight('dispositive', 0.8).sureness).toBe('high')
    expect(issueWeight('supportive', 0.6)).toMatchObject({ tone: 'review', sureness: 'medium', percent: 60, badge: 'Supports a larger claim' })
    expect(issueWeight('supportive', 0.55).sureness).toBe('medium')
    expect(issueWeight('background', 0.3)).toMatchObject({ tone: 'muted', sureness: 'low', badge: 'Background' })
    expect(issueWeight('dispositive', 0.9).line).toBe('Weight: could stand on its own · How sure we are: high (90%)')
  })
  it('an old snapshot with no confidence still gets a weight, marked not rated', () => {
    expect(issueWeight('supportive')).toMatchObject({ sureness: 'unrated', percent: null })
    expect(issueWeight('supportive', null).line).toBe('Weight: supports a larger claim · How sure we are: not rated')
    expect(issueWeight('dispositive', Number.NaN).sureness).toBe('unrated')
  })
  it('never promises an outcome', () => {
    const all = [...WEIGHT_LEGEND.map((l) => l.means), SURENESS_LEGEND, issueWeight('dispositive', 0.99).line].join(' ')
    expect(all).not.toMatch(/will win|likely to win|guarantee|you should file/i)
    expect(SURENESS_LEGEND).toMatch(/not a chance of winning/)
  })
})
