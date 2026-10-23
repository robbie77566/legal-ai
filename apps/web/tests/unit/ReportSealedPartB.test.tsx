import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LangProvider } from '@/lib/i18n'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'
import { ATTORNEY_PACKET_CONTENT } from '@/lib/content/attorney-packet'

/**
 * UPL review 2026-10-23, E2 (recommendation 5): with family_part_b OFF — the
 * default — the report page shows no Part B fold and no priority section;
 * one "For your lawyer" card offers the sealed attorney packet and the
 * share link, in the family's language.
 */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

// What the API serves with the flag off: no partBText, preserved, harmStandard, vehicle or develop.
const payload = {
  summaryGap: null, rerunPriceCents: 9900, caseSummary: [], versionNo: 1, templateVersion: 'AB-v2', renderedAt: '2026-10-23T10:00:00Z',
  deadlinePosture: null, subsequentWritMode: false, droppedByReverification: 0, newEvidence: null,
  bottomLine: { tier: 'consult', headline: 'Worth a consultation.', body: ['Information about the record, not legal advice.'] },
  strongSignals: [{ category: 'sentencing', severity: 'dispositive', confidence: 0.9, partAText: 'A fine was added to a life sentence.', citations: [], dependsOn: [] }],
  possibleIssues: [{ category: 'junk_science', severity: 'supportive', confidence: 0.7, partAText: 'Bite-mark testimony came in over an objection.', citations: [], dependsOn: ['Volume 6 exhibits'] }],
}
let flags: Record<string, boolean> = {}
beforeEach(() => {
  try { localStorage.clear(); localStorage.setItem('snl:report-opened:case_1', '1') } catch {}
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/flags') ? flags : u.endsWith('/report/versions') ? [{ versionNo: 1, renderedAt: '2026-10-23T10:00:00Z' }] : u.endsWith('/report') ? payload : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('report — Part B sealed (family_part_b off)', () => {
  it('shows the For-your-lawyer card with both actions and neither the Part B fold nor the priority section', async () => {
    flags = { family_part_b: false }
    render(<LangProvider><CaseReport /></LangProvider>)
    const card = await screen.findByTestId('for-your-lawyer')
    expect(card).toHaveTextContent(ATTORNEY_PACKET_CONTENT.en.title)
    expect(card).toHaveTextContent('separate document: the attorney packet')
    expect(screen.getByTestId('attorney-packet-download')).toHaveAttribute('href', 'http://localhost:3001/cases/case_1/attorney-packet.pdf')
    expect(screen.getByTestId('attorney-packet-download')).toHaveTextContent(ATTORNEY_PACKET_CONTENT.en.download)
    expect(screen.getByTestId('attorney-packet-share')).toHaveAttribute('href', '/case/case_1/next-steps')
    expect(screen.queryByText(/For your lawyer \(Part B\)/)).toBeNull()
    expect(screen.queryByTestId('counsel-section')).toBeNull()
    expect(screen.queryByTestId('finding-counsel-fields')).toBeNull()
    // Part A and the family-actionable gap stay.
    expect(screen.getByText('A fine was added to a life sentence.')).toBeInTheDocument()
    expect(screen.getByTestId('finding-depends-on')).toHaveTextContent('Volume 6 exhibits')
  })

  it('the card speaks Spanish when the family does', async () => {
    flags = { family_part_b: false }
    try { localStorage.setItem('snl_lang', 'es') } catch {}
    render(<LangProvider><CaseReport /></LangProvider>)
    await screen.findByTestId('for-your-lawyer')
    expect(screen.getByTestId('for-your-lawyer')).toHaveTextContent(ATTORNEY_PACKET_CONTENT.es.title)
    expect(screen.getByTestId('attorney-packet-download')).toHaveTextContent(ATTORNEY_PACKET_CONTENT.es.download)
    expect(screen.getByTestId('attorney-packet-share')).toHaveTextContent(ATTORNEY_PACKET_CONTENT.es.share)
  })

  it('with the flag on the Part B folds come back and the card is gone', async () => {
    flags = { family_part_b: true }
    render(<LangProvider><CaseReport /></LangProvider>)
    expect((await screen.findAllByText(/For your lawyer \(Part B\)/)).length).toBe(2)
    expect(screen.queryByTestId('for-your-lawyer')).toBeNull()
  })
})
