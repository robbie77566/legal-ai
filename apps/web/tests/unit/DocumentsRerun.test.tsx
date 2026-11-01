import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseDocuments from '@/app/(daybreak)/case/[caseId]/documents/page'
import { LangProvider } from '@/lib/i18n'
import { RERUN_CONTENT } from '@/lib/content/rerun'

/**
 * US-6 re-run from the documents page (found 2026-11-01): on a finished
 * case the page offered "start the review", which answered 409 — there was
 * no way to pay for the re-run here. Now the page shows the re-run card,
 * the button opens checkout, a failure says so, and a cancelled checkout
 * lands back here with a notice. Mid-pipeline the page says the review is
 * running instead.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const checklist = (status: string) => ({
  status,
  slaStartedAt: null,
  items: [{ id: 'it_rr', kind: 'rr_volume', label: "Reporter's record volumes", state: 'CONFIRMED' }],
  documents: [{ id: 'doc_1', filename: 'rr-all.pdf', suggestedChecklistItemId: 'it_rr', classificationConfirmed: true, quarantined: false }],
  lastZip: null,
  rerun: null,
})
let status = 'DELIVERED'
let checkout: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: { url: 'https://checkout.stripe.test/cs_rerun' } }
let search = ''
const calls: Array<{ method: string; url: string; body?: unknown }> = []
const assign = vi.fn()

beforeEach(() => {
  calls.length = 0
  assign.mockClear()
  status = 'DELIVERED'
  search = ''
  checkout = { ok: true, status: 200, body: { url: 'https://checkout.stripe.test/cs_rerun' } }
  window.localStorage.clear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    get: () => ({ search, assign, href: 'http://localhost:3000/case/case_1/documents' }),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (u.endsWith('/checkout/session')) return { ok: checkout.ok, status: checkout.status, json: async () => checkout.body } as Response
      if (u.endsWith('/records-complete')) return { ok: false, status: 409, json: async () => ({ error: 'Records are already marked complete' }) } as Response
      const body = u.endsWith('/checklist') ? checklist(status) : u.endsWith('/pages') ? { billable: 214, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 } : { ok: true }
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

describe('re-run from the documents page', () => {
  it('a finished case shows the re-run card and never the records-complete button', async () => {
    renderPage()
    const card = await screen.findByTestId('rerun-card')
    expect(card).toHaveTextContent(RERUN_CONTENT.en.title)
    expect(screen.getByTestId('rerun-buy')).toHaveTextContent('$99')
    expect(screen.queryByRole('button', { name: /My records are complete|start the re-run|everything I could get/ })).toBeNull()
    expect(screen.getByTestId('rerun-open-report')).toHaveAttribute('href', '/case/case_1/report')
  })

  it('the button opens checkout for a re-run of this case', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('rerun-buy'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/cs_rerun'))
    const call = calls.find((c) => c.url.endsWith('/checkout/session'))
    expect(call).toMatchObject({ method: 'POST', body: { kind: 'rerun', caseId: 'case_1' } })
    expect(calls.some((c) => c.url.endsWith('/records-complete'))).toBe(false)
  })

  it('a failed checkout call says so and charges nothing', async () => {
    checkout = { ok: false, status: 503, body: { error: 'Payments are not configured' } }
    renderPage()
    fireEvent.click(await screen.findByTestId('rerun-buy'))
    expect(await screen.findByTestId('rerun-failed')).toHaveTextContent(RERUN_CONTENT.en.failed)
    expect(assign).not.toHaveBeenCalled()
  })

  it('coming back from a cancelled checkout shows the notice', async () => {
    search = '?canceled=1'
    renderPage()
    expect(await screen.findByTestId('rerun-canceled')).toHaveTextContent(RERUN_CONTENT.en.canceled)
  })

  it('mid-pipeline the page says the review is running', async () => {
    status = 'ANALYZING'
    renderPage()
    expect(await screen.findByTestId('rerun-running')).toHaveTextContent(RERUN_CONTENT.en.running)
    expect(screen.queryByTestId('rerun-card')).toBeNull()
  })

  it('speaks Spanish', async () => {
    renderPage('es')
    expect(await screen.findByTestId('rerun-card')).toHaveTextContent(RERUN_CONTENT.es.title)
    expect(screen.getByTestId('rerun-buy')).toHaveTextContent('$99')
  })
})
