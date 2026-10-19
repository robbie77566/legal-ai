import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DARK } from '@/lib/flags'

/**
 * F3 — the gate on every (counsel) page: when counsel_surfaces is off for
 * the tenant the page is the same "Not available" 404 the api answers
 * with (staff_console.md §10); a removed seat says so; otherwise the page.
 */
const ctx = vi.hoisted(() => ({ value: { me: null as unknown, flags: {} as Record<string, boolean>, seat: 'ok' as string, reload: () => {} } }))
vi.mock('@/components/counsel/CounselContext', () => ({ useCounsel: () => ctx.value }))
import CounselGate from '@/components/counsel/CounselGate'

const me = { user: { email: 'a@b.c' }, organisation: { kind: 'FIRM', name: 'Lopez Law' }, membership: { role: 'OWNER' } }

describe('<CounselGate />', () => {
  it('flag off for the tenant → the 404 "Not available" page, never the children', () => {
    ctx.value = { me, flags: { ...DARK }, seat: 'ok', reload: () => {} }
    render(<CounselGate><p>secret matters</p></CounselGate>)
    const page = screen.getByTestId('not-available')
    expect(page).toHaveTextContent('404')
    expect(page).toHaveTextContent('Not available')
    expect(screen.queryByText('secret matters')).toBeNull()
  })
  it('the api answering 404 on /counsel/me is the same page', () => {
    ctx.value = { me: null, flags: { ...DARK, counsel_surfaces: true }, seat: 'dark', reload: () => {} }
    render(<CounselGate><p>secret matters</p></CounselGate>)
    expect(screen.getByTestId('not-available')).toBeInTheDocument()
  })
  it('a removed seat is told so', () => {
    ctx.value = { me: null, flags: { ...DARK, counsel_surfaces: true }, seat: 'gone', reload: () => {} }
    render(<CounselGate><p>secret matters</p></CounselGate>)
    expect(screen.getByTestId('seat-gone')).toHaveTextContent('Your seat has been removed')
    expect(screen.queryByText('secret matters')).toBeNull()
  })
  it('loading shows nothing of the page yet', () => {
    ctx.value = { me: null, flags: { ...DARK }, seat: 'loading', reload: () => {} }
    render(<CounselGate><p>secret matters</p></CounselGate>)
    expect(screen.getByTestId('counsel-loading')).toBeInTheDocument()
    expect(screen.queryByText('secret matters')).toBeNull()
  })
  it('flag on and a live seat → the page', () => {
    ctx.value = { me, flags: { ...DARK, counsel_surfaces: true }, seat: 'ok', reload: () => {} }
    render(<CounselGate><p>secret matters</p></CounselGate>)
    expect(screen.getByText('secret matters')).toBeInTheDocument()
  })
})
