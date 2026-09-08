import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EligibilityCheck from '@/app/(daybreak)/check/page'

/** G-E2 resumable check and G-E1 pending-appeal email capture. */
const calls: Array<{ url: string; init?: RequestInit }> = []
beforeEach(() => {
  calls.length = 0
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u.includes('/eligibility/draft/tok_1')) return { ok: true, status: 200, json: async () => ({ answers: { jurisdiction: 'texas', offenseLevel: 'felony', capital: 'no', custody: 'prison', trialOrPlea: 'trial', appeal: 'pending' }, outcome: 'pending_appeal' }) } as Response
    return { ok: true, status: 200, json: async () => ({ ok: true, token: 'tok_new' }) } as Response
  }))
})

describe('eligibility check — resume and check back later', () => {
  it('offers to pick up a finished check from this browser, then lands on that outcome', async () => {
    window.localStorage.setItem('snl_draft_token', 'tok_1')
    render(<EligibilityCheck />)
    const banner = await screen.findByTestId('resume-check')
    expect(banner).toHaveTextContent(/not yet — the appeal is still pending/)
    fireEvent.click(screen.getByTestId('resume-yes'))
    expect(await screen.findByTestId('outcome-pending')).toBeInTheDocument()
  })

  it('a pending-appeal family can leave an email and gets told exactly what happens next', async () => {
    window.localStorage.setItem('snl_draft_token', 'tok_1')
    render(<EligibilityCheck />)
    fireEvent.click(await screen.findByTestId('resume-yes'))
    const form = await screen.findByTestId('lead-form')
    expect(form).toHaveTextContent(/once, in about 3 months/)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fam@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/eligibility/lead') && c.init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post!.init!.body))).toEqual({ email: 'fam@example.com', outcome: 'pending_appeal' })
    })
    expect(await screen.findByTestId('lead-done')).toHaveTextContent(/check back in about 3 months, once/)
  })

  it('with no saved token the wizard starts at question 1 and offers no resume', () => {
    render(<EligibilityCheck />)
    expect(screen.queryByTestId('resume-check')).toBeNull()
    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument()
  })
})
