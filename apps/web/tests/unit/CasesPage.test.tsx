import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const role = { value: 'SUPPORT' as string }
vi.mock('@/lib/staff-role', () => ({ useStaffRole: () => role.value }))
import CasesPage from '@/app/ops/cases/page'

/** Cases — the support surface: every case, searchable, linking to its case file. */
const QUEUE = [
  { id: 'c_1', title: 'Case review', label: 'Travis County · 2020', ref: '0000C1', subjectName: 'Juan Pérez', customerName: 'Maria Delgado', customerEmail: 'maria@example.com', status: 'AWAITING_DOCS', lane: 'TRIAL', daysInStage: 9, stalled: true, ocrHalt: false, delayOurs: false, subsequentWrit: false, updatedAt: '2026-09-01T10:00:00Z' },
  { id: 'c_2', title: 'Case review', label: 'Bexar County · 2018', ref: '0000C2', subjectName: null, customerName: null, customerEmail: 'j.ortiz@example.com', status: 'QA_REJECTED', lane: 'TRIAL', daysInStage: 1, stalled: false, ocrHalt: false, delayOurs: false, subsequentWrit: true, updatedAt: '2026-09-07T10:00:00Z' },
  { id: 'c_3', title: 'GW — 11.07', label: 'Harris County · 2021', ref: '0000C3', subjectName: null, customerName: 'PD Owner', customerEmail: 'owner@pd.example', status: 'DIGITIZING', lane: 'TRIAL', daysInStage: 2, stalled: false, ocrHalt: false, delayOurs: false, subsequentWrit: false, updatedAt: '2026-08-20T10:00:00Z', organisation: { id: 'org_1', name: 'County PD', kind: 'PD_OFFICE', isTest: false }, matter: { vehicle: '11.07', causeNumber: '1577001', clientInitials: 'gw' } },
]
beforeEach(() => {
  role.value = 'SUPPORT'
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/ops/cogs-by-case') ? { c_1: 12.5 } : QUEUE) }) as Response))
})

describe('cases page', () => {
  it('lists every case in the family\'s stage words, newest activity first, each linking to its case file', async () => {
    render(<CasesPage />)
    const table = await screen.findByTestId('cases-table')
    expect(table).toHaveTextContent(/Bexar County · 2018.*Travis County · 2020/) // newest first
    expect(table).toHaveTextContent(/Quality review/) // QA_REJECTED reads as the family sees it
    expect(screen.getByTestId('case-who-c_2')).toHaveAttribute('href', '/ops/cases/c_2')
    fireEvent.change(screen.getByLabelText('Find a case'), { target: { value: 'travis' } })
    expect(table).not.toHaveTextContent(/Bexar/)
    expect(table).toHaveTextContent(/STALL/)
  })

  it('admins see a running cost per case; support does not', async () => {
    render(<CasesPage />)
    await screen.findByTestId('cases-table')
    expect(screen.queryByText('Cost so far')).toBeNull()
  })
  it('admin: Cost so far column from /ops/cogs-by-case, dash when nothing recorded', async () => {
    role.value = 'ADMIN'
    render(<CasesPage />)
    expect(await screen.findByText('Cost so far')).toBeInTheDocument()
    expect(await screen.findByTestId('cogs-c_1')).toHaveTextContent('$12.50')
    expect(screen.getByTestId('cogs-c_2')).toHaveTextContent('—')
  })

  it('the Case · who cell: the person in custody first, the account holder second, never the constant title (founder, 2026-11-01)', async () => {
    render(<CasesPage />)
    expect(await screen.findByText('Case · who')).toBeInTheDocument()
    expect(screen.getByTestId('case-who-c_1')).toHaveTextContent('Record of Juan Pérez')
    expect(screen.getByTestId('case-who-c_1')).toHaveAttribute('data-given', 'true')
    expect(screen.getByTestId('case-account-c_1')).toHaveTextContent('Account: Maria Delgado · maria@example.com')
    // Not given yet: a muted placeholder, still the link to the case file; the account line shows the email alone.
    expect(screen.getByTestId('case-who-c_2')).toHaveTextContent('Record of — (not given yet)')
    expect(screen.getByTestId('case-who-c_2')).toHaveAttribute('data-given', 'false')
    expect(screen.getByTestId('case-who-c_2').className).toMatch(/8B949E/)
    expect(screen.getByTestId('case-account-c_2')).toHaveTextContent('Account: j.ortiz@example.com')
    // A counsel matter names its client by initials only — never the placeholder.
    expect(screen.getByTestId('case-who-c_3')).toHaveTextContent('Client: GW (initials only)')
    expect(screen.getByTestId('case-who-c_3')).not.toHaveTextContent(/not given/)
    expect(screen.queryByText('Case review')).toBeNull()
    expect(screen.getByTestId('cases-table')).toHaveTextContent(/Travis County · 2020 · 0000C1/)
  })

  it('search matches the person in custody as well as the account holder', async () => {
    render(<CasesPage />)
    const table = await screen.findByTestId('cases-table')
    fireEvent.change(screen.getByLabelText('Find a case'), { target: { value: 'juan' } })
    expect(table).toHaveTextContent(/Juan Pérez/)
    expect(table).not.toHaveTextContent(/Bexar/)
    fireEvent.change(screen.getByLabelText('Find a case'), { target: { value: 'ortiz' } })
    expect(table).toHaveTextContent(/Bexar/)
    expect(table).not.toHaveTextContent(/Travis/)
    fireEvent.change(screen.getByLabelText('Find a case'), { target: { value: 'gw' } })
    expect(table).toHaveTextContent(/Harris/)
    expect(table).not.toHaveTextContent(/Travis|Bexar/)
  })
})
