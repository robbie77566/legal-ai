import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import CaseDocuments from '@/app/(daybreak)/case/[caseId]/documents/page'

/**
 * Workstream D (upload_page_ux_review.md §4f): each file shows its part of
 * the record — the filename's suggestion to confirm or change — and the
 * inventory under the file list says what is here and which volumes are
 * missing. The bucket is never shown to families.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const CHECKLIST = {
  status: 'AWAITING_DOCS',
  slaStartedAt: null,
  items: [{ id: 'it_rr', kind: 'rr_volume', label: "Reporter's record volumes", state: 'CONFIRMED' }],
  documents: [
    { id: 'doc_1', filename: 'RR Vol 3 of 7.pdf', suggestedChecklistItemId: 'it_rr', classificationConfirmed: true, quarantined: false, volumeKind: 'REPORTER', volumeLabel: 'RR vol. 3 of 7', volumeIndex: 3, volumeCount: 7, volumeConfirmed: false },
    { id: 'doc_2', filename: 'scan0001.pdf', suggestedChecklistItemId: 'it_rr', classificationConfirmed: true, quarantined: false, volumeKind: 'UNKNOWN', volumeLabel: null, volumeIndex: null, volumeCount: null, volumeConfirmed: false },
    { id: 'doc_3', filename: "Clerk's Record.pdf", suggestedChecklistItemId: null, classificationConfirmed: false, quarantined: false, volumeKind: 'CLERK', volumeLabel: "Clerk's record", volumeIndex: null, volumeCount: null, volumeConfirmed: true },
  ],
  lastZip: null,
}
const METER = { billable: 520, duplicatesIgnored: 0, cap: 5000 }
const INVENTORY = {
  volumes: [
    { kind: 'REPORTER', pages: 412, ocrConfidence: 0.97, docs: [{ id: 'doc_1' }] },
    { kind: 'CLERK', pages: 88, ocrConfidence: 1, docs: [{ id: 'doc_3' }] },
    { kind: 'EXHIBIT', pages: 20, ocrConfidence: null, docs: [] },
    { kind: 'UNKNOWN', pages: 0, ocrConfidence: null, docs: [{ id: 'doc_2' }] },
  ],
  missing: [{ kind: 'REPORTER', index: 4, count: 7, label: 'RR vol. 4 of 7' }],
  unknownCount: 1,
  meteredPages: { reporter: 412, clerk: 88, exhibit: 20, unknown: 0, total: 520 },
  bucket: 'STANDARD',
  bucketNote: null,
}

const calls: Array<{ method: string; url: string; body: unknown }> = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ method: init?.method ?? 'GET', url: u, body: init?.body ? JSON.parse(String(init.body)) : null })
      const body = u.endsWith('/checklist') ? CHECKLIST : u.endsWith('/pages') ? METER : u.endsWith('/inventory') ? INVENTORY : { ok: true }
      return { ok: true, json: async () => body } as Response
    })
  )
})

describe('documents page — volume labels and the inventory (workstream D)', () => {
  it('summarises the record by part and names the missing volume; the bucket stays off the page', async () => {
    render(<CaseDocuments />)
    const summary = await screen.findByTestId('inventory-summary')
    expect(summary).toHaveTextContent("Reporter's record 412 pages · Clerk's record 88 · Exhibits 20 · 1 file unlabelled")
    expect(screen.getByTestId('missing-volume')).toHaveTextContent(/Reporter's record vol\. 4 of 7 hasn’t arrived yet/)
    expect(screen.getByTestId('inventory')).not.toHaveTextContent(/STANDARD|bucket/i)
  })

  it('a suggested label asks "right?" and confirming it PATCHes the volume as suggested', async () => {
    render(<CaseDocuments />)
    const row = await screen.findByTestId('volume-doc_1')
    expect(row).toHaveTextContent(/Looks like RR vol\. 3 of 7 — right\?/)
    expect(within(row).getByRole('combobox')).toHaveValue('REPORTER')
    fireEvent.click(within(row).getByRole('button', { name: /Yes, that’s it/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/cases/case_1/documents/doc_1/volume'))).toBe(true))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.body).toEqual({ kind: 'REPORTER', index: 3, count: 7, confirmed: true })
  })

  it('an unlabelled file asks which part it is; choosing one and a volume number saves it', async () => {
    render(<CaseDocuments />)
    const row = await screen.findByTestId('volume-doc_2')
    expect(row).toHaveTextContent(/Which part of the record is this\?/)
    expect(within(row).getByRole('combobox')).toHaveValue('UNKNOWN')
    fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'CLERK' } })
    const edited = screen.getByTestId('volume-doc_2')
    fireEvent.change(within(edited).getByLabelText(/Volume number for scan0001.pdf/), { target: { value: '2' } })
    fireEvent.change(within(edited).getByLabelText(/Number of volumes for scan0001.pdf/), { target: { value: '3' } })
    fireEvent.click(within(screen.getByTestId('volume-doc_2')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/documents/doc_2/volume'))).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ kind: 'CLERK', index: 2, count: 3, confirmed: true })
  })

  it('a confirmed label reads as a fact with a way to change it', async () => {
    render(<CaseDocuments />)
    const row = await screen.findByTestId('volume-doc_3')
    expect(row).toHaveTextContent("Part of the record: Clerk's record")
    fireEvent.click(within(row).getByRole('button', { name: 'Change' }))
    expect(within(screen.getByTestId('volume-doc_3')).getByRole('combobox')).toHaveValue('CLERK')
  })

  it('the existing echo-back, meter and run button are untouched by the inventory', async () => {
    render(<CaseDocuments />)
    expect(await screen.findByText('520 / 5,000')).toBeInTheDocument()
    expect(screen.getByTestId('run-review')).toHaveTextContent(/includes one analysis run/)
    expect(screen.getByRole('button', { name: /My records are complete — start the review/ })).toBeInTheDocument()
  })
})
