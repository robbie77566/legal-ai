import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NOT_A_LAW_FIRM, STATUTORY_WORDS, QUALITY_CHECKED, LRIS_URL } from '@hg/case-lifecycle'
import { LangProvider } from '@/lib/i18n'
import { LANDING_CONTENT } from '@/lib/content/landing'
import { TERMS_CONTENT } from '@/lib/content/terms'
import { REFUND_POLICY_CONTENT } from '@/lib/content/refund-policy'

/**
 * UPL review 2026-10-23, recommendation 1 (U1-a, U1-b): the one statement,
 * with the statutory words, from the shared constant, on every page a family
 * or a lawyer can reach — and no page, content object or email left that
 * holds the product or its staff out as legal reviewers or as attorneys.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1', token: 'tok_1' }),
  useSearchParams: () => new URLSearchParams('session_id=cs_1'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/case/case_1',
  redirect: vi.fn(),
}))
vi.mock('next-auth/react', async (orig) => ({
  ...(await orig<typeof import('next-auth/react')>()),
  useSession: () => ({ data: { user: { email: 'family@example.com', name: 'Jo' } }, status: 'authenticated', update: vi.fn() }),
  signOut: vi.fn(),
  signIn: vi.fn(),
}))
// next/font/google needs the network at build time; the layouts only need the class names.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: 'font-var', className: 'font-cls' })
  return { Source_Serif_4: font, Public_Sans: font, IBM_Plex_Mono: font, Permanent_Marker: font }
})
vi.mock('@/components/ab/PaletteExperiment', () => ({ default: () => null }))
vi.mock('@/components/counsel/ProfessionalNav', () => ({ default: () => null }))
vi.mock('@/components/counsel/CounselContext', () => ({
  CounselProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCounsel: () => ({ me: null, flags: { counsel_surfaces: true }, seat: 'ok', reload: () => {} }),
}))

const CHECKLIST = {
  status: 'AWAITING_DOCS',
  customer: { stage: 'awaiting_documents', overlay: null, subsequentWritMode: false },
  expectedReadyAt: null, slaStartedAt: null, lastZip: null,
  items: [{ id: 'a', kind: 'judgment', label: 'Judgment and sentence', state: 'NEEDED' }],
  documents: [],
  facts: { county: 'Travis', convictionYear: 2019, appeal: 'decided', custody: 'probation', trialOrPlea: 'trial', priorWrit: 'no' },
  factLines: [{ key: 'conviction', label: 'Conviction', value: 'Travis County · 2019' }],
  rerun: null,
}
const REPORT = { versionNo: 1, templateVersion: 'AB-v1', renderedAt: '2026-09-08T10:00:00Z', deadlinePosture: null, subsequentWritMode: false, strongSignals: [], possibleIssues: [], droppedByReverification: 0 }
const ME = {
  user: { name: 'Jo Whitfield', email: 'jo@example.com', pendingEmail: null, passwordChangedAt: null, memberSince: '2026-06-01T00:00:00Z' },
  reviews: [], payments: [], refunds: [], acks: [], deletionRequest: null,
}

class FakeEventSource {
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  close() {}
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body =
      u.endsWith('/checklist') ? CHECKLIST
      : u.endsWith('/pages') ? { billable: 0, duplicatesIgnored: 0, cap: 5000 }
      : u.endsWith('/inventory') ? { volumes: [], missing: [], unknownCount: 0, meteredPages: { reporter: 0, clerk: 0, exhibit: 0, unknown: 0, total: 0 } }
      : u.endsWith('/report/versions') ? []
      : u.endsWith('/report/changes') ? { fromVersion: null, toVersion: 1, added: [], removed: [], keptCount: null }
      : u.endsWith('/report') ? REPORT
      : u.endsWith('/consent') ? { grants: [] }
      : u.endsWith('/packets/clinics') ? { clinics: [] }
      : u.endsWith('/share-link/activity') ? { links: [] }
      : u.endsWith('/me') ? ME
      : u.includes('/shared/') ? { notice: 'Attorney working packet (Part B).', findings: [] }
      : u.includes('/checkout/fulfillment') ? { caseId: 'case_1', interviewNeeded: true }
      : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

const statement = async () => {
  const all = await screen.findAllByTestId('not-a-substitute')
  for (const el of all) expect(el).toHaveTextContent(NOT_A_LAW_FIRM.en)
  return all
}

describe('the statement (U1-b): one constant, the statutory words, both languages', () => {
  it('carries the statutory words in both languages and is the only source the footers and content use', () => {
    expect(NOT_A_LAW_FIRM.en).toContain(STATUTORY_WORDS.en)
    expect(NOT_A_LAW_FIRM.es).toContain(STATUTORY_WORDS.es)
    expect(NOT_A_LAW_FIRM.en).toMatch(/^Snot Nose Legal is not a law firm\./)
    expect(LANDING_CONTENT.en.footerLegal).toContain(NOT_A_LAW_FIRM.en)
    expect(LANDING_CONTENT.es.footerLegal).toContain(NOT_A_LAW_FIRM.es)
    expect(TERMS_CONTENT.en.statement).toBe(NOT_A_LAW_FIRM.en)
    expect(REFUND_POLICY_CONTENT.es.statement).toBe(NOT_A_LAW_FIRM.es)
  })

  it('<NotASubstitute /> renders the statement at body size in the current language', async () => {
    const { default: NotASubstitute } = await import('@/components/NotASubstitute')
    const { unmount } = render(<NotASubstitute />)
    expect(screen.getByTestId('not-a-substitute')).toHaveTextContent(NOT_A_LAW_FIRM.en)
    expect(screen.getByTestId('not-a-substitute').className).toContain('text-base')
    unmount()
    window.localStorage.setItem('snl_lang', 'es')
    render(<LangProvider><NotASubstitute /></LangProvider>)
    expect(await screen.findByText(NOT_A_LAW_FIRM.es)).toBeInTheDocument()
  })

  it('SiteFooter: the statement in English and, through the i18n hook, in Spanish; links to Terms and the Refund policy', async () => {
    const { default: SiteFooter } = await import('@/components/SiteFooter')
    const { unmount } = render(<LangProvider><SiteFooter /></LangProvider>)
    await statement()
    expect(screen.getByTestId('footer-terms')).toHaveAttribute('href', '/terms')
    expect(screen.getByTestId('footer-refund-policy')).toHaveAttribute('href', '/refund-policy')
    unmount()
    window.localStorage.setItem('snl_lang', 'es')
    render(<LangProvider><SiteFooter /></LangProvider>)
    expect(await screen.findByText(NOT_A_LAW_FIRM.es)).toBeInTheDocument()
  })

  it('the (daybreak) layout wraps every family page with the footer statement', async () => {
    const { default: DaybreakLayout } = await import('@/app/(daybreak)/layout')
    render(<DaybreakLayout><p>page body</p></DaybreakLayout>)
    await statement()
  })

  it('the (counsel) layout and the professional footer carry it too', async () => {
    const { default: CounselLayout } = await import('@/app/(counsel)/layout')
    const { unmount } = render(<CounselLayout><p>matters</p></CounselLayout>)
    expect(screen.getByText('matters')).toBeInTheDocument()
    await statement()
    unmount()
    const { default: ProfessionalFooter } = await import('@/components/professional/ProfessionalFooter')
    render(<ProfessionalFooter />)
    await statement()
  })

  it('every check outcome screen opens with the statement; the LRIS link is the certified service with the no-consideration line', async () => {
    const { default: EligibilityCheck } = await import('@/app/(daybreak)/check/page')
    const click = (re: RegExp) => fireEvent.click(screen.getByRole('radio', { name: re }))
    render(<EligibilityCheck />)
    click(/Texas state court/)
    click(/Felony/)
    click(/^Yes$/) // capital → outcome
    expect(screen.getByTestId('outcome-capital')).toBeInTheDocument()
    const [first] = await statement()
    // The statement precedes the outcome card in document order.
    expect(first.compareDocumentPosition(screen.getByTestId('outcome-capital')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('lris-link')).toHaveAttribute('href', LRIS_URL)
    expect(screen.getByText(/We receive nothing from any referral\./)).toBeInTheDocument()
  })

  it('the buy success page, how-it-works, the sample report, the shared-token page and both policy pages render it', async () => {
    for (const load of [
      () => import('@/app/(daybreak)/buy/success/page'),
      () => import('@/app/(daybreak)/how-it-works/page'),
      () => import('@/app/(daybreak)/sample-report/page'),
      () => import('@/app/(daybreak)/shared/[token]/page'),
      () => import('@/app/(daybreak)/terms/page'),
      () => import('@/app/(daybreak)/refund-policy/page'),
    ]) {
      const { default: Page } = await load()
      const { unmount } = render(<Page />)
      await statement()
      unmount()
    }
    const { default: Terms } = await import('@/app/(daybreak)/terms/page')
    render(<Terms />)
    expect(screen.getByTestId('policy-draft')).toHaveTextContent(/DRAFT — pending review by licensed counsel/)
  })

  it('the case pages — interview, documents, status, case home, next steps, account — carry it in the page body', async () => {
    for (const load of [
      () => import('@/app/(daybreak)/case/[caseId]/interview/page'),
      () => import('@/app/(daybreak)/case/[caseId]/documents/page'),
      () => import('@/app/(daybreak)/case/[caseId]/status/page'),
      () => import('@/app/(daybreak)/case/[caseId]/page'),
      () => import('@/app/(daybreak)/case/[caseId]/next-steps/page'),
      () => import('@/app/(daybreak)/account/page'),
    ]) {
      const { default: Page } = await load()
      const { unmount } = render(<Page />)
      await statement()
      unmount()
    }
  })

  it('the report page: the statement at the top and in the footer, the AI label, the truthful checking sentence, the certified LRIS link', async () => {
    window.localStorage.setItem('snl:report-opened:case_1', '1')
    const { default: CaseReport } = await import('@/app/(daybreak)/case/[caseId]/report/page')
    render(<CaseReport />)
    const all = await statement()
    expect(all.length).toBeGreaterThanOrEqual(2)
    const footer = screen.getByTestId('report-footer')
    expect(footer).toHaveTextContent('AI-generated content')
    expect(footer).toHaveTextContent(QUALITY_CHECKED.en)
    expect(footer).not.toHaveTextContent(/legal reviewer/i)
    expect(screen.getByTestId('lris-link')).toHaveAttribute('href', LRIS_URL)
    expect(screen.getByText(/We receive nothing from any referral\./)).toBeInTheDocument()
  })

  it('the clinic consent card carries R-7 and the next-steps LRIS link is the certified service', async () => {
    const { default: NextSteps } = await import('@/app/(daybreak)/case/[caseId]/next-steps/page')
    render(<NextSteps />)
    expect(await screen.findByTestId('clinic-r7')).toHaveTextContent(/Sharing does not by itself create an attorney-client relationship or privilege/)
    expect(screen.getByTestId('lris-link')).toHaveAttribute('href', LRIS_URL)
  })
})

/** U1-a: the grep test. Every file under these roots, both languages. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Product surfaces only: a test's own negative assertions name the banned words.
    if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name.startsWith('.')) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

describe('holding out (U1-a): no page, content object or email says a legal reviewer or a licensed Texas attorney stands behind the report', () => {
  const roots = [
    path.resolve(__dirname, '../../lib/content'),
    path.resolve(__dirname, '../../app'),
    path.resolve(__dirname, '../../../../packages/email'),
  ]
  // Holding-out forms only: a referral such as "A licensed Texas attorney is the
  // person to take this to" is the product sending the reader to a lawyer, which
  // is exactly what it should do (UPL review 2026-10-23, rec 3).
  const banned = [
    /legal reviewer/i,
    /(signed off|approved|reviewed|checked|verified|vetted) by (a |an )?(licensed )?Texas attorney/i,
    /trained reviewer/i,
    /(aprobado|revisado|firmado|verificado) por un abogado con licencia de Texas/i,
    /revisor legal/i,
  ]

  it.each(roots)('%s', (root) => {
    const offenders: string[] = []
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const re of banned) if (re.test(text)) offenders.push(`${path.relative(root, file)}: ${re}`)
    }
    expect(offenders).toEqual([])
  })

  it('the lawyer comparisons and merit phrases are gone from the family content', () => {
    const text = JSON.stringify(LANDING_CONTENT)
    for (const re of [/post-conviction lawyer asks/, /lawyer would run/, /\$3,000/, /worth pursuing/, /signed off/, /whole site switches/, /todo el sitio/, /presentar un recurso/, /califica/]) {
      expect(text).not.toMatch(re)
    }
  })
})
