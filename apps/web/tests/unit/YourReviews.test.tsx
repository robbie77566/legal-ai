import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import YourReviews from '@/app/(daybreak)/cases/page'

const CASES = [
  { id: 'c1', title: 'Brazoria County · 2017', status: 'READY', stage: { stage: 'report_ready' }, expectedReadyAt: null, createdAt: '2026-08-30' },
  { id: 'c2', title: 'Review started 2026-08-31', status: 'AWAITING_DOCS', stage: { stage: 'collecting_documents' }, expectedReadyAt: '2026-09-14', createdAt: '2026-08-31' },
]

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify(CASES), { status: 200 })),
}))

describe('Your reviews home (US-11)', () => {
  it('lists every review with one stage-appropriate primary action, plus start-another', async () => {
    render(<YourReviews />)
    await waitFor(() => expect(screen.getAllByTestId('case-card')).toHaveLength(2))
    expect(screen.getByText('Brazoria County · 2017')).toBeInTheDocument()
    expect(screen.getByText('See your report')).toHaveAttribute('href', '/case/c1/report')
    expect(screen.getByText('Continue your checklist')).toHaveAttribute('href', '/case/c2/documents')
    expect(screen.getByText(/Start another review/)).toHaveAttribute('href', '/check')
  })
})
