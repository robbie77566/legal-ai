import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangProvider } from '@/lib/i18n'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'
import { REPORT_DEADLINE_CONTENT } from '@/lib/content/report-deadlines'

/**
 * UPL review 2026-10-23 (E5): the report page's "Time limits" section prints
 * the dates given and what was counted from them, the verify sentence first
 * at body size, and the rule — in both languages. No "CLOSED", no bold day
 * count, no "acting promptly"; the §4 paragraph and the first-writ line state
 * the rule and the same next step.
 */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_dl' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const POSTURE = {
  finalityDate: '2019-05-01',
  finalityBasis: 'Judgment + 30-day notice-of-appeal window (TRAP 26.2(a)(1)).',
  aedpa: { daysElapsed: 2700, daysTolled: 40, daysRemaining: 0, expired: true, estimatedExpiryDate: null as string | null, tollingNow: false },
  lachesUrgency: true,
  asOf: '2026-10-23',
}
let report: Record<string, unknown>
const REPORT = (posture: typeof POSTURE | null, subsequentWritMode = true) => ({
  summaryGap: null, rerunPriceCents: 9900, bottomLine: null, caseSummary: [], versionNo: 1, templateVersion: 'AB-v2', renderedAt: '2026-10-23T10:00:00Z',
  deadlinePosture: posture, subsequentWritMode, strongSignals: [], possibleIssues: [], droppedByReverification: 0,
})

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/report/versions') ? [] : u.endsWith('/report/changes') ? { fromVersion: null, toVersion: null, added: [], removed: [], keptCount: null } : report
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

const open = async (lang: 'en' | 'es') => {
  window.localStorage.setItem('snl_lang', lang)
  const r = render(<LangProvider><CaseReport /></LangProvider>)
  const gate = await screen.findByRole('button', { name: lang === 'en' ? /Read it now/ : /Read it now/ }).catch(() => null)
  if (gate) fireEvent.click(gate)
  await screen.findByTestId('in-short')
  return r
}

describe('report page — Time limits as description (E5)', () => {
  it('closed window: ended-on date by our count, verify sentence first, basis, laches rule — English', async () => {
    report = REPORT(POSTURE)
    await open('en')
    const section = screen.getByTestId('deadline-section')
    expect(section).toHaveTextContent('Time limits (as of 2026-10-23)')
    expect(screen.getByTestId('deadline-verify')).toHaveTextContent(REPORT_DEADLINE_CONTENT.en.verify)
    expect(screen.getByTestId('deadline-count')).toHaveTextContent('By our count from the dates you gave, the one-year federal window ended on 2020-06-09.')
    expect(screen.getByTestId('deadline-basis')).toHaveTextContent(/became final \(2019-05-01 — Judgment \+ 30-day.*about 2700 countable days have passed\. 40 of the days since then were paused/)
    expect(screen.getByTestId('deadline-laches')).toHaveTextContent('Texas courts may consider delay (the rule is called laches); a lawyer can tell you whether it applies.')
    // The verify sentence precedes the count, at body size (text-sm, not text-xs italic).
    expect(screen.getByTestId('deadline-verify').compareDocumentPosition(screen.getByTestId('deadline-count')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('deadline-verify').className).not.toMatch(/text-xs|italic/)
    expect(section).not.toHaveTextContent(/CLOSED|acting promptly|appears? to have closed|exceptions exist/)
    expect(section.querySelector('strong')).toBeNull()
    expect(screen.getByTestId('subsequent-writ-rule')).toHaveTextContent(REPORT_DEADLINE_CONTENT.en.subsequentWrit)
    expect(screen.getByTestId('first-writ-rule')).toHaveTextContent(REPORT_DEADLINE_CONTENT.en.firstWrit)
    expect(screen.getByTestId('in-short')).toHaveTextContent(REPORT_DEADLINE_CONTENT.en.inShortNone)
  })

  it('open window: "is open until about DATE" — Spanish, with the rule lines in Spanish', async () => {
    report = REPORT({ ...POSTURE, aedpa: { daysElapsed: 100, daysTolled: 0, daysRemaining: 265, expired: false, estimatedExpiryDate: '2027-07-15', tollingNow: false }, lachesUrgency: false })
    await open('es')
    expect(screen.getByTestId('deadline-section')).toHaveTextContent('Plazos (al 2026-10-23)')
    expect(screen.getByTestId('deadline-verify')).toHaveTextContent(REPORT_DEADLINE_CONTENT.es.verify)
    expect(screen.getByTestId('deadline-count')).toHaveTextContent('Por nuestro conteo a partir de las fechas que usted dio, el plazo federal de un año está abierto hasta alrededor del 2027-07-15.')
    expect(screen.queryByTestId('deadline-laches')).toBeNull()
    expect(screen.getByTestId('deadline-section')).not.toHaveTextContent(/265/)
    expect(screen.getByTestId('subsequent-writ-rule')).toHaveTextContent(REPORT_DEADLINE_CONTENT.es.subsequentWrit)
    expect(screen.getByTestId('first-writ-rule')).toHaveTextContent(REPORT_DEADLINE_CONTENT.es.firstWrit)
    expect(screen.getByTestId('in-short')).toHaveTextContent(REPORT_DEADLINE_CONTENT.es.inShortNone)
  })

  it('paused window: "is paused while the state court decides"; no section when there is no posture', async () => {
    report = REPORT({ ...POSTURE, aedpa: { daysElapsed: 100, daysTolled: 30, daysRemaining: 265, expired: false, estimatedExpiryDate: null, tollingNow: true }, lachesUrgency: false }, false)
    const r = await open('en')
    expect(screen.getByTestId('deadline-count')).toHaveTextContent(REPORT_DEADLINE_CONTENT.en.paused)
    expect(screen.queryByTestId('subsequent-writ-rule')).toBeNull()
    r.unmount()
    report = REPORT(null, false)
    await open('en')
    expect(screen.queryByTestId('deadline-section')).toBeNull()
  })
})
