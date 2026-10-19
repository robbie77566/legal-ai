import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { navItemsFor, professionalStatus } from '@/lib/counsel'
import { DARK } from '@/lib/flags'

/**
 * F3 — ProfessionalNav items per organisation kind and flags
 * (persona_rollout_plan.md §5 F): Matters · Organisation · Inbox (CLINIC
 * only) · Record Desk (when record_desk is on) · Account. Never a family or
 * staff item.
 */
const ctx = vi.hoisted(() => ({ value: { me: null as unknown, flags: { ...({} as Record<string, boolean>) }, seat: 'ok', reload: () => {} } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/counsel/org' }))
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))
vi.mock('@/components/counsel/CounselContext', () => ({ useCounsel: () => ctx.value }))
import ProfessionalNav from '@/components/counsel/ProfessionalNav'

const labels = (kind: Parameters<typeof navItemsFor>[0], flags: Partial<typeof DARK>) => navItemsFor(kind, { ...DARK, ...flags }).map((i) => i.label)

describe('navItemsFor', () => {
  it('a firm with everything dark: Matters · Organisation · Account', () => {
    expect(labels('FIRM', {})).toEqual(['Matters', 'Organisation', 'Account'])
  })
  it('Record Desk appears for any kind when record_desk is on', () => {
    expect(labels('FIRM', { record_desk: true })).toEqual(['Matters', 'Organisation', 'Record Desk', 'Account'])
    expect(labels('PD_OFFICE', { record_desk: true })).toContain('Record Desk')
  })
  it('Inbox appears only for a CLINIC with clinic_inbox on', () => {
    expect(labels('CLINIC', { clinic_inbox: true })).toEqual(['Matters', 'Organisation', 'Inbox', 'Account'])
    expect(labels('CLINIC', {})).not.toContain('Inbox')
    expect(labels('PD_OFFICE', { clinic_inbox: true })).not.toContain('Inbox')
    expect(labels('FIRM', { clinic_inbox: true })).not.toContain('Inbox')
  })
  it('the seat not loaded yet still shows the three fixed items', () => {
    expect(labels(null, { clinic_inbox: true, record_desk: true })).toEqual(['Matters', 'Organisation', 'Record Desk', 'Account'])
  })
  it('never carries a family or staff destination', () => {
    const hrefs = navItemsFor('CLINIC', { ...DARK, clinic_inbox: true, record_desk: true }).map((i) => i.href)
    expect(hrefs.every((h) => h.startsWith('/counsel'))).toBe(true)
    for (const h of hrefs) {
      expect(h).not.toMatch(/^\/(ops|qa|account|cases|case|check|review)/)
    }
  })
})

describe('<ProfessionalNav />', () => {
  it('renders the organisation name, the items for its kind and flags, the current page and a sign-out', () => {
    ctx.value = {
      me: { user: { email: 'maria@bexar.example' }, organisation: { kind: 'CLINIC', name: 'Innocence Clinic' }, membership: { role: 'OWNER' } },
      flags: { ...DARK, counsel_surfaces: true, clinic_inbox: true },
      seat: 'ok',
      reload: () => {},
    }
    render(<ProfessionalNav />)
    expect(screen.getByTestId('nav-organisation')).toHaveTextContent('Innocence Clinic')
    const nav = screen.getByTestId('professional-nav')
    expect(nav).toHaveTextContent('Matters')
    expect(nav).toHaveTextContent('Inbox')
    expect(nav).not.toHaveTextContent('Record Desk')
    expect(screen.getByRole('link', { name: 'Organisation' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/counsel/inbox')
    expect(screen.getByTestId('professional-sign-out')).toBeInTheDocument()
    expect(screen.queryByText('Your reviews')).toBeNull()
    expect(screen.queryByText('Start the free check')).toBeNull()
  })
})

describe('professionalStatus', () => {
  it('uses professional wording, never the family stage copy', () => {
    expect(professionalStatus('AWAITING_DOCS')).toBe('Awaiting record')
    expect(professionalStatus('QUOTED')).toBe('Quoted — awaiting acceptance')
    expect(professionalStatus('ANALYZING')).toBe('Analysis running')
    expect(professionalStatus('READY')).toBe('Packet ready')
    expect(professionalStatus('DELIVERED')).toBe('Packet delivered')
  })
})
