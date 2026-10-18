import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NextSteps from '@/app/(daybreak)/case/[caseId]/next-steps/page'

/**
 * Workstream I (share_link_ux.md "Delivering the packet to a clinic"): the
 * consent card can name a clinic whose inbox is live, and once consent is on
 * for that clinic the family can send the packet without uploading anything.
 * Without a live clinic the card is exactly what it was.
 */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), usePathname: () => '/case/case_1/next-steps' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))

const calls: Array<{ url: string; method: string; body: unknown }> = []
let clinics: Array<{ id: string; name: string }> = []
let grants: Array<{ id: string; recipientClass: string; recipientOrganisationId: string | null; revokedAt: string | null }> = []
beforeEach(() => {
  calls.length = 0
  clinics = []
  grants = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (u.endsWith('/packets/clinics')) return { ok: true, status: 200, json: async () => ({ clinics }) } as Response
    if (u.endsWith('/consent') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { recipientOrganisationId?: string }
      grants = [{ id: 'g1', recipientClass: 'clinic', recipientOrganisationId: body.recipientOrganisationId ?? null, revokedAt: null }]
      return { ok: true, status: 200, json: async () => ({ grant: grants[0] }) } as Response
    }
    if (u.endsWith('/consent')) return { ok: true, status: 200, json: async () => ({ grants }) } as Response
    if (u.endsWith('/consent/revoke')) { grants = grants.map((g) => ({ ...g, revokedAt: '2027-01-10T00:00:00Z' })); return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response }
    if (u.endsWith('/packets/deliver')) return { ok: true, status: 200, json: async () => ({ alreadyDelivered: false, delivery: { id: 'd1' } }) } as Response
    if (u.endsWith('/share-link/activity')) return { ok: true, status: 200, json: async () => ({ links: [] }) } as Response
    return { ok: true, status: 200, json: async () => ({}) } as Response
  }))
})

describe('consent card with a clinic inbox', () => {
  it('without a live clinic there is no picker and consent posts the class alone', async () => {
    render(<NextSteps />)
    await screen.findByText('Consent is OFF — nothing is shared')
    expect(screen.queryByTestId('clinic-picker')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/consent'))).toBe(true))
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/consent'))!
    expect(post.body).toEqual({ recipientClass: 'clinic' })
    expect(await screen.findByText('Consent is ON — sharing allowed')).toBeInTheDocument()
    expect(screen.queryByTestId('packet-deliver')).toBeNull()
  })

  it('names the clinic on the consent, then sends the packet to its inbox; turning consent off removes the button', async () => {
    clinics = [{ id: 'org_clinic', name: 'Innocence Clinic of Bexar' }, { id: 'org_other', name: 'Other Clinic' }]
    render(<NextSteps />)
    const picker = await screen.findByTestId('clinic-picker')
    expect(picker).toHaveTextContent('Any innocence clinic')
    expect(picker).toHaveTextContent('Innocence Clinic of Bexar')
    fireEvent.change(picker, { target: { value: 'org_clinic' } })
    fireEvent.click(screen.getByRole('checkbox'))
    const post = await waitFor(() => calls.find((c) => c.method === 'POST' && c.url.endsWith('/consent'))!)
    expect(post.body).toEqual({ recipientClass: 'clinic', recipientOrganisationId: 'org_clinic' })
    expect(await screen.findByText('Consent is ON — sharing allowed with Innocence Clinic of Bexar')).toBeInTheDocument()
    expect(screen.queryByTestId('clinic-picker')).toBeNull()

    fireEvent.click(screen.getByTestId('packet-deliver'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/packets/deliver'))).toBe(true))
    expect(calls.find((c) => c.url.endsWith('/packets/deliver'))!.body).toEqual({ clinicOrganisationId: 'org_clinic' })
    expect(await screen.findByTestId('packet-notice')).toHaveTextContent(/Sent\. Innocence Clinic of Bexar will find the packet in its inbox/)

    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/consent/revoke'))).toBe(true))
    expect(await screen.findByText('Consent is OFF — nothing is shared')).toBeInTheDocument()
    expect(screen.queryByTestId('packet-deliver')).toBeNull()
  })
})
