import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResetPassword from '@/app/(auth)/auth/reset-password/page'

/** PO, 2026-09-12: "in the reset password, I need to be able to see the
 *  password I typed" — both fields reveal on demand, rules show live. */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=abc&id=u1'),
  useRouter: () => ({ push: vi.fn() }),
}))
const calls: Array<{ url: string; body: string }> = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response
  }))
})

describe('reset-password page', () => {
  it('reveals both typed passwords on demand and shows the rules live', () => {
    render(<ResetPassword />)
    const pw = screen.getByTestId('new-password-input') as HTMLInputElement
    const confirm = screen.getByTestId('confirm-password-input') as HTMLInputElement
    expect(pw.type).toBe('password')
    fireEvent.change(pw, { target: { value: 'Deertrail77566!' } })
    fireEvent.click(screen.getByTestId('new-password-toggle'))
    expect(pw.type).toBe('text')
    expect(pw.value).toBe('Deertrail77566!')
    fireEvent.click(screen.getByTestId('confirm-password-toggle'))
    expect(confirm.type).toBe('text')
    expect(screen.getByTestId('password-rules')).toHaveTextContent(/At least 12 characters/)
    expect(screen.getAllByTestId('password-rules')).toHaveLength(1) // no rules under "Confirm"
  })

  it('posts the new password with the token once the two fields match', async () => {
    render(<ResetPassword />)
    fireEvent.change(screen.getByTestId('new-password-input'), { target: { value: 'Deertrail77566!' } })
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /Set new password/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t match/)
    expect(calls).toHaveLength(0)
    fireEvent.change(screen.getByTestId('confirm-password-input'), { target: { value: 'Deertrail77566!' } })
    fireEvent.click(screen.getByRole('button', { name: /Set new password/ }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/auth/reset'))).toBe(true))
    expect(JSON.parse(calls[0].body)).toMatchObject({ userId: 'u1', token: 'abc', password: 'Deertrail77566!' })
  })
})
