import { describe, it, expect } from 'vitest'
import { bottomLine, BOTTOM_LINE_COPY } from '../bottom-line'
import { issueWeight, WEIGHT_COPY, weightLegend, surenessLegend } from '../issue-weight'

/**
 * UPL review 2026-10-23 (E1): family copy describes what was found and what
 * the rule says. None of these phrases — merit opinions, predictions,
 * deadline verdicts, dissuasion — may appear in any tier of the bottom line
 * or in any weight label, in either language. The check-outcome strings are
 * covered by the web unit test of the same name (they live in apps/web).
 */
export const FORBIDDEN_PHRASES = [
  /worth pursuing/i,
  /would likely say/i,
  /could justify relief/i,
  /winnable/i,
  /would be dismissed/i,
  /generally unavailable/i,
  /\bCLOSED\b/,
  /real reason to talk/i,
  /worth a consultation/i,
  /worth putting in front/i,
  /reasonable but not urgent/i,
  /did not find a path/i,
  /saves you from paying/i,
  /raises the standard/i,
  /claims left out/i,
  /acting promptly/i,
  /time matters/i,
  /sooner rather than later/i,
  /you should/i,
  /we recommend/i,
  /will win|likely to win|good chance|strong chance/i,
  /most winnable/i,
  /vale la pena|califica|conviene|merece/i,
]

/** Structural parity: every en key and shape has an es twin (i18n_localization.md R7a). */
function assertParity(en: unknown, es: unknown, path = ''): void {
  expect(typeof es, path).toBe(typeof en)
  if (Array.isArray(en)) {
    expect(Array.isArray(es), path).toBe(true)
    expect((es as unknown[]).length, `${path}.length`).toBe(en.length)
    en.forEach((item, i) => assertParity(item, (es as unknown[])[i], `${path}[${i}]`))
  } else if (en && typeof en === 'object') {
    const ek = Object.keys(en as object).sort()
    const sk = Object.keys(es as object).sort()
    expect(sk, path).toEqual(ek)
    for (const k of ek) assertParity((en as Record<string, unknown>)[k], (es as Record<string, unknown>)[k], `${path}.${k}`)
  }
}

const INPUTS = [
  { strong: 2, supportive: 3, background: 1, subsequentWritMode: false, deadline: null },
  { strong: 1, supportive: 0, background: 0, subsequentWritMode: true, deadline: { aedpaExpired: true, finalityDate: '2019-05-01', daysTolled: 40 } },
  { strong: 0, supportive: 2, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 30, estimatedExpiryDate: '2026-11-22' } },
  { strong: 0, supportive: 1, background: 2, subsequentWritMode: true, deadline: { aedpaExpired: false, daysRemaining: 200, tollingNow: true } },
  { strong: 0, supportive: 0, background: 1, subsequentWritMode: false, deadline: { aedpaExpired: true } },
  { strong: 0, supportive: 0, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 10, lachesUrgency: true } },
]

describe('describe, do not conclude (UPL review 2026-10-23, E1)', () => {
  it('no forbidden phrase appears in any bottom-line tier, in either language', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const i of INPUTS) {
        const b = bottomLine(i, lang)
        const text = [b.headline, ...b.body].join(' ')
        for (const re of FORBIDDEN_PHRASES) expect(text, `${lang} ${JSON.stringify(i)}`).not.toMatch(re)
      }
    }
  })
  it('no forbidden phrase appears in any weight label, legend line or weight line', () => {
    for (const lang of ['en', 'es'] as const) {
      const strings = [
        ...weightLegend(lang).flatMap((l) => [l.badge, l.means]),
        surenessLegend(lang),
        ...['dispositive', 'supportive', 'background'].map((s) => issueWeight(s, 0.7, lang).line),
      ]
      for (const s of strings) for (const re of FORBIDDEN_PHRASES) expect(s, lang).not.toMatch(re)
    }
  })
  it('every tier ends on the same next step and is phrased as a description', () => {
    for (const lang of ['en', 'es'] as const) {
      const closings = new Set(INPUTS.map((i) => bottomLine(i, lang).body.at(-1)))
      expect(closings.size).toBe(1)
      expect([...closings][0]).toBe(BOTTOM_LINE_COPY[lang].closing)
    }
  })
  it('the bottom-line and weight copy ship in both languages with structural parity', () => {
    assertParity(BOTTOM_LINE_COPY.en, BOTTOM_LINE_COPY.es, 'bottom-line')
    assertParity(WEIGHT_COPY.en, WEIGHT_COPY.es, 'weight')
  })
})
