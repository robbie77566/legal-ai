import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { DARK } from '@/lib/flags'
import { lawyerGateMessage, LAWYER_GATE_COPY, BAR_STATUS_LABEL, type CounselMe } from '@/lib/counsel'

/**
 * U4 — the lawyer gate on the web (UPL review 2026-10-23, recommendations 4
 * and 9): the /counsel home banner and the hidden "Open a matter" for every
 * seat the api refuses; the matter page's stripped view; the Record Desk
 * chronology table; the staff pages — the non-lawyer practice hint on the
 * verification queue, the clinic verification block, the chronology editor
 * and the process-note label on the Record Desk, the bar number on the Team
 * page. Pure rendering over mocked fetches.
 */
const ctx = vi.hoisted(() => ({ value: { me: null as unknown, flags: {} as Record<string, boolean>, seat: 'ok', reload: () => {} } }))
// The session object is referentially stable, as next-auth's is: the Team page keys an effect on it.
const session = vi.hoisted(() => {
  const value = { data: { user: { role: 'ADMIN', email: 'robbie@snotnoselegal.com', id: 'u_admin', tenantId: 't_staff' } }, status: 'authenticated', update: () => Promise.resolve(null) }
  return { value, get role() { return value.data.user.role }, set role(r: string) { value.data.user.role = r } }
})
vi.mock('@/components/counsel/CounselContext', () => ({ useCounsel: () => ctx.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/counsel', useParams: () => ({ caseId: 'case_1', id: 'org_1' }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signOut: vi.fn(), signIn: vi.fn() }))

import CounselHome from '@/app/(counsel)/counsel/page'
import MatterPage from '@/app/(counsel)/counsel/matters/[caseId]/page'
import CounselRecordDesk from '@/app/(counsel)/counsel/record-desk/page'
import VerificationsPage from '@/app/ops/verifications/page'
import OrganisationPage from '@/app/ops/organisations/[id]/page'
import OpsRecordDesk from '@/app/ops/record-desk/page'
import TeamPage from '@/app/ops/team/page'

const me = (over: Omit<Partial<CounselMe>, 'user'> & { user?: Partial<CounselMe['user']> }): CounselMe => ({
  user: { id: 'u1', email: 'a@b.c', name: 'Ana', barNumber: '24011111', barState: 'TX', practiceType: 'writ', barVerified: false, barVerifiedAt: null, barVerificationStatus: 'PENDING', ...(over.user ?? {}) },
  organisation: { id: 'org_1', kind: 'FIRM', name: 'Lopez Law', pilot: false, pilotEndsAt: null, allowanceRecords: 0, allowanceResetsAt: null },
  membership: over.membership ?? { role: 'OWNER' },
  lawyerSeat: over.lawyerSeat ?? false,
  ...(over.lawyerSeatReason ? { lawyerSeatReason: over.lawyerSeatReason } : {}),
})

const CHRONOLOGY = { entries: [{ date: '2019-03-04', volume: 'CR', page: '12', event: 'Indictment filed; two counts.' }, { date: '2019-11-18', volume: 'RR3', page: 214, event: 'Motion to suppress heard; objection overruled.' }], note: 'Built from RR vols. 1-5.' }
const REQUEST = { id: 'inv_1', caseId: null, kind: 'CHRONOLOGY', pages: 300, dueBy: null, note: 'Chronology of the suppression hearing', status: 'DELIVERED', staffNote: 'Delivered 2027-02-10.', deliverable: CHRONOLOGY, deliveredAt: '2027-02-10T10:00:00Z', createdAt: '2027-01-20T10:00:00Z' }
const OPS_REQUEST = { ...REQUEST, assignedTo: null, caseLabel: null, businessDaysOpen: 3, pastSla: false, organisation: { id: 'org_2', name: 'County PD', kind: 'PD_OFFICE', isTest: false }, requester: { id: 'u_o', name: 'PD Owner', email: 'o@pd.example' }, assignee: null }
const STRIPPED_MATTER = {
  matter: { id: 'm1', caseId: 'case_1', organisationId: 'org_1', openedBy: 'u2', vehicle: 'direct_appeal', vehicleLabel: 'Direct appeal', county: 'Harris', court: null, causeNumber: '1234567', clientInitials: 'GW', createdAt: '', updatedAt: '' },
  case: { id: 'case_1', title: 'GW — Direct appeal', status: 'AWAITING_DOCS', vehicle: 'direct_appeal' },
  checklist: { items: [], readiness: {}, documents: 0 },
  lawyerSeat: false,
  lawyerSeatReason: 'LAWYER_SEAT_REQUIRED',
}
const ORG_DETAIL = {
  organisation: { id: 'org_1', kind: 'CLINIC', name: 'Innocence Clinic', legalName: null, billingEmail: null, securityContact: null, pilot: false, pilotEndsAt: null, allowanceRecords: 0, allowanceResetsAt: null, publicInterest: false, isTest: false, tenantId: 't1', memberCount: 1, createdAt: '', clinicVerifiedAt: null, clinicSupervisingBar: null, clinicVerifiedBy: null },
  members: [], invitations: [],
}

const calls: Array<{ method: string; url: string; body?: unknown }> = []
beforeEach(() => {
  calls.length = 0
  session.role = 'ADMIN'
  ctx.value = { me: me({}), flags: { ...DARK, counsel_surfaces: true, record_desk: true }, seat: 'ok', reload: () => {} }
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    calls.push({ method: init?.method ?? 'GET', url: path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const body = path.startsWith('/counsel/matters/case_1') ? STRIPPED_MATTER
      : path.startsWith('/counsel/matters') ? { matters: [] }
      : path.startsWith('/counsel/investigations') ? { requests: [REQUEST] }
      : path.startsWith('/cases/') ? null
      : path.startsWith('/ops/verifications') ? { verifications: [
          { id: 'u_a', name: 'Ana Reyes', email: 'ana@writpartners.example', barNumber: '24011111', barState: 'TX', practiceType: 'writ', signedUpAt: '2026-10-12T15:00:00Z', organisation: null, seat: 'OWNER', barVerificationStatus: 'PENDING', lawyerPracticeType: true },
          { id: 'u_c', name: 'Pat Field', email: 'pat@example.com', barNumber: '000', barState: 'TX', practiceType: 'investigator', signedUpAt: '2026-10-13T15:00:00Z', organisation: null, seat: 'OWNER', barVerificationStatus: 'PENDING', lawyerPracticeType: false },
        ] }
      : path.endsWith('/clinic-verify') ? { organisation: { ...ORG_DETAIL.organisation, clinicVerifiedAt: '2026-10-23T10:00:00Z', clinicSupervisingBar: '24011223' } }
      : path.startsWith('/ops/organisations/org_1/metrics') ? { organisationId: 'org_1', recordsOpened: 0, analysesRun: 0, allowance: { granted: 0, used: 0, remaining: 0, resetsAt: null, pilot: false, pilotEndsAt: null, publicInterest: false }, members: 1, lastActivity: null }
      : path.startsWith('/ops/organisations/org_1') ? ORG_DETAIL
      : path.startsWith('/ops/invoices') ? []
      : path.startsWith('/ops/investigations/') ? { request: OPS_REQUEST }
      : path.startsWith('/ops/investigations') ? { requests: [OPS_REQUEST] }
      : path.startsWith('/ops/staff') ? { staff: [] }
      : path.startsWith('/permissions/users') ? (init?.method === 'POST' ? { success: true, user: { id: 'u_new' }, invite: { delivered: true } } : [{ id: 'u_lic', name: 'Lee', email: 'lee@snotnoselegal.com', role: 'ATTORNEY', barNumber: '24055555', barVerified: true, active: true }, { id: 'u_sam', name: 'Sam', email: 'sam@snotnoselegal.com', role: 'ATTORNEY', barNumber: null, barVerified: false, active: true }])
      : { ok: true }
    return { ok: body !== null, status: body === null ? 404 : 200, json: async () => body } as Response
  }))
})

describe('lawyerGateMessage', () => {
  it('is the pending sentence for a pending bar, the rejected one for a rejected bar, the seat one for an investigator, null when the gate passes', () => {
    expect(lawyerGateMessage(me({ lawyerSeatReason: 'BAR_PENDING' }))).toBe('Your bar number is being checked by our staff; matters open once it is verified.')
    expect(lawyerGateMessage(me({ lawyerSeatReason: 'BAR_REJECTED' }))).toMatch(/could not verify your bar number/)
    expect(lawyerGateMessage(me({ lawyerSeatReason: 'LAWYER_SEAT_REQUIRED' }))).toMatch(/organisation's attorneys/)
    expect(lawyerGateMessage(me({ lawyerSeat: true }))).toBeNull()
    expect(lawyerGateMessage(null)).toBeNull()
    expect(BAR_STATUS_LABEL.REJECTED).toBe('Could not be verified')
    // Describes the state; never a verdict or a promise about the review.
    for (const copy of Object.values(LAWYER_GATE_COPY)) expect(copy).not.toMatch(/winnable|grounds|viable|will win/i)
  })
})

describe('/counsel home', () => {
  it('a PENDING owner reads the banner and has no "Open a matter"', async () => {
    ctx.value.me = me({ lawyerSeatReason: 'BAR_PENDING' })
    render(<CounselHome />)
    expect(await screen.findByTestId('lawyer-gate-banner')).toHaveTextContent('being checked by our staff')
    await screen.findByTestId('matters-empty')
    expect(screen.queryByTestId('open-matter')).toBeNull()
  })
  it('a REJECTED attorney seat reads the rejected sentence; an investigator reads the seat sentence; neither opens a matter', async () => {
    ctx.value.me = me({ membership: { role: 'ATTORNEY' }, user: { barVerificationStatus: 'REJECTED' }, lawyerSeatReason: 'BAR_REJECTED' })
    const { unmount } = render(<CounselHome />)
    expect(await screen.findByTestId('lawyer-gate-banner')).toHaveTextContent('could not verify your bar number')
    expect(screen.queryByTestId('open-matter')).toBeNull()
    unmount()
    ctx.value.me = me({ membership: { role: 'INVESTIGATOR' }, user: { barNumber: null }, lawyerSeatReason: 'LAWYER_SEAT_REQUIRED' })
    render(<CounselHome />)
    expect(await screen.findByTestId('lawyer-gate-banner')).toHaveTextContent("organisation's attorneys")
    expect(screen.queryByTestId('open-matter')).toBeNull()
  })
  it('a verified owner sees no banner and the button', async () => {
    ctx.value.me = me({ lawyerSeat: true, user: { barVerified: true, barVerificationStatus: 'VERIFIED' } })
    render(<CounselHome />)
    expect(await screen.findByTestId('open-matter')).toBeInTheDocument()
    expect(screen.queryByTestId('lawyer-gate-banner')).toBeNull()
  })
})

describe('the matter page for a non-lawyer seat', () => {
  it('shows the title, status and uploader with one sentence in place of the clock, quote and packet', async () => {
    ctx.value.me = me({ membership: { role: 'INVESTIGATOR' }, lawyerSeatReason: 'LAWYER_SEAT_REQUIRED' })
    render(<MatterPage />)
    expect(await screen.findByTestId('matter-title')).toHaveTextContent('GW — Direct appeal')
    expect(screen.getByTestId('matter-status')).toHaveTextContent('Awaiting record')
    expect(screen.getByTestId('lawyer-gate-matter')).toHaveTextContent("organisation's attorneys")
    expect(screen.getByTestId('record-uploader')).toBeInTheDocument()
    expect(screen.queryByTestId('trap-clock')).toBeNull()
    expect(screen.queryByTestId('records-complete')).toBeNull()
    expect(screen.queryByTestId('packet-card')).toBeNull()
    expect(screen.queryByTestId('quote-pending')).toBeNull()
    // The quote is never even asked for.
    expect(calls.some((c) => c.url.includes('/quote'))).toBe(false)
  })
})

describe('the Record Desk pages', () => {
  it('counsel reads the chronology as a table and the free text as a process note', async () => {
    render(<CounselRecordDesk />)
    const table = await screen.findByTestId('chronology-inv_1')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(table).toHaveTextContent('2019-11-18')
    expect(table).toHaveTextContent('RR3')
    expect(table).toHaveTextContent('Motion to suppress heard; objection overruled.')
    expect(table).toHaveTextContent('Built from RR vols. 1-5.')
    expect(table).toHaveTextContent('describes the record')
    expect(screen.getByTestId('process-note-inv_1')).toHaveTextContent('Process note: Delivered 2027-02-10.')
  })
  it('staff open the editor, add an entry and save the deliverable; the note is labelled a process note', async () => {
    render(<OpsRecordDesk />)
    await screen.findByTestId('record-desk-table')
    expect(screen.getByLabelText('Process note for County PD Chronology')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('chronology-toggle-inv_1'))
    const editor = screen.getByTestId('chronology-editor-inv_1')
    expect(within(editor).getByLabelText('Entry 1 date')).toHaveValue('2019-03-04')
    fireEvent.click(screen.getByTestId('chronology-add-inv_1'))
    fireEvent.change(within(editor).getByLabelText('Entry 3 date'), { target: { value: '2020-01-10' } })
    fireEvent.change(within(editor).getByLabelText('Entry 3 event'), { target: { value: 'Judgment signed; 25 years TDCJ.' } })
    fireEvent.click(screen.getByTestId('chronology-save-inv_1'))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.url === '/ops/investigations/inv_1')).toBeTruthy())
    const body = calls.find((c) => c.method === 'PATCH')!.body as { deliverable: { entries: unknown[]; note?: string } }
    expect(body.deliverable.entries).toHaveLength(3)
    expect(body.deliverable.entries[2]).toEqual({ date: '2020-01-10', event: 'Judgment signed; 25 years TDCJ.' })
    expect(body.deliverable.entries[1]).toEqual({ date: '2019-11-18', volume: 'RR3', page: '214', event: 'Motion to suppress heard; objection overruled.' })
    expect(body.deliverable.note).toBe('Built from RR vols. 1-5.')
  })
})

describe('the staff pages', () => {
  it('the verification queue marks an investigator practice type and disables Verify for it', async () => {
    render(<VerificationsPage />)
    await screen.findByTestId('verifications-table')
    expect(screen.getByTestId('non-lawyer-u_c')).toHaveTextContent('not a lawyer practice')
    expect(screen.getByTestId('verify-u_c')).toBeDisabled()
    expect(screen.getByTestId('verify-u_a')).not.toBeDisabled()
    expect(screen.queryByTestId('non-lawyer-u_a')).toBeNull()
    expect(screen.getByTestId('verification-policy')).toHaveTextContent(/never verified as a lawyer/)
  })
  it('the organisation page shows an unverified clinic and posts the supervising attorney\'s bar number', async () => {
    render(<OrganisationPage />)
    expect(await screen.findByTestId('clinic-badge')).toHaveTextContent('NOT VERIFIED')
    const form = screen.getByTestId('clinic-verify-form')
    fireEvent.change(within(form).getByLabelText("Supervising attorney's bar number"), { target: { value: '24011223' } })
    fireEvent.click(screen.getByTestId('clinic-verify'))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/ops/organisations/org_1/clinic-verify')?.body).toEqual({ supervisingBar: '24011223' }))
  })
  it('the Team page shows BAR ✓ for a licensed reviewer and sends the bar number with an invite', async () => {
    render(<TeamPage />)
    expect(await screen.findByTestId('bar-u_lic')).toHaveTextContent('BAR ✓')
    expect(screen.queryByTestId('bar-u_sam')).toBeNull()
    fireEvent.click(screen.getByText('Invite User'))
    fireEvent.change(screen.getByTestId('staff-bar-number'), { target: { value: '24099999' } })
    const dialogInputs = document.querySelectorAll('form input')
    fireEvent.change(dialogInputs[0], { target: { value: 'new@snotnoselegal.com' } })
    fireEvent.change(dialogInputs[1], { target: { value: 'New Reviewer' } })
    fireEvent.click(screen.getByText('Send Invite'))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/permissions/users')?.body).toEqual({ email: 'new@snotnoselegal.com', name: 'New Reviewer', role: 'ATTORNEY', barNumber: '24099999' }))
  })
})
