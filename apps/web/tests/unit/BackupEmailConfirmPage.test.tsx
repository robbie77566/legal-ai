import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LangProvider } from '@/lib/i18n'
import BackupEmailConfirm from '@/app/(auth)/auth/backup-email/confirm/page'

/** /auth/backup-email/confirm (your_account "Backup email (2026-10-24)"):
 *  posts the token from the link, says what happened, links to sign in. */
const nav = vi.hoisted(() => ({ search: 'token=abc123' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }))
const calls: Array<{ url: string; body: string }> = []
const answer = vi.hoisted(() => ({ ok: true, status: 200, body: {} as Record<string, unknown> }))
beforeEach(() => {
  calls.length = 0
  nav.search = 'token=abc123'
  answer.ok = true; answer.status = 200; answer.body = { ok: true, backupEmail: 'backup@example.com' }
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return { ok: answer.ok, status: answer.status, json: async () => answer.body } as Response
  }))
})

describe('backup email confirm page', () => {
  it('success: posts the token (no session), names the verified address, links to sign in', async () => {
    render(<BackupEmailConfirm />)
    const done = await screen.findByTestId('backup-confirm-done')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/me\/backup-email\/confirm$/)
    expect(JSON.parse(calls[0].body)).toEqual({ token: 'abc123' })
    expect(done).toHaveTextContent('Your backup email is verified')
    expect(done).toHaveTextContent('backup@example.com can receive password-reset links')
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/auth/signin')
  })

  it("failure: shows the api's message and still links to sign in", async () => {
    answer.ok = false; answer.status = 400; answer.body = { error: 'This link is invalid or has expired — add the backup email again from your account page to get a new one.' }
    render(<BackupEmailConfirm />)
    const err = await screen.findByTestId('backup-confirm-error')
    expect(err).toHaveTextContent('We couldn’t confirm that')
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/)
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/auth/signin')
  })

  it('no token: nothing is posted; the page says the link is incomplete', async () => {
    nav.search = ''
    render(<BackupEmailConfirm />)
    expect(await screen.findByTestId('backup-confirm-error')).toHaveTextContent('This link isn’t complete')
    expect(calls).toHaveLength(0)
  })

  it('reads in Spanish under the auth layout’s language switch', async () => {
    window.history.replaceState({}, '', '/auth/backup-email/confirm?lang=es&token=abc123')
    render(<LangProvider><BackupEmailConfirm /></LangProvider>)
    expect(await screen.findByTestId('backup-confirm-done')).toHaveTextContent('Su correo de respaldo está verificado')
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/auth/signin')
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
  })
})
