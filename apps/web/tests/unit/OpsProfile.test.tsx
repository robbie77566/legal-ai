import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** Ops /profile (2026-09-09): first, last, phone, email, role, password — the
 *  page behind the header chip. Server actions are mocked; the page is real. */
const actions = vi.hoisted(() => ({
  profile: { email: 'robbie@snotnoselegal.com', role: 'ADMIN', name: 'Robbie Bruce', firstName: null, lastName: null, phone: null, passwordChangedAt: '2026-09-05T12:00:00Z', memberSince: '2026-08-29T12:00:00Z' },
  getProfile: vi.fn(async () => actions.profile),
  updateProfile: vi.fn(async (_prev: unknown, _fd: FormData) => ({ success: true })),
  changePassword: vi.fn(async (_prev: unknown, _fd: FormData) => ({ success: true })),
}))
vi.mock('@/app/dashboard/account/_actions', () => ({ getProfile: actions.getProfile, updateProfile: actions.updateProfile, changePassword: actions.changePassword }))
const update = vi.fn(async () => null)
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated', update }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/profile' }))

import ProfilePage from '@/app/ops/profile/page'

beforeEach(() => { actions.updateProfile.mockClear(); actions.changePassword.mockClear(); update.mockClear() })

describe('ops profile page', () => {
  it('shows email, role in words, and splits a legacy display name into first/last', async () => {
    render(<ProfilePage />)
    expect(await screen.findByTestId('profile-title')).toHaveTextContent('Robbie Bruce')
    expect(screen.getByTestId('profile-email')).toHaveTextContent('robbie@snotnoselegal.com')
    expect(screen.getByTestId('profile-role')).toHaveTextContent(/ADMIN — Ops administrator/)
    expect(screen.getByLabelText('First name')).toHaveValue('Robbie')
    expect(screen.getByLabelText('Last name')).toHaveValue('Bruce')
    expect(screen.getByTestId('password-section')).toHaveTextContent(/Last changed September 5, 2026/)
    expect(screen.getByRole('link', { name: /reset link/ })).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('saving sends first/last/phone to the server action and refreshes the session name', async () => {
    render(<ProfilePage />)
    await screen.findByTestId('profile-title')
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Robert' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+1 555 010 2020' } })
    fireEvent.click(screen.getByTestId('profile-save'))
    await waitFor(() => expect(actions.updateProfile).toHaveBeenCalled())
    const fd = actions.updateProfile.mock.calls[0][1]
    expect(fd.get('firstName')).toBe('Robert')
    expect(fd.get('lastName')).toBe('Bruce')
    expect(fd.get('phone')).toBe('+1 555 010 2020')
    await waitFor(() => expect(update).toHaveBeenCalledWith({ name: 'Robert Bruce' }))
    expect(await screen.findByTestId('profile-notice')).toHaveTextContent('Profile saved.')
  })

  it('password change: mismatch is caught on the page; a match calls the action and refreshes the JWT', async () => {
    render(<ProfilePage />)
    await screen.findByTestId('profile-title')
    fireEvent.click(screen.getByTestId('password-change'))
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPassword123!' } })
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'NewPassword123!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } })
    fireEvent.click(screen.getByTestId('password-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/don’t match/)
    expect(actions.changePassword).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword123!' } })
    fireEvent.click(screen.getByTestId('password-save'))
    await waitFor(() => expect(actions.changePassword).toHaveBeenCalled())
    await waitFor(() => expect(update).toHaveBeenCalledWith({ passwordChanged: true }))
  })
})
