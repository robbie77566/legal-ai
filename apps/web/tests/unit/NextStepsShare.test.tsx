import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NextSteps from '@/app/(daybreak)/case/[caseId]/next-steps/page'

/** 2026-09-13: the lawyer link could be created but not copied or sent. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), usePathname: () => '/case/case_1/next-steps' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))

const calls: string[] = []
let links: Array<{ createdAt: string; expiresAt: string; revokedAt: string | null; opens: number }> = []
beforeEach(() => {
  calls.length = 0
  links = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    if (u.endsWith('/consent')) return { ok: true, status: 200, json: async () => ({ grants: [] }) } as Response
    if (u.endsWith('/share-link/activity')) return { ok: true, status: 200, json: async () => ({ links }) } as Response
    if (u.endsWith('/share-link/revoke')) { links = links.map((l) => ({ ...l, revokedAt: '2026-09-13T00:00:00Z' })); return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response }
    if (u.endsWith('/share-link')) { links = [{ createdAt: '2026-09-13T10:00:00Z', expiresAt: '2026-10-13T10:00:00Z', revokedAt: null, opens: 0 }]; return { ok: true, status: 200, json: async () => ({ token: 'tok123', expiresAt: '2026-10-13T10:00:00Z' }) } as Response }
    return { ok: true, status: 200, json: async () => ({}) } as Response
  }))
})

describe('share the packet with a lawyer', () => {
  it('after creating, the link can be copied, emailed, and turned off; the expiry is shown', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<NextSteps />)
    fireEvent.click(await screen.findByTestId('share-create'))
    const url = await screen.findByTestId('share-url')
    expect(url).toHaveTextContent('/shared/tok123')
    expect(screen.getByTestId('share-ready')).toHaveTextContent(/Works until October 13/)
    fireEvent.click(screen.getByTestId('share-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/shared/tok123')))
    expect(await screen.findByText('✓ Copied')).toBeInTheDocument()
    const mail = screen.getByTestId('share-email').getAttribute('href') ?? ''
    expect(mail.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(mail)).toContain('/shared/tok123')
    expect(decodeURIComponent(mail)).toContain('expires October 13')
    fireEvent.click(screen.getByTestId('share-revoke'))
    await waitFor(() => expect(calls).toContain('POST http://localhost:3001/cases/case_1/share-link/revoke'))
    expect(await screen.findByText(/The link is off/)).toBeInTheDocument()
    expect(screen.queryByTestId('share-url')).toBeNull()
  })

  it('a link from an earlier visit shows its status honestly and offers a new one (which replaces it)', async () => {
    links = [{ createdAt: '2026-09-10T10:00:00Z', expiresAt: '2026-10-10T10:00:00Z', revokedAt: null, opens: 2 }]
    render(<NextSteps />)
    const active = await screen.findByTestId('share-active')
    expect(active).toHaveTextContent(/created September 10, works until October 10/)
    expect(active).toHaveTextContent(/don’t keep a copy/)
    expect(screen.getByText(/Opened 2 times/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('share-create'))
    await waitFor(() => expect(screen.getByTestId('share-url')).toHaveTextContent('/shared/tok123'))
    const revokeIdx = calls.indexOf('POST http://localhost:3001/cases/case_1/share-link/revoke')
    const createIdx = calls.indexOf('POST http://localhost:3001/cases/case_1/share-link')
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(revokeIdx)
  })

  it('offers the phone share sheet only when the browser has one', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => {}), configurable: true })
    render(<NextSteps />)
    fireEvent.click(await screen.findByTestId('share-create'))
    await screen.findByTestId('share-url')
    fireEvent.click(screen.getByTestId('share-native'))
    await waitFor(() => expect((navigator as Navigator & { share: ReturnType<typeof vi.fn> }).share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/shared/tok123') })))
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
})
