import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseDocuments from '@/app/(daybreak)/case/[caseId]/documents/page'
import { LangProvider } from '@/lib/i18n'
import { OVERAGE_CONTENT } from '@/lib/content/overage'

/**
 * K2 — the overage purchase card (persona plan §3 family tail; UX review
 * G-B4 / upload_page_ux_review F8; mvp_ui_design_spec §5.5 "page meter …
 * becomes an inline overage offer card at the cap — never a modal ambush").
 * A 402 from records-complete is rendered as the offer, never as error
 * text; the button calls the checkout helper with the block count; the
 * copy ships in English and Spanish.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const CHECKLIST = {
  status: 'AWAITING_DOCS',
  slaStartedAt: null,
  items: [{ id: 'it_rr', kind: 'rr_volume', label: "Reporter's record volumes", state: 'CONFIRMED' }],
  documents: [{ id: 'doc_1', filename: 'rr-all.pdf', suggestedChecklistItemId: 'it_rr', classificationConfirmed: true, quarantined: false }],
  lastZip: null,
}
const OVERAGE_402 = {
  error: 'OVERAGE_REQUIRED',
  pagesOver: 2600,
  blocks: 2,
  cents: 9800,
  checkout: { kind: 'overage', blocks: 2 },
  billablePages: 7600,
  allowance: 5000,
  blocksNeeded: 2,
  blockPriceCents: 4900,
}

let meter: Record<string, unknown> = { billable: 214, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
let recordsComplete: { status: number; body: unknown } = { status: 402, body: OVERAGE_402 }
const calls: Array<{ method: string; url: string; body?: unknown }> = []
const assign = vi.fn()

beforeEach(() => {
  calls.length = 0
  assign.mockClear()
  window.localStorage.clear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search: '', assign, href: 'http://localhost:3000/case/case_1/documents' },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (u.endsWith('/records-complete')) {
        return { ok: recordsComplete.status < 400, status: recordsComplete.status, json: async () => recordsComplete.body } as Response
      }
      if (u.endsWith('/checkout/session')) {
        return { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.test/cs_overage' }) } as Response
      }
      const body = u.endsWith('/checklist') ? CHECKLIST : u.endsWith('/pages') ? meter : { ok: true }
      return { ok: true, status: 200, json: async () => body } as Response
    })
  )
})

const renderPage = (lang: 'en' | 'es' = 'en') => {
  window.localStorage.setItem('snl_lang', lang)
  return render(
    <LangProvider>
      <CaseDocuments />
    </LangProvider>
  )
}

describe('documents page — overage offer card (K2)', () => {
  it('renders the 402 as the offer card with the exact block count and total, and no raw error text', async () => {
    meter = { billable: 214, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
    recordsComplete = { status: 402, body: OVERAGE_402 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /My records are complete/ }))
    const card = await screen.findByTestId('overage-card')
    expect(card).toHaveTextContent('Your record is 7,600 pages.')
    expect(card).toHaveTextContent('The review covers 5,000. Add 5,000 more pages for $98.')
    expect(card).toHaveTextContent(/2 blocks of 2,500 pages at \$49 each/)
    expect(card).toHaveTextContent(/Nothing is lost/)
    expect(card).toHaveTextContent(/wait until you add them/)
    expect(screen.getByRole('button', { name: 'Add pages — $98' })).toBeInTheDocument()
    // never the raw error
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/OVERAGE_REQUIRED/)).toBeNull()
    expect(screen.queryByText(/Page allowance exceeded/)).toBeNull()
  })

  it('the button calls the checkout helper with kind overage and the block count, then goes to Stripe', async () => {
    meter = { billable: 214, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
    recordsComplete = { status: 402, body: OVERAGE_402 }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /My records are complete/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add pages — $98' }))
    await waitFor(() => {
      const checkout = calls.find((c) => c.url.endsWith('/checkout/session'))
      expect(checkout?.method).toBe('POST')
      expect(checkout?.body).toEqual({ kind: 'overage', caseId: 'case_1', blocks: 2 })
    })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/cs_overage'))
  })

  it('the page meter itself becomes the offer card once the count crosses the allowance (one block, $49)', async () => {
    meter = { billable: 5100, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
    renderPage()
    const card = await screen.findByTestId('overage-card')
    expect(card).toHaveTextContent('Your record is 5,100 pages.')
    expect(card).toHaveTextContent('Add 2,500 more pages for $49.')
    expect(card).not.toHaveTextContent(/blocks of 2,500/) // one block needs no arithmetic line
    expect(screen.getByRole('button', { name: 'Add pages — $49' })).toBeInTheDocument()
    expect(screen.getByText('5,100 / 5,000')).toBeInTheDocument() // the mono meter still reads the truth
  })

  it('a paid block raises the allowance: 5,100 pages with one block bought shows no card', async () => {
    meter = { billable: 5100, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 1, allowance: 7500 }
    renderPage()
    await screen.findByText('5,100 / 7,500')
    expect(screen.queryByTestId('overage-card')).toBeNull()
  })

  it('renders in Spanish with the same numbers', async () => {
    meter = { billable: 214, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
    recordsComplete = { status: 402, body: OVERAGE_402 }
    renderPage('es')
    fireEvent.click(await screen.findByRole('button', { name: /My records are complete/ }))
    const card = await screen.findByTestId('overage-card')
    expect(card).toHaveTextContent('Su expediente tiene 7,600 páginas.')
    expect(card).toHaveTextContent('La revisión cubre 5,000. Agregue 5,000 páginas más por $98.')
    expect(card).toHaveTextContent(/No se pierde nada/)
    expect(screen.getByRole('button', { name: 'Agregar páginas — $98' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('back from Stripe (?overage=1) with the allowance raised: a thank-you line, no card, the run button ready', async () => {
    meter = { billable: 7600, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 2, allowance: 10000 }
    window.location.search = '?overage=1'
    renderPage()
    const paid = await screen.findByTestId('overage-paid')
    expect(paid).toHaveTextContent(/your extra pages are covered/)
    expect(screen.queryByTestId('overage-card')).toBeNull()
    expect(screen.getByRole('button', { name: /My records are complete/ })).toBeEnabled()
  })

  it('back from Stripe before the webhook lands: the card stays, with the confirming line instead of an error', async () => {
    meter = { billable: 7600, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 }
    window.location.search = '?overage=1'
    renderPage()
    const card = await screen.findByTestId('overage-card')
    expect(card).toHaveTextContent(/being confirmed/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('every string ships in both languages (parity)', () => {
    expect(Object.keys(OVERAGE_CONTENT.es).sort()).toEqual(Object.keys(OVERAGE_CONTENT.en).sort())
  })
})
