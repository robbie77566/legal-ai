import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SessionContext } from 'next-auth/react'
import { LangProvider } from '@/lib/i18n'
import { BACKUP_EMAIL_CONTENT } from '@/lib/content/backup-email'
import AccountPage from '@/app/(daybreak)/account/page'

/** The family's "Backup email" row (your_account "Backup email (2026-10-24)"):
 *  Daybreak voice in en and es with structural parity, the three states, and
 *  the api calls behind add / resend / remove. */
const user = (extra: Record<string, unknown> = {}) => ({
  name: 'Jo Whitfield', email: 'jo@example.com', pendingEmail: null, passwordChangedAt: null, memberSince: '2026-06-01T00:00:00Z',
  backupEmail: null, backupEmailVerified: false, backupEmailVerifiedAt: null, backupEmailAddedAt: null, ...extra,
})
const state = vi.hoisted(() => ({ me: {} as Record<string, unknown>, calls: [] as Array<{ url: string; init?: RequestInit }> }))
vi.mock('@/lib/api', () => ({
  API_URL: 'http://api.test',
  apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
    state.calls.push({ url, init })
    if (url === '/me' && !init) return new Response(JSON.stringify(state.me), { status: 200 })
    if (url === '/me/backup-email' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { email: string }
      return new Response(JSON.stringify({ ok: true, backupEmail: body.email.toLowerCase(), backupEmailVerified: false }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }),
}))
vi.mock('next-auth/react', async (orig) => ({ ...(await orig<typeof import('next-auth/react')>()), useSession: () => ({ data: null, status: 'authenticated', update: vi.fn() }), signOut: vi.fn() }))

const setMe = (u: Record<string, unknown>) => { state.me = { user: u, reviews: [], payments: [], refunds: [], acks: [], deletionRequest: null } }
const wrap = (ui: React.ReactElement, lang: 'en' | 'es' = 'en') => {
  window.history.replaceState({}, '', `/account?lang=${lang}`)
  return render(
    <LangProvider>
      <SessionContext.Provider value={{ data: { user: state.me.user, expires: '2027-01-01' }, status: 'authenticated', update: vi.fn() } as never}>{ui}</SessionContext.Provider>
    </LangProvider>
  )
}

/** Recursive structural parity: every en key/shape has an es twin (i18n R7a). */
function assertParity(en: unknown, es: unknown, path = ''): void {
  expect(typeof es, path).toBe(typeof en)
  if (Array.isArray(en)) {
    expect((es as unknown[]).length, `${path}.length`).toBe(en.length)
    en.forEach((item, i) => assertParity(item, (es as unknown[])[i], `${path}[${i}]`))
  } else if (en && typeof en === 'object') {
    const ek = Object.keys(en as object).sort()
    expect(Object.keys(es as object).sort(), path).toEqual(ek)
    for (const k of ek) assertParity((en as Record<string, unknown>)[k], (es as Record<string, unknown>)[k], `${path}.${k}`)
  } else if (typeof en === 'string') {
    // Every {placeholder} in en appears in es, so tpl() fills both the same way.
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    expect(holes(es as string), `${path} placeholders`).toEqual(holes(en))
  }
}

beforeEach(() => { state.calls.length = 0; window.localStorage.clear() })

describe('Your account — backup email row', () => {
  it('the copy ships in both languages with structural parity', () => {
    assertParity(BACKUP_EMAIL_CONTENT.en, BACKUP_EMAIL_CONTENT.es, 'backup-email')
  })

  it('none (en): "Not set", the one explanatory sentence, and adding posts the address', async () => {
    setMe(user())
    wrap(<AccountPage />)
    const row = await screen.findByTestId('backup-email-row')
    expect(row).toHaveTextContent('Backup email')
    expect(row).toHaveTextContent('Not set')
    expect(row).toHaveTextContent(BACKUP_EMAIL_CONTENT.en.explain)
    fireEvent.click(screen.getByTestId('backup-email-open'))
    fireEvent.change(screen.getByLabelText('Backup email address'), { target: { value: 'Backup@example.com' } })
    fireEvent.click(screen.getByTestId('backup-email-add'))
    await waitFor(() => expect(state.calls.some((c) => c.url === '/me/backup-email' && c.init?.method === 'POST')).toBe(true))
    const post = state.calls.find((c) => c.url === '/me/backup-email')!
    expect(JSON.parse(String(post.init?.body))).toEqual({ email: 'Backup@example.com' })
    expect(await screen.findByTestId('notice')).toHaveTextContent('We sent a link to backup@example.com. Your backup email starts working once you open it.')
  })

  it('none (es): the same row in Spanish', async () => {
    setMe(user())
    wrap(<AccountPage />, 'es')
    const row = await screen.findByTestId('backup-email-row')
    expect(row).toHaveTextContent('Correo de respaldo')
    expect(row).toHaveTextContent('No configurado')
    expect(row).toHaveTextContent(BACKUP_EMAIL_CONTENT.es.explain)
    expect(screen.getByTestId('backup-email-open')).toHaveTextContent('Agregar correo de respaldo')
  })

  it('pending: names the address and the date, "Resend link" re-posts it, "Remove" deletes', async () => {
    setMe(user({ backupEmail: 'backup@example.com', backupEmailAddedAt: '2026-10-24T10:00:00Z' }))
    wrap(<AccountPage />)
    const pending = await screen.findByTestId('backup-email-pending')
    expect(pending).toHaveTextContent('Pending — check backup@example.com for a link we sent October 24.')
    fireEvent.click(screen.getByTestId('backup-email-resend'))
    await waitFor(() => expect(state.calls.some((c) => c.url === '/me/backup-email' && c.init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(state.calls.find((c) => c.url === '/me/backup-email')!.init?.body))).toEqual({ email: 'backup@example.com' })
    expect(await screen.findByTestId('notice')).toHaveTextContent('We sent a new link to backup@example.com.')

    fireEvent.click(screen.getByTestId('backup-email-remove'))
    await waitFor(() => expect(state.calls.some((c) => c.url === '/me/backup-email' && c.init?.method === 'DELETE')).toBe(true))
    expect(await screen.findByTestId('notice')).toHaveTextContent('Backup email removed.')
  })

  it('pending (es): the Spanish line with a Spanish date', async () => {
    setMe(user({ backupEmail: 'backup@example.com', backupEmailAddedAt: '2026-10-24T10:00:00Z' }))
    wrap(<AccountPage />, 'es')
    const pending = await screen.findByTestId('backup-email-pending')
    expect(pending).toHaveTextContent(/Pendiente — revise backup@example.com: le enviamos un enlace el 24 de octubre\./)
    expect(screen.getByTestId('backup-email-resend')).toHaveTextContent('Reenviar enlace')
    expect(screen.getByTestId('backup-email-remove')).toHaveTextContent('Quitar')
    expect(screen.getByTestId('backup-email-change')).toHaveTextContent('Cambiar')
  })

  it('verified: shows the date; "Change" opens the form and no resend is offered', async () => {
    setMe(user({ backupEmail: 'backup@example.com', backupEmailVerified: true, backupEmailVerifiedAt: '2026-10-25T09:00:00Z' }))
    wrap(<AccountPage />)
    const v = await screen.findByTestId('backup-email-verified')
    expect(v).toHaveTextContent('backup@example.com · verified October 25')
    expect(screen.queryByTestId('backup-email-resend')).toBeNull()
    fireEvent.click(screen.getByTestId('backup-email-change'))
    expect(screen.getByLabelText('Backup email address')).toBeInTheDocument()
    expect(screen.getByTestId('backup-email-add')).toHaveTextContent('Add backup email')
  })
})
