import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'

/** G-C6 the interstitial is remembered per case; G-E3 the next-step resources are links. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_9' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const REPORT = { versionNo: 1, templateVersion: 'AB-v1', renderedAt: '2026-09-08T10:00:00Z', deadlinePosture: null, subsequentWritMode: false, strongSignals: [], possibleIssues: [], droppedByReverification: 0 }
beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/report/versions') ? [{ versionNo: 1, renderedAt: REPORT.renderedAt }] : u.endsWith('/report/changes') ? { fromVersion: null, toVersion: 1, added: [], removed: [], keptCount: null } : REPORT
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('report — remembered interstitial and linked resources', () => {
  it('shows the interstitial the first time and remembers the choice', async () => {
    const { unmount } = render(<CaseReport />)
    expect(screen.getByRole('button', { name: /Read it now/ })).toBeInTheDocument()
    screen.getByRole('button', { name: /Read it now/ }).click()
    await screen.findByText('Your case review')
    expect(window.localStorage.getItem('snl:report-opened:case_9')).toBe('1')
    unmount()

    render(<CaseReport />)
    expect(screen.queryByRole('button', { name: /Read it now/ })).toBeNull()
    expect(await screen.findByTestId('gentle-reminder')).toHaveTextContent(/there is a next step/)
    expect(screen.getByTestId('lris-link')).toHaveAttribute('href', 'https://www.texasbar.com')
    expect(screen.getByTestId('tifa-link')).toHaveAttribute('href', 'https://www.tifa.org')
  })
})
