import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseDocuments from '@/app/(daybreak)/case/[caseId]/documents/page'
import { LangProvider } from '@/lib/i18n'

/**
 * The quick check (found 2026-11-01): "That's right" must save and the
 * question must not come back; a failed save says so; a finished case or a
 * suggestion pointing at a retired item never asks.
 */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useRouter: () => ({ push: vi.fn() }) }))

let status = 'AWAITING_DOCS'
let suggested = 'it_rr'
let confirmed = false
let confirmOk = true
const calls: string[] = []

const checklist = () => ({
  status,
  slaStartedAt: null,
  items: [{ id: 'it_rr', kind: 'rr_volume', label: "Reporter's record volumes", state: confirmed ? 'CONFIRMED' : 'NEEDED' }],
  documents: [{ id: 'doc_1', filename: 'rr-all.pdf', suggestedChecklistItemId: suggested, classificationConfirmed: confirmed, quarantined: false }],
  lastZip: null,
  rerun: null,
})

beforeEach(() => {
  status = 'AWAITING_DOCS'; suggested = 'it_rr'; confirmed = false; confirmOk = true; calls.length = 0
  window.localStorage.clear()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '', assign: vi.fn() } })
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    if (u.endsWith('/documents/doc_1/confirm')) {
      if (confirmOk) confirmed = true
      return { ok: confirmOk, status: confirmOk ? 200 : 500, json: async () => (confirmOk ? { ok: true } : { error: 'boom' }) } as Response
    }
    const body = u.endsWith('/checklist') ? checklist() : u.endsWith('/pages') ? { billable: 10, duplicatesIgnored: 0, cap: 5000, purchasedBlocks: 0, allowance: 5000 } : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

const renderPage = () => render(<LangProvider><CaseDocuments /></LangProvider>)

describe('document quick check', () => {
  it('"That\'s right" saves and the question does not come back', async () => {
    renderPage()
    await screen.findByTestId('echoback')
    fireEvent.click(screen.getByRole('button', { name: /That’s right|That's right/ }))
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST ') && c.endsWith('/cases/case_1/documents/doc_1/confirm'))).toBe(true))
    await waitFor(() => expect(screen.queryByTestId('echoback')).toBeNull())
    expect(screen.getAllByText(/Confirmed/).length).toBeGreaterThan(0)
  })

  it('a failed save is said, not swallowed', async () => {
    confirmOk = false
    renderPage()
    await screen.findByTestId('echoback')
    fireEvent.click(screen.getByRole('button', { name: /That’s right|That's right/ }))
    expect(await screen.findByText(/could not save that just now/)).toBeInTheDocument()
  })

  it('never asks when the suggested item no longer exists', async () => {
    suggested = 'it_retired'
    renderPage()
    await screen.findByText('rr-all.pdf')
    expect(screen.queryByTestId('echoback')).toBeNull()
  })

  it('never asks on a finished case', async () => {
    status = 'DELIVERED'
    renderPage()
    await screen.findByText('rr-all.pdf')
    expect(screen.queryByTestId('echoback')).toBeNull()
  })
})
