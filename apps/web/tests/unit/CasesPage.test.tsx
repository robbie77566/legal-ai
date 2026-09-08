import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CasesPage from '@/app/ops/cases/page'

/** Cases — the support surface: every case, searchable, linking to its case file. */
const QUEUE = [
  { id: 'c_1', title: 'Travis County · 2020', status: 'AWAITING_DOCS', lane: 'TRIAL', daysInStage: 9, stalled: true, ocrHalt: false, delayOurs: false, subsequentWrit: false, updatedAt: '2026-09-01T10:00:00Z' },
  { id: 'c_2', title: 'Bexar County · 2018', status: 'QA_REJECTED', lane: 'TRIAL', daysInStage: 1, stalled: false, ocrHalt: false, delayOurs: false, subsequentWrit: true, updatedAt: '2026-09-07T10:00:00Z' },
]
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => QUEUE }) as Response))
})

describe('cases page', () => {
  it('lists every case in the family\'s stage words, newest activity first, each linking to its case file', async () => {
    render(<CasesPage />)
    const table = await screen.findByTestId('cases-table')
    expect(table).toHaveTextContent(/Bexar County · 2018.*Travis County · 2020/) // newest first
    expect(table).toHaveTextContent(/Quality review/) // QA_REJECTED reads as the family sees it
    expect(screen.getByRole('link', { name: 'Bexar County · 2018' })).toHaveAttribute('href', '/ops/cases/c_2')
    fireEvent.change(screen.getByLabelText('Find a case'), { target: { value: 'travis' } })
    expect(table).not.toHaveTextContent(/Bexar/)
    expect(table).toHaveTextContent(/STALL/)
  })
})
