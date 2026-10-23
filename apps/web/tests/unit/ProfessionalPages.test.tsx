import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ForCounsel from '@/app/(professional)/for-counsel/page'
import ForOffices from '@/app/(professional)/for-offices/page'
import ForInvestigators from '@/app/(professional)/for-investigators/page'
import SiteFooter from '@/components/SiteFooter'
import BrandHome from '@/components/site/BrandHome'
import { LADDER } from '@/lib/content/professional'

/**
 * F1 in vitest (the Playwright spec repeats it in a browser with axe): the
 * three professional pages render their sections in order, the ladder is the
 * adopted one ($149 / $249 / $349, never $199), the family home never links
 * to /counsel, and the professional pages never link to /review or /check.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ SessionContext: React.createContext(undefined), useSession: () => ({ data: null, status: 'unauthenticated' }) }))
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ open: false }) }) as Response))
})

const hrefs = (el: HTMLElement) => Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')

describe('/for-counsel', () => {
  it('has the nine sections of §6.2 in order', () => {
    const { container } = render(<ForCounsel />)
    const ids = Array.from(container.querySelectorAll('main > section')).map((s) => s.id)
    expect(ids).toEqual(['hero', 'packet', 'fit', 'not', 'pricing', 'trust', 'pilot', 'signup', 'faq'])
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    expect(headings.slice(0, 8)).toEqual(['The packet', 'How it fits the work', 'What it is not', 'Pricing', 'Trust', 'Public defender pilot', 'Sign up', 'Questions counsel ask'])
  })
  it('prices the adopted ladder and never $199', () => {
    const { container } = render(<ForCounsel />)
    const ladder = screen.getByTestId('ladder')
    expect(ladder).toHaveTextContent('$149')
    expect(ladder).toHaveTextContent('$249')
    expect(ladder).toHaveTextContent('$349')
    expect(container.textContent).not.toContain('$199')
    expect(container.textContent).toContain('from $499')
    expect(container.textContent).toContain('10% off')
    expect(container.textContent).toContain('First review free')
    expect(LADDER.map((r) => r.price)).toEqual([149, 249, 349])
  })
  it('shows a sample Part B page with a volume · page · line cite and the verbatim excerpt', () => {
    render(<ForCounsel />)
    const sample = screen.getByTestId('sample-part-b')
    expect(sample).toHaveTextContent('RR vol. 4 · p. 212 · l. 14–16')
    expect(sample).toHaveTextContent('Did you ever attempt to contact Ms. Alvarez? A: I did not, no.')
    expect(sample).toHaveTextContent(/fictional/)
  })
  it('sells only what ships and describes rather than argues (UPL review 2026-10-23, P8 P9, recommendation 12)', () => {
    const { container } = render(<ForCounsel />)
    const text = container.textContent ?? ''
    // Marketing that outran the product, or named the wrong signer, is gone.
    expect(text).not.toMatch(/exhaustion map/i)
    expect(text).not.toMatch(/Errors-and-omissions|E&O|being bound/i)
    expect(text).not.toMatch(/proposed until you sign/)
    expect(text).toContain('proposed until a Texas appellate lawyer signs them in our rule table')
    expect(text).not.toMatch(/found nothing on, so the brief can say so with a cite/)
    expect(text).toContain("a record of what the engine looked for and what it found on each item, for counsel's own reading of the record")
    expect(text).not.toMatch(/subsequent-application posture|§4 is on every page/)
    // The "what it is not" list carries the new item.
    expect(text).toContain('Not a substitute for the advice of an attorney, and not a decision about any filing.')
    // The sample Part B shows what the record shows at the page and what counsel would want to see — it does not argue.
    const sample = screen.getByTestId('sample-part-b').textContent ?? ''
    expect(sample).not.toMatch(/prejudice argument|before a Brady ground is pleaded|the next step/)
    expect(sample).toMatch(/The record does not show what the witness would have said/)
    expect(sample).toMatch(/Counsel would want to see/)
  })

  it('never links to the family funnel and links the sign-up page', () => {
    const { container } = render(<ForCounsel />)
    const links = hrefs(container)
    expect(links.some((h) => h === '/review' || h === '/check' || h.startsWith('/check?'))).toBe(false)
    expect(links).toContain('/for-counsel/signup')
    expect(screen.getByTestId('cta-pilot')).toHaveAttribute('href', '#pilot')
  })
  it('the pilot form posts office, county, name, email and note', () => {
    render(<ForCounsel />)
    const form = screen.getByTestId('pilot-form')
    for (const label of ['Office', 'County', 'Your name', 'Email']) expect(within(form).getByLabelText(label)).toBeRequired()
    expect(within(form).getByLabelText(/Anything we should know/)).toBeInTheDocument()
  })
})

describe('/for-offices and /for-investigators', () => {
  it('the office page carries the pilot, the three plans by quote, free seats, ACH and the security link', () => {
    const { container } = render(<ForOffices />)
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    expect(headings).toEqual(['The pilot', 'Office plans', 'Security', 'Start a pilot'])
    expect(screen.getByTestId('pilot-offer')).toHaveTextContent('15 records · 90 days · free')
    const plans = screen.getByTestId('office-plans')
    for (const p of ['Office 50', 'Office 120', 'Office 250']) expect(plans).toHaveTextContent(p)
    expect(plans.textContent?.match(/By quote/g)).toHaveLength(3)
    expect(container.textContent).toContain('Investigator and viewer seats are free')
    expect(container.textContent).toContain('ACH')
    expect(screen.getByTestId('security-link')).toHaveAttribute('href', '/for-offices/security')
    expect(container.textContent).not.toContain('$199')
    expect(hrefs(container).some((h) => h === '/review' || h === '/check')).toBe(false)
  })
  it('the investigator page: free membership, the chronology as a service, prices on request, no invented number', () => {
    const { container } = render(<ForInvestigators />)
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    expect(headings).toEqual(['Free membership', 'The chronology as a Record Desk service', 'The request form', 'Get a seat'])
    expect(screen.getByTestId('investigator-price')).toHaveTextContent('Prices on request.')
    expect(container.textContent).not.toMatch(/\$\d/)
    expect(hrefs(container).some((h) => h === '/review' || h === '/check')).toBe(false)
  })
})

describe('the two audiences never see each other\'s copy', () => {
  it('the family home never links to /counsel; the family footer carries the one "For counsel" text link', () => {
    const { container } = render(<BrandHome />)
    expect(hrefs(container).some((h) => h.startsWith('/counsel') || h.startsWith('/for-counsel'))).toBe(false)
    const { container: footer } = render(<SiteFooter />)
    const links = hrefs(footer)
    expect(links).toContain('/for-counsel')
    expect(links.filter((h) => h.startsWith('/counsel'))).toEqual([])
  })
})
