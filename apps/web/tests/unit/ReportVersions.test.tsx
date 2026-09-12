import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'

/** Re-run (US-6): the report shows its versions and what changed since the last one. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const REPORT = (v: number) => ({ versionNo: v, templateVersion: 'AB-v1', renderedAt: '2026-09-08T10:00:00Z', deadlinePosture: null, subsequentWritMode: false, strongSignals: [], possibleIssues: [{ category: 'brady', severity: 'supportive', partAText: `Finding in v${v}`, partBText: 'B', citations: [] }], droppedByReverification: 0 })
const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    calls.push(u)
    const body = u.endsWith('/report/versions') ? [{ versionNo: 2, renderedAt: '2026-09-08T10:00:00Z' }, { versionNo: 1, renderedAt: '2026-09-05T10:00:00Z' }]
      : u.endsWith('/report/changes') ? { fromVersion: 1, toVersion: 2, added: [{ category: 'brady', severity: 'dispositive', partAText: 'A lab report the defense never received' }], removed: [], keptCount: 1 }
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
})
