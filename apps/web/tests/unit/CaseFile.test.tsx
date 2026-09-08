import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseFilePage from '@/app/ops/cases/[caseId]/page'

/** Support's case file: uploads (with download), the analysis as the family
 *  reads it (Part A first, Part B folded), and the released report PDF. */

vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'c_1' }), usePathname: () => '/ops/cases/c_1' }))
const session = vi.hoisted(() => ({ role: 'SUPPORT' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: session.role } }, status: 'authenticated' }) }))

const FILE = {
  case: { id: 'c_1', title: 'Whitfield — Travis County record', status: 'READY', lane: 'TRIAL', subsequentWrit: false, ocrHalt: false, delayOurs: true, expectedReadyAt: '2026-09-10T00:00:00Z', createdAt: '2026-08-27T19:52:00Z', customerEmail: 'j@x.com', customerName: 'J. Whitfield' },
  meter: { billable: 412, duplicatesIgnored: 18 },
  documents: [
    { id: 'd_1', filename: 'RR_Vol1_VoirDire.pdf', receivedAt: '2026-08-27T19:52:00Z', pages: 142, billablePages: 142, ocrProvider: 'pdf-text', minOcrConfidence: 1, recognized: true, classificationConfirmed: true, quarantined: false, downloadable: true },
    { id: 'd_2', filename: 'invoice_copy.pdf', receivedAt: '2026-08-28T08:11:00Z', pages: 0, billablePages: 0, ocrProvider: null, minOcrConfidence: null, recognized: false, classificationConfirmed: false, quarantined: true, downloadable: false },
  ],
  runs: [{
    id: 'r_1', runNo: 1, startedAt: '2026-08-30T11:27:00Z', completedAt: '2026-08-30T13:00:00Z', screensDone: ['brady', 'iac'],
    findings: [{ id: 'f_1', category: 'brady', severity: 'dispositive', confidence: 0.82, adjudication: 'agree', provenance: 'ai', partAText: 'A lab report the defense never received.', partBText: 'Brady/Bagley materiality analysis.', citations: [{ volume: 'RR2', page: 116, line: null, excerpt: 'withheld pending the DPS supplemental report' }] }],
  }],
  reports: [{ id: 'rep_1', versionNo: 1, templateVersion: 'AB-v1', renderedAt: '2026-09-05T10:00:00Z', approvedByEmail: 'marcus@snotnoselegal.com', findingsCount: 1 }],
  shareLinks: [],
  notes: [{ id: 'n_1', channel: 'phone', body: 'Family asked for an update.', authorEmail: 'dana@snotnoselegal.com', createdAt: '2026-09-06T14:02:00Z' }],
  requests: { open: [{ id: 'q_0', type: 'CASE_DELETE', reason: 'customer_request', note: 'Family asked us to remove everything.', amountCents: null, requestedByEmail: 'dana@snotnoselegal.com', decision: null, decidedByEmail: null, decisionNote: null, createdAt: '2026-09-07T09:00:00Z', decidedAt: null }], decided: [{ id: 'q_1', type: 'REFUND', reason: 'unreadable_record', note: null, amountCents: null, requestedByEmail: 'dana@snotnoselegal.com', decision: 'DECLINED', decidedByEmail: 'robbie@snotnoselegal.com', decisionNote: 'Ask the clerk first.', createdAt: '2026-09-05T10:00:00Z', decidedAt: '2026-09-05T12:00:00Z' }] },
}
const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    const body = u.endsWith('/file') ? FILE
      : u.endsWith('/timeline') ? [{ id: 'e1', type: 'report.rendered', actor: 'marcus', createdAt: '2026-09-05T10:00:00Z' }]
      : u.endsWith('/download') ? { url: 'https://s3.example/signed', filename: 'RR_Vol1_VoirDire.pdf' }
      : u.endsWith('/contact') ? { id: 'n_2' }
      : u.endsWith('/requests') ? { id: 'q_2' }
      : u.endsWith('/decide') ? { ok: true, decision: 'APPROVED' }
      : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('case file', () => {
  it('shows uploads with page counts, the quarantined file without a download, and the family-facing analysis', async () => {
    render(<CaseFilePage />)
    expect(await screen.findByTestId('case-title')).toHaveTextContent('Whitfield — Travis County record')
    expect(screen.getByTestId('case-meta')).toHaveTextContent('j@x.com (J. Whitfield)')
    const files = screen.getByTestId('files')
    expect(files).toHaveTextContent(/412 billable pages/)
    expect(files).toHaveTextContent(/RR_Vol1_VoirDire\.pdf/)
    expect(files).toHaveTextContent(/QUARANTINED/)
    expect(files).toHaveTextContent(/not downloadable/)
    expect(screen.queryByTestId('download-d_2')).toBeNull()

    const analysis = screen.getByTestId('analysis')
    expect(analysis).toHaveTextContent(/evidence the State may not have turned over/) // screen in plain language
    expect(screen.getByTestId('part-a')).toHaveTextContent('A lab report the defense never received.')
    expect(analysis).toHaveTextContent(/STRONG SIGNAL/)
    expect(analysis).toHaveTextContent(/RR2 p\. 116/)
    expect(analysis).toHaveTextContent(/For the lawyer \(Part B\)/)

    const deliverables = screen.getByTestId('deliverables')
    expect(deliverables).toHaveTextContent(/Report v1 — current/)
    expect(deliverables).toHaveTextContent(/approved by marcus@snotnoselegal.com/)
    expect(screen.getByTestId('report-pdf-1')).toHaveAttribute('href', 'http://localhost:3001/ops/cases/c_1/report/pdf?version=1')
    expect(screen.getByTestId('timeline')).toHaveTextContent(/report rendered/)
  })

  it('download asks the staff route for a signed link; Support sees no Refund door', async () => {
    render(<CaseFilePage />)
    fireEvent.click(await screen.findByTestId('download-d_1'))
    await waitFor(() => expect(calls).toContain('GET http://localhost:3001/ops/cases/c_1/documents/d_1/download'))
    expect(screen.queryByRole('link', { name: /Refund/ })).toBeNull()
  })

  it('contact log: shows past notes with the decision history, and posts a new note', async () => {
    render(<CaseFilePage />)
    const log = await screen.findByTestId('contact-log')
    expect(log).toHaveTextContent(/Family asked for an update\./)
    expect(log).toHaveTextContent(/PHONE/)
    expect(screen.getByTestId('requests')).toHaveTextContent(/WAITING ON AN ADMIN.*Case deletion/)
    expect(screen.getByTestId('requests')).toHaveTextContent(/DECLINED.*Refund.*Ask the clerk first\./)
    expect(screen.queryByTestId('approve-q_0')).toBeNull() // Support never decides
    fireEvent.change(screen.getByLabelText('Contact channel'), { target: { value: 'email' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Sent the clerk instructions.' } })
    fireEvent.click(screen.getByTestId('add-note'))
    await waitFor(() => expect(calls).toContain('POST http://localhost:3001/ops/cases/c_1/contact'))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/Note added/)
  })

  it('Support asks an admin: the request form posts type, reason, and note', async () => {
    render(<CaseFilePage />)
    fireEvent.click(await screen.findByTestId('request-refund'))
    const form = screen.getByTestId('request-form')
    expect(form).toHaveTextContent(/Refunds need an Admin/)
    expect(screen.getByTestId('request-send')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Request reason'), { target: { value: 'unreadable_record' } })
    fireEvent.change(screen.getByLabelText('Request note'), { target: { value: '3 of 9 scans unusable' } })
    fireEvent.click(screen.getByTestId('request-send'))
    await waitFor(() => expect(calls).toContain('POST http://localhost:3001/ops/cases/c_1/requests'))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/Refund request sent/)
  })

  it('an Admin on the same page gets the Refund door', async () => {
    session.role = 'ADMIN'
    render(<CaseFilePage />)
    await screen.findByTestId('case-title')
    expect(screen.getByRole('link', { name: /Refund/ })).toHaveAttribute('href', '/ops/money?case=c_1')
    expect(screen.queryByTestId('request-refund')).toBeNull()
    // …and decides the pending support request right on the case file.
    const reqs = screen.getByTestId('requests')
    expect(reqs).toHaveTextContent(/NEEDS YOUR DECISION.*Case deletion/)
    vi.stubGlobal('confirm', vi.fn(() => true))
    fireEvent.click(screen.getByTestId('approve-q_0'))
    await waitFor(() => expect(calls).toContain('POST http://localhost:3001/ops/requests/q_0/decide'))
    session.role = 'SUPPORT'
  })
})
