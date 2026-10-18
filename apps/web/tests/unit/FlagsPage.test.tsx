import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/flags' }))
const session = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: session.role, email: 'robbie@snotnoselegal.com' } }, status: 'authenticated' }), signOut: vi.fn() }))
import FlagsPage from '@/app/ops/flags/page'
import { useFlags, DARK } from '@/lib/flags'

/** /ops/flags (staff_console.md §10): the six flags, a global toggle for
 *  admins, overrides per flag with tenant id + note; SUPPORT sees it read-only. */
const FLAGS = [
  { key: 'counsel_surfaces', enabled: true, description: 'Counsel-facing web surfaces', updatedBy: 'u_admin', updatedAt: '2026-10-18T00:00:00Z', overrides: [{ tenantId: 't_bexar', enabled: false, note: 'hold Bexar back', updatedBy: 'u_admin', updatedAt: '2026-10-18T00:00:00Z' }] },
  { key: 'counsel_checkout', enabled: false, description: 'Counsel checkout', updatedBy: null, updatedAt: '2026-10-18T00:00:00Z', overrides: [] },
  { key: 'offices', enabled: false, description: 'PD office organisations', updatedBy: null, updatedAt: '2026-10-18T00:00:00Z', overrides: [] },
  { key: 'record_desk', enabled: false, description: 'Record Desk', updatedBy: null, updatedAt: '2026-10-18T00:00:00Z', overrides: [] },
  { key: 'clinic_inbox', enabled: false, description: 'Clinic inbox', updatedBy: null, updatedAt: '2026-10-18T00:00:00Z', overrides: [] },
  { key: 'long_records', enabled: false, description: 'Long records', updatedBy: null, updatedAt: '2026-10-18T00:00:00Z', overrides: [] },
]
const calls: Array<{ url: string; init?: RequestInit }> = []
beforeEach(() => {
  calls.length = 0
  session.role = 'ADMIN'
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return { ok: true, status: 200, json: async () => (String(url).endsWith('/ops/flags') ? FLAGS : { ok: true }) } as Response
  }))
})

describe('flags page', () => {
  it('lists the six flags with global state and overrides; ADMIN toggles the global switch with a PUT', async () => {
    render(<FlagsPage />)
    expect(await screen.findByTestId('flag-global-counsel_surfaces')).toHaveTextContent('ON')
    for (const key of ['counsel_checkout', 'offices', 'record_desk', 'clinic_inbox', 'long_records']) {
      expect(screen.getByTestId(`flag-global-${key}`)).toHaveTextContent('off')
    }
    expect(screen.getByTestId('flag-overrides-counsel_surfaces')).toHaveTextContent('t_bexar')
    expect(screen.getByTestId('flag-overrides-counsel_surfaces')).toHaveTextContent('hold Bexar back')

    fireEvent.click(screen.getByTestId('flag-toggle-counsel_surfaces'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/flags/counsel_surfaces') && c.init?.method === 'PUT')).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/ops/flags/counsel_surfaces'))!.init!.body))).toEqual({ enabled: false })
    expect(await screen.findByTestId('flags-notice')).toHaveTextContent('counsel_surfaces is now OFF')
  })

  it('ADMIN adds an override (tenant id, value, note) and removes one', async () => {
    render(<FlagsPage />)
    await screen.findByTestId('flag-global-offices')
    fireEvent.change(screen.getByLabelText('offices override tenant id'), { target: { value: 't_harris' } })
    fireEvent.change(screen.getByLabelText('offices override value'), { target: { value: 'on' } })
    fireEvent.change(screen.getByLabelText('offices override note'), { target: { value: 'pilot office' } })
    fireEvent.submit(screen.getByTestId('flag-override-form-offices'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/flags/offices/overrides/t_harris') && c.init?.method === 'PUT')).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/ops/flags/offices/overrides/t_harris'))!.init!.body))).toEqual({ enabled: true, note: 'pilot office' })

    fireEvent.click(screen.getByTestId('flag-override-remove-counsel_surfaces-t_bexar'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/ops/flags/counsel_surfaces/overrides/t_bexar') && c.init?.method === 'DELETE')).toBe(true))
  })

  it('a failed write is reported, not swallowed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return { ok: false, status: 403, json: async () => ({ error: 'Support can view cases and unblock them — money, deletion, and settings need an Ops administrator' }) } as Response
      return { ok: true, status: 200, json: async () => FLAGS } as Response
    }))
    render(<FlagsPage />)
    fireEvent.click(await screen.findByTestId('flag-toggle-offices'))
    expect(await screen.findByTestId('flags-notice')).toHaveTextContent(/need an Ops administrator/)
  })

  it('SUPPORT sees the table read-only: no toggles, no override forms, no remove links', async () => {
    session.role = 'SUPPORT'
    render(<FlagsPage />)
    expect(await screen.findByTestId('flag-global-counsel_surfaces')).toHaveTextContent('ON')
    expect(screen.getByTestId('flag-overrides-counsel_surfaces')).toHaveTextContent('t_bexar')
    expect(screen.queryByTestId('flag-toggle-counsel_surfaces')).toBeNull()
    expect(screen.queryByTestId('flag-override-form-offices')).toBeNull()
    expect(screen.queryByTestId('flag-override-remove-counsel_surfaces-t_bexar')).toBeNull()
    expect(screen.getByText(/needs an Ops administrator/)).toBeInTheDocument()
  })
})

describe('useFlags', () => {
  function Probe() {
    const { flags, loaded } = useFlags()
    return <div data-testid="probe">{loaded ? 'loaded' : 'loading'} {flags.counsel_surfaces ? 'lit' : 'dark'}</div>
  }

  it('is all-dark until /flags answers, then reflects the effective map; a failed fetch stays dark', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...DARK, counsel_surfaces: true }) }) as Response))
    render(<Probe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('loading dark')
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('loaded lit'))

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response))
    render(<Probe />)
    await waitFor(() => expect(screen.getAllByTestId('probe')[1]).toHaveTextContent('loaded dark'))
  })
})
