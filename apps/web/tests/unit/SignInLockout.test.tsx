import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Sign-in lockout (2026-09-05): after five misses the server pauses the
 * email for 15 minutes. The person must be TOLD — with the minutes left —
 * instead of seeing the same "invalid password" they'd get for a typo.
 */

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(async () => ({ error: 'RateLimit:12', ok: false, status: 401, url: null })),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

import { SignInForm, mapAuthError } from '@/components/auth/SignInForm'

describe('sign-in lockout messaging', () => {
  it('mapAuthError states the minutes remaining, and defaults to 15', () => {
    expect(mapAuthError('RateLimit:12')).toMatch(/wait 12 minutes/)
    expect(mapAuthError('RateLimit:1')).toMatch(/wait 1 minute and/)
    expect(mapAuthError('RateLimit')).toMatch(/wait 15 minutes/)
    expect(mapAuthError('RateLimit:3')).toMatch(/Forgot password/)
    expect(mapAuthError('CredentialsSignin')).toMatch(/Invalid email or password/)
  })

  it('a locked email shows the pause message as an alert, not "invalid password"', async () => {
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'family@example.com' } })
    fireEvent.change(document.getElementById('password') as HTMLInputElement, { target: { value: 'Whatever123!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveTextContent(/Too many failed attempts/))
    expect(alert).toHaveTextContent(/wait 12 minutes/)
    expect(alert).not.toHaveTextContent(/Invalid email or password/)
  })
})
