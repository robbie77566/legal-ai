import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseDocuments from '@/app/(daybreak)/case/[caseId]/documents/page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const CHECKLIST = {
  status: 'AWAITING_DOCS',
  slaStartedAt: null,
  items: [
    { id: 'it_rr', kind: 'rr_volume', label: "Reporter's record volumes", state: 'UPLOADED' },
    { id: 'it_j', kind: 'judgment', label: 'Judgment and sentence', state: 'NEEDED' },
  ],
  documents: [
    { id: 'doc_1', filename: 'vol3.pdf', suggestedChecklistItemId: 'it_rr', classificationConfirmed: false, quarantined: false },
    { id: 'doc_2', filename: 'weird.pdf', suggestedChecklistItemId: null, classificationConfirmed: false, quarantined: true },
  ],
}
const METER = { billable: 214, duplicatesIgnored: 12, cap: 5000 }

const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push(`${init?.method ?? 'GET'} ${u}`)
      const body = u.endsWith('/checklist') ? CHECKLIST : u.endsWith('/pages') ? METER : { ok: true }
      return { ok: true, json: async () => body } as Response
    })
  )
})

describe('documents page — echo-back, meter, quarantine (UI spec §5.5)', () => {
  it('renders the echo-back card with the suggested label and posts confirm', async () => {
    render(<CaseDocuments />)
    const card = await screen.findByTestId('echoback')
    expect(card).toHaveTextContent(/looks\s+like/)
    expect(card).toHaveTextContent("Reporter's record volumes")

    fireEvent.click(screen.getByRole('button', { name: /That’s right|That's right/ }))
    await waitFor(() =>
      expect(calls.some((c) => c === 'POST http://localhost:3001/cases/case_1/documents/doc_1/confirm')).toBe(true)
    )
  })

  it('correction opens the item picker and posts the chosen item', async () => {
    render(<CaseDocuments />)
    await screen.findByTestId('echoback')
    fireEvent.click(screen.getByRole('button', { name: /No, let me fix it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Judgment and sentence' }))
    await waitFor(() =>
      expect(calls.some((c) => c === 'POST http://localhost:3001/cases/case_1/documents/doc_1/correct')).toBe(true)
    )
  })

  it('shows the page meter with the duplicates trust note', async () => {
    render(<CaseDocuments />)
    expect(await screen.findByText('214 / 5,000')).toBeInTheDocument()
    expect(screen.getByText(/we still read every page you send/)).toBeInTheDocument()
  })

  it('a quarantined file gets the honest safety notice, scoped to the file', async () => {
    render(<CaseDocuments />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('weird.pdf')
    expect(alert).toHaveTextContent(/not your case/)
  })
})
