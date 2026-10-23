import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SharedReport from '@/app/(daybreak)/shared/[token]/page'

/**
 * UPL review 2026-10-23, E2 (U3-b at the page): the share page renders the
 * `sections` the API builds with attorneyPacketSections — every section,
 * by id, nothing else — so it shows exactly what the sealed packet prints.
 */
vi.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok123' }) }))

const SECTIONS = [
  { id: 'cover', title: 'Attorney packet', coverLine: { en: 'For the attorney. Prepared for the family to hand to licensed counsel; information about a court record, not legal advice.', es: 'Para el abogado.' }, statement: 'Snot Nose Legal is operated by Tangent Solutions LLC. We are not a law firm and do not provide legal advice.', notice: 'Access to this packet does not itself create an attorney-client relationship or privilege.', caseTitle: 'Harris County · 2019', reportId: 'rep_1', versionNo: 1, templateVersion: 'attorney-v1', reportTemplateVersion: 'AB-v2', renderedAt: '2026-10-23', subsequentWritMode: true },
  { id: 'case_summary', rows: [{ label: 'Person', value: 'GARY W. DOE', source: 'record', where: 'RR1 p. 3' }, { label: 'Offense', value: null, source: null, where: null }] },
  { id: 'posture', line: '1 finding(s) rated dispositive, 1 supportive, 0 background.' },
  { id: 'time_computation', asOf: '2026-10-23', lines: [{ label: 'Finality date, as given', value: '2020-03-01 (judgment plus 30 days)' }], note: 'Counsel verifies every date.' },
  { id: 'part_b', droppedByReverification: 1, findings: [
    { id: 'f1', category: 'sentencing', severity: 'dispositive', severityLabel: 'Strong signal', confidence: 0.9, partBText: 'Fine assessed alongside a life sentence.', labels: 'Preservation unknown · Either · No harm standard', develop: 'Obtain the judgment for each count.', dependsOn: [], citations: [{ volume: 'RR9', page: 40, excerpt: 'The fine of $10,000 is assessed', where: 'RR9 p. 40' }] },
    { id: 'f2', category: 'junk_science', severity: 'supportive', severityLabel: 'Possible issue', partBText: 'Bite-mark comparison admitted over objection.', labels: null, develop: null, dependsOn: ['Volume 6 exhibits'], citations: [] },
  ] },
  { id: 'priority', intro: 'Ordered by weight.', items: [{ id: 'f1', category: 'sentencing', severityLabel: 'Strong signal', labels: 'Preservation unknown · Either · No harm standard' }], unknownPreservation: 1 },
  { id: 'checklist', intro: 'For the attorney; not a recommendation to file anything.', items: ['Obtain the judgment for each count.'] },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ notice: 'Access to this packet does not itself create an attorney-client relationship or privilege.', sections: SECTIONS }) }) as Response))
})

describe('shared attorney packet page', () => {
  it('renders every section the API lists, with the cover line and the statutory statement first', async () => {
    render(<SharedReport />)
    const cover = await screen.findByTestId('packet-cover')
    expect(cover).toHaveTextContent('Attorney packet')
    expect(screen.getByTestId('packet-cover-line')).toHaveTextContent('For the attorney. Prepared for the family to hand to licensed counsel')
    expect(screen.getByTestId('packet-statement')).toHaveTextContent('not a law firm')
    expect(cover).toHaveTextContent('prior application on this conviction')
    expect(screen.getByTestId('packet-summary')).toHaveTextContent('GARY W. DOE (RR1 p. 3)')
    expect(screen.getByTestId('packet-summary')).toHaveTextContent('not stated in the record')
    expect(screen.getByTestId('packet-posture')).toHaveTextContent('1 finding(s) rated dispositive')
    expect(screen.getByTestId('packet-time')).toHaveTextContent('Finality date, as given')
    const findings = screen.getAllByTestId('packet-finding')
    expect(findings).toHaveLength(2)
    expect(findings[0]).toHaveTextContent('Fine assessed alongside a life sentence.')
    expect(findings[0]).toHaveTextContent('To develop: Obtain the judgment for each count.')
    expect(findings[0]).toHaveTextContent('Record (RR9 p. 40)')
    expect(findings[1]).toHaveTextContent('Depends on records not provided: Volume 6 exhibits')
    expect(screen.getByTestId('packet-part-b')).toHaveTextContent('1 failed re-verification')
    expect(screen.getByTestId('packet-priority')).toHaveTextContent('sentencing')
    expect(screen.getByTestId('packet-priority')).toHaveTextContent('1 issue(s) carry no preservation call')
    expect(screen.getByTestId('packet-checklist')).toHaveTextContent('Obtain the judgment for each count.')
    expect(screen.getByTestId('packet-site')).toHaveTextContent(/does not itself create an attorney-client relationship/)
    // Nothing addressed to the family.
    expect(document.body.textContent).not.toMatch(/For your family|your lawyer/)
  })

  it('omits sections the API did not send', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ notice: 'n', sections: [SECTIONS[0], { ...SECTIONS[4], findings: [] }] }) }) as Response))
    render(<SharedReport />)
    await screen.findByTestId('packet-cover')
    expect(screen.queryByTestId('packet-priority')).toBeNull()
    expect(screen.queryByTestId('packet-checklist')).toBeNull()
    expect(screen.queryByTestId('packet-time')).toBeNull()
    expect(screen.getByTestId('packet-part-b')).toHaveTextContent(/recorded no finding/)
  })

  it('a dead link says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response))
    render(<SharedReport />)
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument()
  })
})
