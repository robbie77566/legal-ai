import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangProvider } from '@/lib/i18n'
import DaybreakLanding from '@/app/(daybreak)/review/page'
import { LANDING_CONTENT } from '@/lib/content/landing'
import { GUIDE_CONTENT } from '@/lib/content/guide'
import { HOME_CONTENT } from '@/lib/content/home'
import { PRICING_CONTENT } from '@/lib/content/pricing'
import { ABOUT_CONTENT } from '@/lib/content/about'
import { SITE_FAQ_CONTENT } from '@/lib/content/site-faq'
import { CONTACT_CONTENT } from '@/lib/content/contact'
import { LEARN_CONTENT } from '@/lib/content/learn'
import { HOW_CONTENT } from '@/lib/content/how-it-works'
import { SAMPLE_REPORT_CONTENT } from '@/lib/content/sample-report'

beforeEach(() => window.localStorage.clear())

/** Recursive structural parity: every en key/shape has an es twin (R7a). */
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

describe('i18n (i18n_localization.md)', () => {
  it('dictionary parity: landing and guide content match structurally across languages', () => {
    assertParity(LANDING_CONTENT.en, LANDING_CONTENT.es, 'landing')
    assertParity(GUIDE_CONTENT.en, GUIDE_CONTENT.es, 'guide')
    assertParity(HOME_CONTENT.en, HOME_CONTENT.es, 'home')
    assertParity(PRICING_CONTENT.en, PRICING_CONTENT.es, 'pricing')
    assertParity(ABOUT_CONTENT.en, ABOUT_CONTENT.es, 'about')
    assertParity(SITE_FAQ_CONTENT.en, SITE_FAQ_CONTENT.es, 'site-faq')
    assertParity(CONTACT_CONTENT.en, CONTACT_CONTENT.es, 'contact')
    assertParity(LEARN_CONTENT.en, LEARN_CONTENT.es, 'learn')
    assertParity(HOW_CONTENT.en, HOW_CONTENT.es, 'how-it-works')
    assertParity(SAMPLE_REPORT_CONTENT.en, SAMPLE_REPORT_CONTENT.es, 'sample-report')
  })

  it('the switcher flips the landing to Spanish and persists', () => {
    render(
      <LangProvider>
        <DaybreakLanding />
      </LangProvider>
    )
    expect(screen.getByText(/Find out what’s really in the court record/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lang-switch'))
    expect(screen.getByText(/Descubra lo que realmente dice el expediente/)).toBeInTheDocument()
    expect(window.localStorage.getItem('snl_lang')).toBe('es')
  })
})
