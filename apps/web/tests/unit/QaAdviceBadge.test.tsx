import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QaConsole from '@/app/qa/page'

/**
 * UPL review 2026-10-23, E3 (U3-c at the console): a finding whose stored
 * text tripped the advice-language lint shows an "advice wording" badge with
 * the phrases, so the reviewer sees why the case was held; a clean finding
 * shows none.
 */
const QUEUE = [{ id: 'c1', title: 'Harris County · 2019', lane: 'TRIAL', subsequentWrit: false, findingCount: 2, updatedAt: '' }]
const DETAIL = {
  case: { id: 'c1', title: 'Harris County · 2019', lane: 'TRIAL', status: 'QA_REVIEW', subsequentWrit: false },
  run: { id: 'r1' },
  findings: [
    {
      id: 'f_advice', category: 'sentencing', severity: 'dispositive', confidence: 0.9, adjudication: 'not_run', provenance: 'ai',
      partAText: 'You should file a writ before your deadline.', partBText: 'The defendant should file now.',
      citations: [],
      lintFlags: { adviceLintHit: true, partA: [{ phrase: 'should', index: 4 }, { phrase: 'file a', index: 11 }, { phrase: 'your deadline', index: 30 }], partB: [{ phrase: 'The defendant should', index: 0 }] },
    },
    {
      id: 'f_clean', category: 'junk_science', severity: 'supportive', confidence: 0.7, adjudication: 'not_run', provenance: 'ai',
      partAText: 'The record shows bite-mark testimony was admitted.', partBText: 'Admitted over objection; preserved.',
      citations: [], lintFlags: null,
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/qa/queue') ? QUEUE : u.includes('/qa/cases/') ? DETAIL : u.endsWith('/qa/holds') ? [{ caseId: 'c1', title: 'Harris County · 2019', reasons: ['advice wording in 1 finding(s)'], slaRemainingHours: 20 }] : {}
    return { ok: true, json: async () => body } as Response
  }))
})

describe('QA console — advice wording badge', () => {
  it('shows the phrases on the flagged finding only, and the hold reason in the held list', async () => {
    render(<QaConsole />)
    expect(await screen.findByTestId('hold-row')).toHaveTextContent('advice wording in 1 finding(s)')
    fireEvent.click(screen.getAllByText('Harris County · 2019')[1])
    await waitFor(() => expect(screen.getByText(/bite-mark testimony was admitted/)).toBeInTheDocument())
    const badges = screen.getAllByTestId('advice-lint-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('advice wording')
    expect(badges[0]).toHaveTextContent('Part A: should, file a, your deadline')
    expect(badges[0]).toHaveTextContent('Part B: The defendant should')
  })
})
