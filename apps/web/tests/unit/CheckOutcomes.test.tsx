import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangProvider } from '@/lib/i18n'
import EligibilityCheck from '@/app/(daybreak)/check/page'
import { CHECK_OUTCOME_COPY } from '@/lib/content/check-outcomes'
import { REPORT_DEADLINE_CONTENT } from '@/lib/content/report-deadlines'
import { bottomLine, weightLegend, surenessLegend, issueWeight } from '@hg/case-lifecycle'

/**
 * UPL review 2026-10-23 (E6, F4): the check's outcomes say product fit only,
 * in both languages, and none of the review's forbidden phrases appears in
 * any tier, any weight label or any check outcome string.
 */
const FORBIDDEN = [
  /worth pursuing/i, /would likely say/i, /could justify relief/i, /winnable/i, /would be dismissed/i, /generally unavailable/i, /\bCLOSED\b/,
  /severe bar/i, /bar is high/i, /narrow exceptions/i, /Article 11\.09/, /acting promptly/i, /claims left out/i,
  /vale la pena|califica|conviene|merece/i,
]

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

const flatten = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o as object).flatMap(flatten) : [])

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ token: 'tok_test' }) })) as unknown as typeof fetch
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStorage.clear()
  window.localStorage.clear()
})

const click = (label: RegExp) => fireEvent.click(screen.getByRole('radio', { name: label }))
const renderIn = (lang: 'en' | 'es') => {
  window.localStorage.setItem('snl_lang', lang)
  return render(<LangProvider><EligibilityCheck /></LangProvider>)
}

describe('check outcomes describe product fit (UPL review 2026-10-23, E6)', () => {
  it('pending appeal: built for final convictions, come back after the appeal is decided — in English and Spanish', () => {
    for (const lang of ['en', 'es'] as const) {
      const { unmount } = renderIn(lang)
      click(/Texas state court/); click(/Felony/); click(/^No$/); click(/In prison/); click(/A trial/); click(/still being decided/)
      const out = screen.getByTestId('outcome-pending')
      expect(out).toHaveTextContent(CHECK_OUTCOME_COPY[lang].pending.body)
      expect(out).not.toHaveTextContent(/dismissed|right moment/i)
      unmount()
    }
  })

  it('discharged and misdemeanor: what the review is built for, in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      let r = renderIn(lang)
      click(/Texas state court/); click(/Felony/); click(/^No$/); click(/fully finished/)
      expect(screen.getByTestId('outcome-notfit')).toHaveTextContent(CHECK_OUTCOME_COPY[lang].notFit.discharged)
      r.unmount()
      r = renderIn(lang)
      click(/Texas state court/); click(/Misdemeanor/)
      expect(screen.getByTestId('outcome-notfit')).toHaveTextContent(CHECK_OUTCOME_COPY[lang].notFit.misdemeanor)
      expect(screen.getByTestId('outcome-notfit')).not.toHaveTextContent(/11\.09/)
      r.unmount()
    }
  })

  it('fit with a prior writ and a never-filed appeal: the rule and what the review looks for, in both languages', async () => {
    for (const lang of ['en', 'es'] as const) {
      const { unmount } = renderIn(lang)
      click(/Texas state court/); click(/Felony/); click(/^No$/); click(/In prison/); click(/A trial/); click(/no appeal/)
      click(/never filed one/); click(/^Yes$/); click(/^No$/)
      expect(await screen.findByTestId('outcome-fit')).toHaveTextContent(CHECK_OUTCOME_COPY[lang].fit.title)
      expect(screen.getByTestId('outcome-prior-writ')).toHaveTextContent(/Art(icle|ículo) 11\.07 §4/)
      expect(screen.getByTestId('outcome-prior-writ')).not.toHaveTextContent(/severe bar|bar is high|narrow exceptions/i)
      expect(screen.getByTestId('outcome-appeal-restoration')).toHaveTextContent(CHECK_OUTCOME_COPY[lang].fit.appealRestoration)
      expect(screen.getByRole('link', { name: new RegExp(lang === 'en' ? 'Continue' : 'Continuar') })).toHaveAttribute('href', '/buy')
      unmount()
    }
  })

  it('the outcome copy ships in both languages with structural parity', () => {
    assertParity(CHECK_OUTCOME_COPY.en, CHECK_OUTCOME_COPY.es, 'check-outcomes')
    assertParity(REPORT_DEADLINE_CONTENT.en, REPORT_DEADLINE_CONTENT.es, 'report-deadlines')
  })

  it('no forbidden phrase in any check outcome string, any bottom-line tier or any weight label (either language)', () => {
    const strings = [...flatten(CHECK_OUTCOME_COPY), ...flatten(REPORT_DEADLINE_CONTENT)]
    for (const lang of ['en', 'es'] as const) {
      for (const i of [
        { strong: 2, supportive: 1, background: 1, subsequentWritMode: true, deadline: { aedpaExpired: true, finalityDate: '2019-05-01', daysTolled: 0 } },
        { strong: 0, supportive: 2, background: 0, subsequentWritMode: false, deadline: { aedpaExpired: false, daysRemaining: 30, estimatedExpiryDate: '2026-11-22' } },
        { strong: 0, supportive: 0, background: 0, subsequentWritMode: false, deadline: null },
      ]) {
        const b = bottomLine(i, lang)
        strings.push(b.headline, ...b.body)
      }
      strings.push(...weightLegend(lang).flatMap((l) => [l.badge, l.means]), surenessLegend(lang), issueWeight('dispositive', 0.9, lang).line)
    }
    for (const s of strings) for (const re of FORBIDDEN) expect(s).not.toMatch(re)
    // Resume banner labels are "a fit" / "not a fit" only.
    for (const w of Object.values(CHECK_OUTCOME_COPY.en.words)) expect(w).toMatch(/^(a fit|not a fit)/)
    for (const w of Object.values(CHECK_OUTCOME_COPY.es.words)) expect(w).toMatch(/^(encaja|no encaja|todavía no encaja)/)
  })
})
