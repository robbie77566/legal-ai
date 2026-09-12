import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import BuySuccess from '@/app/(daybreak)/buy/success/page'

/** The success page opens THIS session's case, never cases[0] (G-B3). */
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('session_id=cs_test_2') }))

const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('/checkout/fulfillment?session_id=cs_test_2')) return { ok: true, status: 200, json: async () => ({ caseId: 'c_second', kind: 'review' }) } as Response
    return { ok: false, status: 404, json: async () => ({ pending: true }) } as Response
  }))
})

describe('buy success', () => {
  it('asks which case the session created and continues to that one', async () => {
    render(<BuySuccess />)
    expect(await screen.findByTestId('continue')).toHaveAttribute('href', '/case/c_second/interview')
    expect(calls.some((u) => u.endsWith('/checkout/fulfillment?session_id=cs_test_2'))).toBe(true)
    expect(calls.some((u) => u.endsWith('/cases'))).toBe(false)
  })

  it('a repeat buyer with the details on file goes straight to the documents (PO, 2026-09-12)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ caseId: 'c_third', kind: 'review', interviewNeeded: false }) }) as Response))
    render(<BuySuccess />)
    const link = await screen.findByTestId('continue')
    expect(link).toHaveAttribute('href', '/case/c_third/documents')
    expect(link).toHaveTextContent('Continue to your documents')
    expect(screen.getByText(/nothing to answer again/)).toBeInTheDocument()
  })
})
