import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Staff console, professional era (staff_console.md §12, workstream G, G5):
 * the nav per role, the bar-verification queue, the Money page's per-rung
 * tiles and invoices, the Today page's Professional group, the cases page's
 * organisation column and the QA page's three widened fields.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/ops', useParams: () => ({ id: 'org_1' }) }))
const session = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: session.role, email: 'robbie@snotnoselegal.com' } }, status: 'authenticated' }), signOut: vi.fn() }))

import OpsLayout from '@/app/ops/layout'
import VerificationsPage from '@/app/ops/verifications/page'
import MoneyPage from '@/app/ops/money/page'
import OpsOverview from '@/app/ops/page'
import CasesPage from '@/app/ops/cases/page'
import RecordDeskPage from '@/app/ops/record-desk/page'
import QaConsole from '@/app/qa/page'

const VERIFICATIONS = {
  verifications: [
    { id: 'u_a', name: 'Ana Reyes', email: 'ana@writpartners.example', barNumber: '24011111', barState: 'TX', practiceType: 'writ', signedUpAt: '2026-10-12T15:00:00Z', organisation: { id: 'org_1', name: 'Writ Partners', kind: 'FIRM', isTest: false }, seat: 'OWNER' },
    { id: 'u_b', name: null, email: 'b@pd.example', barNumber: '24022222', barState: 'TX', practiceType: 'pd', signedUpAt: '2026-10-13T15:00:00Z', organisation: null, seat: null },
  ],
}
const SUMMARY = {
  stripe: 'test', period: { days: 30, from: '2026-09-19T00:00:00Z' }, testMode: { included: false, hiddenCount: 0 },
  totals: { sold: 3, freeCount: 0, collectedCents: 89700, refundedCents: 0, netCents: 89700, refundRate: 0, refundCount: 0, partialCount: 0, costUsd: 30, costPerCaseUsd: 10, marginPct: 0.9, needsDecision: 0 },
  weeks: [],
  byRung: { COUNSEL_SHORT: { count: 2, cents: 29800, refundedCents: 0 }, COUNSEL_STANDARD: { count: 1, cents: 24900, refundedCents: 0 }, COUNSEL_EXTENDED: { count: 0, cents: 0, refundedCents: 0 }, COUNSEL_LONG: { count: 0, cents: 0, refundedCents: 0 }, PACK_STANDARD: { count: 1, cents: 112050, refundedCents: 0 } },
  disputes: [], requests: [], recentRefunds: [], reconciliation: null,
}
const INVOICES = [
  { id: 'inv_1', number: 'INV-2026-0001', status: 'DRAFT', totalCents: 24900, lines: [{ caseId: 'c_pd', causeNumber: '1577001', sku: 'COUNSEL_STANDARD', cents: 24900 }], paidAt: null, paidBy: null, achReference: null, createdAt: '2026-10-10T10:00:00Z', organisation: { id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false } },
  { id: 'inv_2', number: 'INV-2026-0002', status: 'PAID', totalCents: 49800, lines: [], paidAt: '2026-10-11T10:00:00Z', paidBy: 'u_admin', achReference: 'ACH-77', createdAt: '2026-10-10T10:00:00Z', organisation: { id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false } },
]
const CREDITS = { issued: 5, consumed: 1, expired: 0, live: 4, rows: [] }
const STATUS = {
  email: { configured: true, from: 'x@y' }, stripe: 'test', autoApprove: true, malwareScan: true, sentry: true, posthog: false,
  pipeline: { awaitingDocs: 0, digitizing: 0, analyzing: 0, held: 0, ready: 0 }, retentionCandidates: 0,
  professional: {
    verificationsPending: 2, quoteRequestsOpen: 1, pilotRecordsThisWeek: 3,
    allowancesNearZero: [{ organisationId: 'org_2', organisation: 'County PD', kind: 'PD_OFFICE', granted: 15, remaining: 1 }],
    investigationsPastSla: [{ id: 'inv_req', organisationId: 'org_2', organisation: 'County PD', kind: 'CHRONOLOGY', status: 'OPEN', businessDaysOpen: 11 }],
  },
}
const QUEUE = [
  { id: 'c_pd', title: 'AB — 11.07', label: 'Harris County · 2021', ref: '0000PD', customerName: 'PD Owner', customerEmail: 'owner@pd.example', status: 'DIGITIZING', lane: 'TRIAL', daysInStage: 2, stalled: false, ocrHalt: false, delayOurs: false, subsequentWrit: false, updatedAt: '2026-10-12T10:00:00Z', organisation: { id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false }, matter: { vehicle: '11.07', causeNumber: '1577001' } },
  { id: 'c_fam', title: 'Case review', label: 'Travis County · 2020', ref: '0000FA', customerName: 'Maria Delgado', customerEmail: 'maria@example.com', status: 'AWAITING_DOCS', lane: 'TRIAL', daysInStage: 9, stalled: true, ocrHalt: false, delayOurs: false, subsequentWrit: false, updatedAt: '2026-10-01T10:00:00Z', organisation: null, matter: null },
]
const INVESTIGATIONS = {
  requests: [
    { id: 'inv_req', kind: 'CHRONOLOGY', status: 'OPEN', pages: 300, dueBy: null, note: 'Chronology of the suppression hearing', staffNote: null, assignedTo: null, deliveredAt: null, createdAt: '2026-10-02T10:00:00Z', caseId: 'c_pd', caseLabel: 'Harris County · 2021', businessDaysOpen: 11, pastSla: true, organisation: { id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false }, requester: { id: 'u_o', name: 'PD Owner', email: 'owner@pd.example' }, assignee: null },
  ],
}
const STAFF = { staff: [{ id: 'u_admin', name: 'Robbie', email: 'robbie@snotnoselegal.com', role: 'ADMIN' }, { id: 'u_sup', name: 'Dana', email: 'dana@snotnoselegal.com', role: 'SUPPORT' }] }
const QA_QUEUE = [{ id: 'c1', title: 'Harris County · 2019', lane: 'TRIAL', subsequentWrit: false, findingCount: 1, updatedAt: '' }]
const QA_DETAIL = {
  case: { id: 'c1', title: 'Harris County · 2019', lane: 'TRIAL', status: 'QA_REVIEW', subsequentWrit: false },
  run: { id: 'r1' },
  findings: [{ id: 'f1', category: 'preserved_error', severity: 'supportive', confidence: 0.8, adjudication: 'not_run', provenance: 'ai', partAText: 'Plain words.', partBText: 'Counsel text.', preserved: 'yes', harmStandard: 'nonconstitutional', vehicle: 'direct_appeal', develop: 'Pull the charge conference', dependsOn: [], citations: [{ volume: 'RR3', page: 12, excerpt: 'quoted', excerptHash: 'a'.repeat(64) }] }],
}

const calls: Array<{ method: string; url: string; body?: unknown }> = []
beforeEach(() => {
  calls.length = 0
  session.role = 'ADMIN'
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const path = u.replace(/^https?:\/\/[^/]+/, '')
    calls.push({ method: init?.method ?? 'GET', url: path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const body = path.startsWith('/ops/verifications/') ? { ok: true, userId: path.split('/')[3], emailed: true }
      : path.startsWith('/ops/verifications') ? VERIFICATIONS
      : path.startsWith('/ops/payments/summary') ? SUMMARY
      : path.startsWith('/ops/payments') ? { total: 0, rows: [] }
      : path.startsWith('/ops/costs') ? { weeks: 12, from: '', totalUsd: 0, cases: 0, perCaseUsd: null, rows: [] }
      : path.includes('/mark-paid') ? { ...INVOICES[0], status: 'PAID', achReference: 'ACH-99' }
      : path.startsWith('/ops/invoices') ? INVOICES
      : path.startsWith('/ops/credits') ? CREDITS
      : path.startsWith('/ops/organisations') ? { organisations: [{ id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false }] }
      : path.startsWith('/ops/status') ? STATUS
      : path.startsWith('/ops/queue') ? QUEUE
      : path.startsWith('/ops/requests') ? { open: [], decided: [] }
      : path.startsWith('/ops/investigations/') ? { request: INVESTIGATIONS.requests[0] }
      : path.startsWith('/ops/investigations') ? INVESTIGATIONS
      : path.startsWith('/ops/staff') ? STAFF
      : path.startsWith('/qa/holds') ? []
      : path.startsWith('/qa/queue') ? QA_QUEUE
      : path.startsWith('/qa/findings/') ? { ...QA_DETAIL.findings[0], provenance: 'ai_human_edited' }
      : path.startsWith('/qa/cases/') ? QA_DETAIL
      : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('nav per role (G5)', () => {
  it('ADMIN sees the four professional doors beside the existing ones', () => {
    render(<OpsLayout><div>child</div></OpsLayout>)
    const nav = screen.getByTestId('ops-nav')
    for (const label of ['Organisations', 'Verifications', 'Quotes', 'Record Desk', 'Money', 'Flags']) expect(nav).toHaveTextContent(label)
    expect(screen.getByRole('link', { name: 'Verifications' })).toHaveAttribute('href', '/ops/verifications')
    expect(screen.getByRole('link', { name: 'Record Desk' })).toHaveAttribute('href', '/ops/record-desk')
    expect(screen.getByRole('link', { name: 'Organisations' })).toHaveAttribute('href', '/ops/organisations')
    expect(screen.getByRole('link', { name: 'Quotes' })).toHaveAttribute('href', '/ops/quotes')
  })
  it('SUPPORT sees the read-only professional pages and the Record Desk, still no Money', () => {
    session.role = 'SUPPORT'
    render(<OpsLayout><div>child</div></OpsLayout>)
    const nav = screen.getByTestId('ops-nav')
    for (const label of ['Organisations', 'Verifications', 'Quotes', 'Record Desk', 'Cases']) expect(nav).toHaveTextContent(label)
    for (const label of ['Money', 'Promos', 'Flags', 'Team']) expect(nav).not.toHaveTextContent(label)
  })
})

describe('bar verification queue (G5)', () => {
  it('renders the queue, says verification is a human act, and Verify calls the verify helper', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<VerificationsPage />)
    const table = await screen.findByTestId('verifications-table')
    await waitFor(() => expect(table).toHaveTextContent('Ana Reyes'))
    expect(table).toHaveTextContent('24011111')
    expect(screen.getByRole('link', { name: 'Writ Partners' })).toHaveAttribute('href', '/ops/organisations/org_1')
    expect(screen.getByTestId('verification-policy')).toHaveTextContent(/human act/)
    expect(screen.getByTestId('verification-policy')).toHaveTextContent(/nothing on this page calls the State Bar/i)
    fireEvent.click(screen.getByTestId('verify-u_a'))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/ops/verifications/u_a/verify')).toBeTruthy())
    expect(await screen.findByTestId('notice')).toHaveTextContent(/verified — emailed/)
  })
  it('Could not verify needs a note and posts it to the reject helper', async () => {
    render(<VerificationsPage />)
    await screen.findByText('Ana Reyes')
    fireEvent.click(screen.getByTestId('reject-u_b'))
    const confirm = screen.getByTestId('reject-confirm-u_b')
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason it could not be verified'), { target: { value: 'Directory lists a different name' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/ops/verifications/u_b/reject')?.body).toEqual({ note: 'Directory lists a different name' }))
  })
  it('SUPPORT reads the queue without the buttons', async () => {
    session.role = 'SUPPORT'
    render(<VerificationsPage />)
    await screen.findByText('Ana Reyes')
    expect(screen.queryByTestId('verify-u_a')).toBeNull()
    expect(screen.queryByTestId('reject-u_a')).toBeNull()
  })
})

describe('Money: per-rung tiles, invoices and credits (G5)', () => {
  it('renders a tile per counsel rung from byRung, packs when sold, and keeps the family tiles', async () => {
    render(<MoneyPage />)
    expect(await screen.findByTestId('tile-counsel-short')).toHaveTextContent('$298.00')
    expect(screen.getByTestId('tile-counsel-short')).toHaveTextContent('2 sold')
    expect(screen.getByTestId('tile-counsel-standard')).toHaveTextContent('$249.00')
    expect(screen.getByTestId('tile-counsel-extended')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('tile-counsel-long')).toHaveTextContent('0 sold')
    expect(screen.getByTestId('tile-pack-standard')).toHaveTextContent('$1,120.50')
    expect(screen.getByTestId('tile-collected')).toHaveTextContent('$897.00')
    expect(screen.getByTestId('tile-refund-rate')).toBeInTheDocument()
  })
  it('lists invoices with status and lines, and marks one paid with an ACH reference', async () => {
    render(<MoneyPage />)
    const table = await screen.findByTestId('invoices-table')
    await waitFor(() => expect(table).toHaveTextContent('INV-2026-0001'))
    expect(table).toHaveTextContent(/DRAFT/)
    expect(table).toHaveTextContent(/1577001 · standard · \$249\.00/)
    expect(table).toHaveTextContent(/ACH-77/)
    fireEvent.click(screen.getByTestId('mark-paid-inv_1'))
    const confirm = screen.getByTestId('mark-paid-confirm-inv_1')
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('ACH reference'), { target: { value: 'ACH-99' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/ops/invoices/inv_1/mark-paid')?.body).toEqual({ achReference: 'ACH-99' }))
    expect(await screen.findByTestId('notice')).toHaveTextContent(/marked paid/)
  })
  it('drafts an invoice from the selected counsel cases of one organisation', async () => {
    render(<MoneyPage />)
    await screen.findByTestId('invoices-table')
    await waitFor(() => expect(screen.getByLabelText('Organisation to invoice')).toHaveTextContent('County PD'))
    fireEvent.change(screen.getByLabelText('Organisation to invoice'), { target: { value: 'org_2' } })
    const draft = screen.getByTestId('invoice-draft')
    await waitFor(() => expect(draft).toHaveTextContent('1577001'))
    fireEvent.click(within(draft).getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('invoice-create'))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/ops/invoices')?.body).toEqual({ organisationId: 'org_2', caseIds: ['c_pd'] }))
  })
  it('shows the credits panel from /ops/credits', async () => {
    render(<MoneyPage />)
    expect(await screen.findByTestId('tile-credits-live')).toHaveTextContent('4')
    expect(screen.getByTestId('tile-credits-consumed')).toHaveTextContent('1')
  })
})

describe('Today: the Professional group (G5)', () => {
  it('shows the five numbers, each linking to its page', async () => {
    render(<OpsOverview />)
    const group = await screen.findByTestId('professional')
    expect(screen.getByTestId('pro-verifications-pending')).toHaveTextContent('2')
    expect(screen.getByTestId('pro-verifications-pending')).toHaveAttribute('href', '/ops/verifications')
    expect(screen.getByTestId('pro-quote-requests-open')).toHaveTextContent('1')
    expect(screen.getByTestId('pro-quote-requests-open')).toHaveAttribute('href', '/ops/quotes')
    expect(screen.getByTestId('pro-pilot-records-this-week')).toHaveTextContent('3')
    expect(screen.getByTestId('pro-allowances-near-zero')).toHaveTextContent(/County PD · 1 left/)
    expect(screen.getByTestId('pro-record-desk-past-sla')).toHaveTextContent(/County PD · 11d/)
    expect(screen.getByTestId('pro-record-desk-past-sla')).toHaveAttribute('href', '/ops/record-desk')
    expect(group).toHaveTextContent('Professional')
  })
})

describe('Cases: organisation and vehicle columns (G5)', () => {
  it('shows the organisation and vehicle per case and filters by organisation kind', async () => {
    render(<CasesPage />)
    const table = await screen.findByTestId('cases-table')
    await waitFor(() => expect(table).toHaveTextContent('County PD'))
    expect(screen.getByTestId('org-c_pd')).toHaveTextContent(/County PD.*PD office/)
    expect(screen.getByTestId('vehicle-c_pd')).toHaveTextContent(/11\.07.*1577001/)
    expect(screen.getByTestId('org-c_fam')).toHaveTextContent('Family')
    expect(screen.getByTestId('vehicle-c_fam')).toHaveTextContent('—')
    fireEvent.change(screen.getByTestId('kind-filter'), { target: { value: 'PD_OFFICE' } })
    expect(table).not.toHaveTextContent('Maria Delgado')
    expect(table).toHaveTextContent('County PD')
    fireEvent.change(screen.getByTestId('kind-filter'), { target: { value: 'FAMILY' } })
    expect(table).toHaveTextContent('Maria Delgado')
    expect(table).not.toHaveTextContent('County PD')
  })
})

describe('Record Desk queue (G5)', () => {
  it('renders the request with its SLA badge, the reviewer picker from /ops/staff, and PATCHes a status change', async () => {
    render(<RecordDeskPage />)
    const table = await screen.findByTestId('record-desk-table')
    await waitFor(() => expect(table).toHaveTextContent('County PD'))
    expect(screen.getByTestId('sla-inv_req')).toHaveTextContent(/PAST SLA · 11d/)
    await waitFor(() => expect(screen.getByTestId('reviewer-inv_req')).toHaveTextContent('Dana'))
    fireEvent.change(screen.getByTestId('reviewer-inv_req'), { target: { value: 'u_sup' } })
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.url === '/ops/investigations/inv_req')?.body).toEqual({ assignedTo: 'u_sup' }))
    fireEvent.change(screen.getByTestId('status-inv_req'), { target: { value: 'IN_PROGRESS' } })
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ status: 'IN_PROGRESS' }))
  })
  it('SUPPORT only sees the unblocking statuses in the picker', async () => {
    session.role = 'SUPPORT'
    render(<RecordDeskPage />)
    await screen.findByTestId('status-inv_req')
    const options = Array.from(screen.getByTestId('status-inv_req').querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['OPEN', 'IN_PROGRESS', 'DELIVERED'])
    expect(options).not.toContain('DECLINED')
  })
})

describe('QA: the three widened fields (G5)', () => {
  it('edit shows Part B, the harm standard and develop beside Part A, and the save sends only what changed', async () => {
    render(<QaConsole />)
    fireEvent.click(await screen.findByText('Harris County · 2019'))
    fireEvent.click(await screen.findByTestId('edit-f1'))
    const form = screen.getByTestId('edit-form-f1')
    expect(within(form).getByLabelText('Part A text')).toHaveValue('Plain words.')
    expect(within(form).getByLabelText('Part B text')).toHaveValue('Counsel text.')
    expect(within(form).getByLabelText('Harm standard')).toHaveValue('nonconstitutional')
    expect(within(form).getByLabelText('Develop')).toHaveValue('Pull the charge conference')
    fireEvent.change(within(form).getByLabelText('Part B text'), { target: { value: 'Counsel text, corrected.' } })
    fireEvent.change(within(form).getByLabelText('Harm standard'), { target: { value: 'structural' } })
    fireEvent.change(within(form).getByLabelText('Develop'), { target: { value: 'Affidavit from trial counsel' } })
    fireEvent.click(screen.getByTestId('save-edit-f1'))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.url === '/qa/findings/f1')?.body).toEqual({ partBText: 'Counsel text, corrected.', harmStandard: 'structural', develop: 'Affidavit from trial counsel' }))
  })
})
