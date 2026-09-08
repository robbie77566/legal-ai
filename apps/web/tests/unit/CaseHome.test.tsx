import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CaseHome from '@/app/(daybreak)/case/[caseId]/page'

/** Case home (G-C1): what we know, where it is, one thing to do next, every page one click away. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }) }))

const CHECKLIST = {
  status: 'AWAITING_DOCS',
  customer: { stage: 'awaiting_documents', subsequentWritMode: false },
  expectedReadyAt: null, slaStartedAt: null,
  items: [{ id: 'a', state: 'UPLOADED' }, { id: 'b', state: 'NEEDED' }, { id: 'c', state: 'NEEDED' }],
  documents: [],
  factLines: [
    { key: 'conviction', label: 'Conviction', value: 'Travis County · 2019 · felony · Texas state court' },
    { key: 'trialOrPlea', label: 'How it was decided', value: 'A trial', shapesReview: true },
    { key: 'vehicle', label: 'Writ type', value: 'Article 11.07', derived: true },
  ],
  rerun: null,
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/checklist') ? CHECKLIST : u.endsWith('/report/versions') ? [] : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('case home', () => {
  it('names the case from its facts, shows the stage and one primary action, and the facts with a Change link', async () => {
    render(<CaseHome />)
    expect(await screen.findByTestId('case-home-title')).toHaveTextContent('Review · Travis County · 2019')
    expect(screen.getByTestId('stage')).toHaveTextContent(/Waiting on your documents · 1 of 3 found/)
    expect(screen.getByTestId('primary-action')).toHaveAttribute('href', '/case/case_1/documents')
    const about = screen.getByTestId('about-case')
    expect(about).toHaveTextContent(/A trial/)
    expect(about).toHaveTextContent(/Article 11\.07.*chosen from your answers/)
    expect(screen.getByRole('link', { name: 'Change' })).toHaveAttribute('href', '/case/case_1/interview')
    expect(screen.getByTestId('unlock-deadlines')).toHaveTextContent(/Add the judgment date/)
    const nav = screen.getByTestId('case-nav')
    for (const l of ['Overview', 'Documents', 'Progress', 'Report', 'Next steps']) expect(nav).toHaveTextContent(l)
    expect(screen.getByRole('link', { name: 'Next steps' })).toHaveAttribute('href', '/case/case_1/next-steps')
  })

  it('a finished case points at the report and locks the facts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      const body = u.endsWith('/checklist') ? { ...CHECKLIST, status: 'DELIVERED', customer: { stage: 'delivered', subsequentWritMode: false } }
        : u.endsWith('/report/versions') ? [{ versionNo: 2, renderedAt: '2026-09-08T10:00:00Z' }, { versionNo: 1, renderedAt: '2026-09-05T10:00:00Z' }] : {}
      return { ok: true, status: 200, json: async () => body } as Response
    }))
    render(<CaseHome />)
    expect(await screen.findByTestId('primary-action')).toHaveAttribute('href', '/case/case_1/report')
    expect(screen.getByTestId('about-case')).toHaveTextContent(/are locked now — a re-run is where they can change/)
    expect(screen.getByRole('link', { name: 'Correct county, year, or dates' })).toHaveAttribute('href', '/case/case_1/interview')
    expect(screen.getByTestId('reports')).toHaveTextContent(/Report v2 — current.*Report v1/)
  })
})
