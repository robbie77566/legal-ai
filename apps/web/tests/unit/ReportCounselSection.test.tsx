import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'

vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const base = { summaryGap: null, rerunPriceCents: 9900, bottomLine: { tier: 'strong', headline: 'There is a real reason to talk to a lawyer.', body: ['Not legal advice.'] }, caseSummary: [], versionNo: 1, templateVersion: 'AB-v2', renderedAt: '2026-09-27T10:00:00Z', deadlinePosture: null, subsequentWritMode: false, droppedByReverification: 0 }
let payload: Record<string, unknown> = {}
beforeEach(() => {
  try { localStorage.setItem('snl:report-opened:case_1', '1') } catch {}
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/report/versions') ? [{ versionNo: 1, renderedAt: '2026-09-27T10:00:00Z' }] : u.endsWith('/report') ? payload : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

async function open() {
  render(<CaseReport />)
  const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
  if (gate) fireEvent.click(gate)
}

describe('report — the counsel section (prompt set v2)', () => {
  it('ranks issues the way a lawyer would and lists what to obtain, folding duplicate asks', async () => {
    payload = { ...base,
      strongSignals: [{ category: 'sentencing', severity: 'dispositive', confidence: 0.75, partAText: 'A fine was added to a life sentence.', partBText: 'B', citations: [], preserved: 'unknown', vehicle: 'either', harmStandard: 'none', develop: 'Obtain the judgment and sentence for each count.' }],
      possibleIssues: [
        { category: 'hearsay', severity: 'supportive', confidence: 0.6, partAText: 'x', partBText: 'B', citations: [], preserved: 'yes', vehicle: 'direct_appeal', harmStandard: 'nonconstitutional', develop: 'Obtain Volume 6 exhibits.' },
        { category: 'confrontation', severity: 'supportive', confidence: 0.8, partAText: 'y', partBText: 'B', citations: [], preserved: 'yes', vehicle: 'direct_appeal', harmStandard: 'constitutional', develop: 'obtain volume 6 exhibits', dependsOn: ['Volume 6 exhibits'] },
      ] }
    await open()
    const section = await screen.findByTestId('counsel-section')
    fireEvent.click(section.querySelector('summary')!)
    const ranked = screen.getByTestId('ranked-issues').querySelectorAll('li')
    expect(ranked[0]).toHaveTextContent('sentencing')
    expect(ranked[1]).toHaveTextContent('confrontation') // constitutional outranks non-constitutional at equal weight
    expect(ranked[2]).toHaveTextContent('hearsay')
    const checklist = screen.getByTestId('investigation-checklist').querySelectorAll('li')
    expect(checklist).toHaveLength(2)
    expect(checklist[0]).toHaveTextContent('judgment and sentence')
    expect(screen.getAllByTestId('finding-counsel-fields')[0]).toBeInTheDocument()
    expect(section).toHaveTextContent(/not a recommendation to file/)
  })
  it('an older report without the fields shows no counsel section', async () => {
    payload = { ...base, strongSignals: [], possibleIssues: [{ category: 'brady', severity: 'supportive', confidence: 0.6, partAText: 'old', partBText: 'B', citations: [] }] }
    await open()
    expect(await screen.findByText('old')).toBeInTheDocument()
    expect(screen.queryByTestId('counsel-section')).toBeNull()
    expect(screen.queryByTestId('finding-counsel-fields')).toBeNull()
  })
})
