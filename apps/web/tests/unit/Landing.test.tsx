import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { landingFor } from '@/lib/landing'

/** A2 — an attorney who signed up through /counsel/signup lands on /counsel from /go, never on /qa. */
describe('landingFor', () => {
  it('PROFESSIONAL → /counsel, whatever the legacy role column says', () => {
    expect(landingFor({ role: 'CLIENT', accountKind: 'PROFESSIONAL' })).toBe('/counsel')
    expect(landingFor({ role: 'ATTORNEY', accountKind: 'PROFESSIONAL' })).toBe('/counsel')
  })

  it('staff and family routing is unchanged', () => {
    expect(landingFor({ role: 'ATTORNEY', accountKind: 'STAFF' })).toBe('/qa')
    expect(landingFor({ role: 'ADMIN', accountKind: 'STAFF' })).toBe('/ops')
    expect(landingFor({ role: 'SUPPORT', accountKind: 'STAFF' })).toBe('/ops')
    expect(landingFor({ role: 'CLIENT', accountKind: 'FAMILY' })).toBe('/account')
    // Sessions issued before the expand step carry no accountKind.
    expect(landingFor({ role: 'ATTORNEY' })).toBe('/qa')
    expect(landingFor({ role: 'CLIENT' })).toBe('/account')
    expect(landingFor({})).toBe('/account')
  })
})

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  session: { data: null as unknown, status: 'loading' as string },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next-auth/react', () => ({ useSession: () => mocks.session }))

import Go from '@/app/go/page'

describe('/go applies landingFor', () => {
  beforeEach(() => { mocks.replace.mockClear() })

  it('sends a signed-in professional to /counsel', async () => {
    mocks.session = { status: 'authenticated', data: { user: { role: 'CLIENT', accountKind: 'PROFESSIONAL' } } }
    render(<Go />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/counsel'))
    expect(mocks.replace).not.toHaveBeenCalledWith('/qa')
  })

  it('still sends a staff reviewer to /qa', async () => {
    mocks.session = { status: 'authenticated', data: { user: { role: 'ATTORNEY', accountKind: 'STAFF' } } }
    render(<Go />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/qa'))
  })
})
