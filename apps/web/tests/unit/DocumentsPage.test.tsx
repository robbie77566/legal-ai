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
  lastZip: null,
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

describe('bulk ZIP + run-anyway consent (bulk_zip_upload.md)', () => {
  it('renders ONE upload zone taking files and ZIPs, with the plain-words ZIP explainer', async () => {
    render(<CaseDocuments />)
    const card = await screen.findByTestId('zip-card')
    expect(card).toHaveTextContent(/one file that holds many files/)
    expect(card).toHaveTextContent(/Compressed \(zipped\) folder/) // Windows
    expect(card).toHaveTextContent(/Files by Google/) // Android
    expect(card).toHaveTextContent(/Not sure what a paper is\? Add it anyway/) // shoebox folded in
    expect(screen.getByRole('button', { name: /Add files/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Upload a ZIP file/ })).toBeNull() // no competing entry points
  })

  it('answers "how close am I?" with the found-count progress header', async () => {
    render(<CaseDocuments />)
    const progress = await screen.findByTestId('doc-progress')
    expect(progress).toHaveTextContent('Documents found: 1 of 2') // rr UPLOADED, judgment NEEDED
  })

  it('state chips distinguish received items; upload link only on still-needed items', async () => {
    render(<CaseDocuments />)
    expect(await screen.findByText('✓ Received')).toBeInTheDocument()
    expect(screen.getByText('Needed')).toBeInTheDocument()
    // one NEEDED item → exactly one per-item upload link
    expect(screen.getAllByRole('button', { name: /Upload this document/ })).toHaveLength(1)
  })

  it('shows the unpack summary with skipped-file honesty when lastZip is present', async () => {
    CHECKLIST.lastZip = {
      accepted: 7, skippedUnsupported: 2, skippedTooLarge: 0, skippedJunk: 3, failed: 1,
      at: new Date().toISOString(),
    } as never
    render(<CaseDocuments />)
    const summary = await screen.findByTestId('zip-summary')
    expect(summary).toHaveTextContent('7 documents added')
    expect(summary).toHaveTextContent(/2 files skipped/)
    expect(summary).toHaveTextContent(/never cost you anything/)
    CHECKLIST.lastZip = null
  })

  it('still-needed nudge names the missing items and suggests the single-file path for ≤2 gaps', async () => {
    render(<CaseDocuments />)
    const nudge = await screen.findByTestId('still-needed')
    expect(nudge).toHaveTextContent('Judgment and sentence')
    expect(nudge).toHaveTextContent(/upload each one on its own/)
  })

  it('an incomplete checklist gates the review behind the informed $99 consent, then posts records-complete', async () => {
    render(<CaseDocuments />)
    fireEvent.click(await screen.findByRole('button', { name: /everything I could get/ }))
    const modal = screen.getByTestId('run-anyway-confirm')
    expect(modal).toHaveTextContent(/includes one full analysis/)
    expect(modal).toHaveTextContent(/costs \$99/)
    expect(calls.some((c) => c.includes('/records-complete'))).toBe(false) // nothing ran yet
    fireEvent.click(screen.getByRole('button', { name: /run my review now/i }))
    await waitFor(() =>
      expect(calls.some((c) => c === 'POST http://localhost:3001/cases/case_1/records-complete')).toBe(true)
    )
  })

  it('backing out of the consent runs nothing', async () => {
    render(<CaseDocuments />)
    fireEvent.click(await screen.findByRole('button', { name: /everything I could get/ }))
    fireEvent.click(screen.getByRole('button', { name: /keep collecting/i }))
    expect(screen.queryByTestId('run-anyway-confirm')).toBeNull()
    expect(calls.some((c) => c.includes('/records-complete'))).toBe(false)
  })

  it('a fully satisfied checklist keeps the direct records-complete button — no consent detour', async () => {
    const done = { ...CHECKLIST, items: CHECKLIST.items.map((i) => ({ ...i, state: 'CONFIRMED' })) }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url)
        const body = u.endsWith('/checklist') ? done : u.endsWith('/pages') ? METER : { ok: true }
        return { ok: true, json: async () => body } as Response
      })
    )
    render(<CaseDocuments />)
    expect(await screen.findByRole('button', { name: /My records are complete/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /everything I could get/ })).toBeNull()
  })
})
