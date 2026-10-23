import { describe, it, expect } from 'vitest'
import { bottomLine, federalWindowEndDate, BOTTOM_LINE_COPY, NOT_ADVICE } from '../bottom-line'

const FORBIDDEN = [/you should file/i, /we recommend filing/i, /file a writ/i, /will win/i, /guarantee/i]
const CLOSING = 'A licensed Texas attorney is the person to take this to.'

/** UPL review 2026-10-23 (E1): every tier describes what was found; the next step is the same sentence every time. */
describe('the bottom line', () => {
  it('strong: counts the issues that stand on their own and the ones that add to a bigger picture', () => {
    const b = bottomLine({ strong: 2, supportive: 3, background: 1, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('strong')
    expect(b.headline).toBe('The review found issues that stand on their own in this record.')
    expect(b.body.join(' ')).toMatch(/2 issues that stand on their own in the record, and 3 more that add to a bigger picture/)
    expect(b.body.join(' ')).toMatch(/Also listed, as context for a lawyer: 1 background item\./)
    expect(b.forLawyer).toMatch(/2 finding\(s\) rated dispositive, 3 supportive, 1 background/)
  })
  it('consult: counts the issues that matter together and says none stands on its own', () => {
    const b = bottomLine({ strong: 0, supportive: 2, background: 0, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('consult')
    expect(b.headline).toMatch(/add to a bigger picture, and none that stand on their own/)
    expect(b.body.join(' ')).toMatch(/2 issues that matter together with other issues, and none that stand on their own/)
    expect(b.body.join(' ')).not.toMatch(/Also listed/)
  })
  it('limited: says what was checked and what the record shows, not a verdict on innocence', () => {
    const b = bottomLine({ strong: 0, supportive: 0, background: 1, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('limited')
    expect(b.headline).toMatch(/did not find issues in this record on the questions it checks/)
    expect(b.body.join(' ')).toMatch(/not a verdict on innocence/)
    expect(b.body.join(' ')).toMatch(/Also listed, as context for a lawyer: 1 background item\./)
  })
  it('the §4 line states the rule; the federal-window lines give the date by our count', () => {
    const a = bottomLine({ strong: 1, supportive: 0, background: 0, subsequentWritMode: true, deadline: { aedpaExpired: true, finalityDate: '2020-01-10', daysTolled: 10 } })
    expect(a.body).toContain('A writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4.')
    expect(a.body).toContain('Based on the dates you gave, the one-year federal window ended on 2021-01-19 by our count. A lawyer must check these dates.')
    expect(a.forLawyer).toMatch(/prior application reported \(Art\. 11\.07 §4\); AEDPA window estimated expired/)
    const b = bottomLine({ strong: 1, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 90, estimatedExpiryDate: '2027-01-21' } })
    expect(b.body).toContain('Based on the dates you gave, the one-year federal window is open until 2027-01-21 by our count. A lawyer must check these dates.')
    const c = bottomLine({ strong: 0, supportive: 1, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 200, tollingNow: true } })
    expect(c.body).toContain('By our count, the one-year federal window is paused while the state court decides. A lawyer must check these dates.')
    const d = bottomLine({ strong: 0, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: true } })
    expect(d.body).toContain('Based on the dates you gave, the one-year federal window has ended by our count. A lawyer must check these dates.')
    expect(d.body.join(' ')).not.toMatch(/time matters|sooner rather than later|urgent/i)
  })
  it('federalWindowEndDate: open windows carry the estimate; closed ones are counted from finality plus paused days', () => {
    expect(federalWindowEndDate({ expired: false, estimatedExpiryDate: '2027-03-01' })).toBe('2027-03-01')
    expect(federalWindowEndDate({ expired: false, tollingNow: true, estimatedExpiryDate: null })).toBeNull()
    expect(federalWindowEndDate({ expired: true, finalityDate: '2020-01-10', daysTolled: 0 })).toBe('2021-01-09')
    expect(federalWindowEndDate({ expired: true })).toBeNull()
  })
  it('opens with the not-advice line, never advises or promises, and always closes on the same next step', () => {
    for (const i of [
      { strong: 3, supportive: 0, background: 0, subsequentWritMode: false, deadline: null },
      { strong: 0, supportive: 1, background: 2, subsequentWritMode: true, deadline: { aedpaExpired: true } },
      { strong: 0, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 10, lachesUrgency: true } },
    ]) {
      for (const lang of ['en', 'es'] as const) {
        const b = bottomLine(i, lang)
        const text = [b.headline, ...b.body].join(' ')
        for (const re of FORBIDDEN) expect(text).not.toMatch(re)
        expect(b.body[0]).toBe(BOTTOM_LINE_COPY[lang].notAdvice)
        expect(b.body[b.body.length - 1]).toBe(BOTTOM_LINE_COPY[lang].closing)
      }
      expect(bottomLine(i).body[0]).toBe(NOT_ADVICE)
      expect(bottomLine(i).body[bottomLine(i).body.length - 1]).toBe(CLOSING)
    }
  })
  it('Spanish says "fits", never "qualifies" or "worth filing" (F4)', () => {
    const es = JSON.stringify(BOTTOM_LINE_COPY.es)
    expect(es).not.toMatch(/califica|vale la pena|conviene|merece/i)
  })
})
