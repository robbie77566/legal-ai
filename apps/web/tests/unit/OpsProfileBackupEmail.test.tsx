import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** Ops /profile "Backup email" card (your_account "Backup email (2026-10-24)"):
 *  the three states — none, pending, verified — and the server action each
 *  button calls. Actions are mocked; the page is real. */
const base = { email: 'staff@example.com', role: 'ADMIN', name: 'Sam Staff', firstName: 'Sam', lastName: 'Staff', phone: null, passwordChangedAt: null, memberSince: '2026-08-29T12:00:00Z' }
const actions = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  getProfile: vi.fn(async () => actions.profile),
  updateProfile: vi.fn(async () => ({ success: true })),
  changePassword: vi.fn(async () => ({ success: true })),
  addBackupEmail: vi.fn(async (_prev: unknown, fd: FormData) => ({ success: true, backupEmail: String(fd.get('email')).toLowerCase() })),
  resendBackupEmailLink: vi.fn(async () => ({ success: true, backupEmail: 'backup@example.com' })),
  removeBackupEmail: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/app/ops/profile/_actions', () => ({
  getProfile: actions.getProfile, updateProfile: actions.updateProfile, changePassword: actions.changePassword,
  addBackupEmail: actions.addBackupEmail, resendBackupEmailLink: actions.resendBackupEmailLink, removeBackupEmail: actions.removeBackupEmail,
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated', update: vi.fn() }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/profile' }))

import ProfilePage from '@/app/ops/profile/page'

const setProfile = (extra: Record<string, unknown>) => { actions.profile = { ...base, backupEmail: null, backupEmailVerifiedAt: null, backupEmailAddedAt: null, ...extra } }
beforeEach(() => { actions.addBackupEmail.mockClear(); actions.resendBackupEmailLink.mockClear(); actions.removeBackupEmail.mockClear() })

describe('ops profile — backup email card', () => {
  it('none: explains the purpose, offers the input and "Add backup email", and the add calls the action with the address', async () => {
    setProfile({})
    render(<ProfilePage />)
    const card = await screen.findByTestId('backup-email-section')
    expect(card).toHaveTextContent('Used to reach you if you lose access to your main address. Password-reset links can go to it once it is verified.')
    expect(screen.getByTestId('backup-email-state')).toHaveTextContent('None')
    expect(screen.queryByTestId('backup-email-resend')).toBeNull()
    expect(screen.queryByTestId('backup-email-remove')).toBeNull()
    expect(screen.queryByTestId('backup-email-change')).toBeNull()

    fireEvent.change(screen.getByTestId('backup-email-input'), { target: { value: 'Backup@example.com' } })
    fireEvent.click(screen.getByTestId('backup-email-add'))
    await waitFor(() => expect(actions.addBackupEmail).toHaveBeenCalled())
    expect(actions.addBackupEmail.mock.calls[0][1].get('email')).toBe('Backup@example.com')
    expect(await screen.findByTestId('profile-notice')).toHaveTextContent('We sent a link to backup@example.com')
    expect(actions.getProfile).toHaveBeenCalledTimes(2) // reloaded after the write
  })

  it('pending: shows the address, since when, "Resend link" and "Remove" — each calling its action', async () => {
    setProfile({ backupEmail: 'backup@example.com', backupEmailAddedAt: '2026-10-24T10:00:00Z' })
    render(<ProfilePage />)
    const state = await screen.findByTestId('backup-email-state')
    expect(state).toHaveTextContent('backup@example.com')
    expect(state).toHaveTextContent(/pending verification since October 24, 2026/)
    expect(screen.queryByTestId('backup-email-change')).toBeNull()
    expect(screen.queryByTestId('backup-email-input')).toBeNull() // re-adding is "Resend", not a second form

    fireEvent.click(screen.getByTestId('backup-email-resend'))
    await waitFor(() => expect(actions.resendBackupEmailLink).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('profile-notice')).toHaveTextContent('We sent a new link to backup@example.com.')

    fireEvent.click(screen.getByTestId('backup-email-remove'))
    await waitFor(() => expect(actions.removeBackupEmail).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('profile-notice')).toHaveTextContent('Backup email removed.')
  })

  it('verified: shows the date, "Change" reveals the form (which calls add), and "Remove" calls remove', async () => {
    setProfile({ backupEmail: 'backup@example.com', backupEmailVerifiedAt: '2026-10-25T09:00:00Z' })
    render(<ProfilePage />)
    const state = await screen.findByTestId('backup-email-state')
    expect(state).toHaveTextContent('backup@example.com · verified on October 25, 2026')
    expect(screen.queryByTestId('backup-email-resend')).toBeNull()
    expect(screen.queryByTestId('backup-email-input')).toBeNull()

    fireEvent.click(screen.getByTestId('backup-email-change'))
    fireEvent.change(screen.getByTestId('backup-email-input'), { target: { value: 'other@example.com' } })
    fireEvent.click(screen.getByTestId('backup-email-add'))
    await waitFor(() => expect(actions.addBackupEmail).toHaveBeenCalled())
    expect(actions.addBackupEmail.mock.calls[0][1].get('email')).toBe('other@example.com')

    fireEvent.click(screen.getByTestId('backup-email-remove'))
    await waitFor(() => expect(actions.removeBackupEmail).toHaveBeenCalledTimes(1))
  })

  it('an api refusal shows in the page notice, in the error tone', async () => {
    setProfile({})
    actions.addBackupEmail.mockResolvedValueOnce({ success: false, error: "That address can't be used as a backup here" } as never)
    render(<ProfilePage />)
    await screen.findByTestId('backup-email-section')
    fireEvent.change(screen.getByTestId('backup-email-input'), { target: { value: 'taken@example.com' } })
    fireEvent.click(screen.getByTestId('backup-email-add'))
    const notice = await screen.findByTestId('profile-notice')
    expect(notice).toHaveTextContent("That address can't be used as a backup here")
    expect(notice).toHaveStyle({ color: '#F85149' })
  })
})
