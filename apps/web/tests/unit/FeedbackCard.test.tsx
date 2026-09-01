import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FeedbackCard from '@/components/FeedbackCard'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}))
import { apiFetch } from '@/lib/api'

beforeEach(() => window.localStorage.clear())

describe('FeedbackCard (customer_feedback_program.md)', () => {
  it('touch 1 arms on the pdf-download event, submits partial answers, dismisses forever', async () => {
    render(<FeedbackCard caseId="c1" variant="report" />)
    expect(screen.queryByTestId('feedback-card')).toBeNull() // not armed yet
    fireEvent(window, new Event('snl:pdf-download'))
    expect(await screen.findByTestId('feedback-card')).toBeInTheDocument()
    expect(screen.getByText(/However your report turned out/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '4' }))
    fireEvent.click(screen.getByText('Yes'))
    fireEvent.click(screen.getByText('Send'))
    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeInTheDocument())
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))
    expect(body).toEqual({ clarity: 4, recommend: 'yes' })
    expect(window.localStorage.getItem('snl_fb_report_c1')).toBe('1')
  })

  it('share variant (the +7d email link) shows touch-2 questions immediately', () => {
    render(<FeedbackCard caseId="c1" variant="share" />)
    expect(screen.getByText(/shared your report with a lawyer/)).toBeInTheDocument()
    expect(screen.getByText('Planning to')).toBeInTheDocument()
  })

  it('a dismissed card never returns', () => {
    window.localStorage.setItem('snl_fb_share_c1', '1')
    render(<FeedbackCard caseId="c1" variant="share" />)
    expect(screen.queryByTestId('feedback-card')).toBeNull()
  })
})
