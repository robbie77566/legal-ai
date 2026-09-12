import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'

/** Re-run (US-6): the report shows its versions and what changed since the last one. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const REPORT = (v: number) => ({ bottomLine: { tier: 'consult', headline: 'Worth a consultation — nothing here stands alone yet.', body: ['This review found 1 possible issue.', 'This is information about what is in the record, not legal advice.'] }, caseSummary: [{ key: 'defendant', label: 'Person', value: 'GARY W. DOE', source: 'record', cite: { volume: 'RR1', page: 3, quote: 'THE STATE OF TEXAS VS. GARY W. DOE' } }, { key: 'county', label: 'County', value: 'Brazoria County', source: 'family' }, { key: 'offense', label: 'Offense', value: null, source: null }], versionNo: v, templateVersion: 'AB-v1', renderedAt: '2026-09-08T10:00:00Z', deadlinePosture: null, subsequentWritMode: false, strongSignals: v === 2 ? [{ category: 'iac', severity: 'dispositive', confidence: 0.86, partAText: 'Counsel never objected', partBText: 'B', citations: [] }] : [], possibleIssues: [{ category: 'brady', severity: 'supportive', confidence: 0.62, partAText: `Finding in v${v}`, partBText: 'B', citations: [] }], droppedByReverification: 0 })
const NOTES: string[] = []
const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    calls.push(u)
    const body = u.endsWith('/report/versions') ? [{ versionNo: 2, renderedAt: '2026-09-08T10:00:00Z' }, { versionNo: 1, renderedAt: '2026-09-05T10:00:00Z' }]
      : u.endsWith('/report/changes') ? { fromVersion: 1, toVersion: 2, added: [{ category: 'brady', severity: 'dispositive', partAText: 'A lab report the defense never received' }], removed: [], keptCount: 1, notes: NOTES }
      : u.endsWith('/report?version=1') ? REPORT(1)
      : u.endsWith('/report') ? REPORT(2)
      : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('report versions', () => {
  it('shows the version switcher and what is new, and re-fetches an older version on demand', async () => {
    render(<CaseReport />)
    fireEvent.click(await screen.findByRole('button', { name: /Read it now/ }))
    const sw = await screen.findByTestId('version-switcher')
    expect(sw).toHaveTextContent(/v2 \(current\)/)
    expect(screen.getByTestId('what-changed')).toHaveTextContent(/Newly found \(1\).*A lab report the defense never received/)
    expect(screen.getByTestId('what-changed')).toHaveTextContent(/1 finding carried over/)
    fireEvent.click(screen.getByRole('button', { name: /v1 ·/ }))
    await waitFor(() => expect(calls.some((u) => u.endsWith('/cases/case_1/report?version=1'))).toBe(true))
    expect(await screen.findByText('Finding in v1')).toBeInTheDocument()
    expect(screen.queryByTestId('what-changed')).toBeNull() // only shown on the current version
  })

  it('the report footer names the site (PO, 2026-09-12)', async () => {
    render(<CaseReport />)
    // The 'Before you open' gate is remembered after the first test in this file; the footer renders either way.
    const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
    if (gate) fireEvent.click(gate)
    const site = await screen.findByTestId('report-site')
    expect(site).toHaveTextContent('snotnoselegal.com')
    expect(site.querySelector('a')).toHaveAttribute('href', 'https://www.snotnoselegal.com')
  })

  it('About this case: cited, family-told, and unknown lines (PO, 2026-09-12)', async () => {
    render(<CaseReport />)
    const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
    if (gate) fireEvent.click(gate)
    const block = await screen.findByTestId('case-summary')
    expect(screen.getByTestId('summary-defendant')).toHaveTextContent(/GARY W\. DOE.*RR1 p\. 3/)
    expect(screen.getByTestId('summary-county')).toHaveTextContent(/Brazoria County.*as your family told us/)
    expect(screen.getByTestId('summary-offense')).toHaveTextContent('not stated in the record')
    expect(block).toHaveTextContent(/About this case/)
  })

  it('The bottom line: headline, body, tier attribute (PO, 2026-09-12)', async () => {
    render(<CaseReport />)
    const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
    if (gate) fireEvent.click(gate)
    const bl = await screen.findByTestId('bottom-line')
    expect(bl).toHaveAttribute('data-tier', 'consult')
    expect(bl).toHaveTextContent(/Worth a consultation/)
    expect(bl).toHaveTextContent(/not legal advice/)
  })

  it('each issue carries a weight line; strong signals are red, not green (PO, 2026-09-12)', async () => {
    render(<CaseReport />)
    const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
    if (gate) fireEvent.click(gate)
    const cards = await screen.findAllByTestId('finding-card')
    expect(cards[0]).toHaveAttribute('data-tone', 'urgent')
    expect(cards[0]).toHaveTextContent('Weight: could stand on its own · How sure we are: high (86%)')
    expect(cards[0].style.borderLeftColor).toBe('var(--db-urgent)')
    expect(cards[1]).toHaveAttribute('data-tone', 'review')
    expect(cards[1]).toHaveTextContent('How sure we are: medium (62%)')
    expect(screen.getByTestId('weight-legend')).toHaveTextContent(/Could stand on its own:.*Supports a larger claim:.*Background:/)
    expect(screen.getByTestId('weight-legend')).toHaveTextContent(/not a chance of winning/)
  })

  it('a republished version lists what is different, and says the findings did not change (PO, 2026-09-12)', async () => {
    NOTES.push('Every issue now opens with a weight line.', 'Strong signals are shown in red.')
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      const body = u.endsWith('/report/versions') ? [{ versionNo: 2, renderedAt: '2026-09-12T10:00:00Z' }, { versionNo: 1, renderedAt: '2026-09-05T10:00:00Z' }]
        : u.endsWith('/report/changes') ? { fromVersion: 1, toVersion: 2, added: [], removed: [], keptCount: 1, notes: NOTES }
        : u.endsWith('/report') ? REPORT(2) : {}
      return { ok: true, status: 200, json: async () => body } as Response
    }))
    render(<CaseReport />)
    const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
    if (gate) fireEvent.click(gate)
    const notes = await screen.findByTestId('what-changed-notes')
    expect(notes).toHaveTextContent(/What is different in this version.*weight line.*shown in red/)
    expect(screen.getByTestId('what-changed')).toHaveTextContent(/What we found has not changed\. 1 finding carried over/)
    NOTES.length = 0
  })
})
