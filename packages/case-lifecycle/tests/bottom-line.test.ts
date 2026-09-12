import { describe, it, expect } from 'vitest'
import { bottomLine } from '../bottom-line'

const FORBIDDEN = [/you should file/i, /we recommend filing/i, /file a writ/i, /will win/i, /guarantee/i]

describe('the bottom line', () => {
  it('strong: a dispositive finding → talk to a lawyer promptly, with the ROI framing', () => {
    const b = bottomLine({ strong: 2, supportive: 3, background: 1, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('strong')
    expect(b.headline).toMatch(/real reason to talk to a lawyer/)
    expect(b.body.join(' ')).toMatch(/2 issues that could support a claim on its own/)
    expect(b.body.join(' ')).toMatch(/small fraction of a full writ/)
    expect(b.forLawyer).toMatch(/2 finding\(s\) rated dispositive, 3 supportive, 1 background/)
  })
  it('consult: supportive only → reasonable, not urgent on the record alone', () => {
    const b = bottomLine({ strong: 0, supportive: 2, background: 0, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('consult')
    expect(b.headline).toMatch(/Worth a consultation/)
    expect(b.body.join(' ')).toMatch(/none that would support one by itself/)
  })
  it('limited: nothing → an honest answer that is not a verdict on innocence', () => {
    const b = bottomLine({ strong: 0, supportive: 0, background: 1, subsequentWritMode: false, deadline: null })
    expect(b.tier).toBe('limited')
    expect(b.body.join(' ')).toMatch(/not a verdict on innocence/)
    expect(b.body.join(' ')).toMatch(/1 background item may still be useful/)
  })
  it('modifiers: subsequent-writ bar and an expired federal window are stated; a running clock adds urgency', () => {
    const a = bottomLine({ strong: 1, supportive: 0, background: 0, subsequentWritMode: true, deadline: { aedpaExpired: true } })
    expect(a.body.join(' ')).toMatch(/strict bar for another one/)
    expect(a.body.join(' ')).toMatch(/federal one-year window has closed/)
    expect(a.forLawyer).toMatch(/§4 subsequent-writ bar applies; AEDPA window estimated expired/)
    const b = bottomLine({ strong: 1, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 90 } })
    expect(b.body.join(' ')).toMatch(/Time matters here/)
  })
  it('never advises filing, never promises, always ends with the not-advice line', () => {
    for (const i of [
      { strong: 3, supportive: 0, background: 0, subsequentWritMode: false, deadline: null },
      { strong: 0, supportive: 1, background: 2, subsequentWritMode: true, deadline: { aedpaExpired: true } },
      { strong: 0, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 10, lachesUrgency: true } },
    ]) {
      const b = bottomLine(i)
      const text = [b.headline, ...b.body].join(' ')
      for (const re of FORBIDDEN) expect(text).not.toMatch(re)
      expect(b.body[b.body.length - 1]).toMatch(/not legal advice/)
    }
  })
})
