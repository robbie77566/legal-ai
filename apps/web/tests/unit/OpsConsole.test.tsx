import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OpsConsole from '@/app/ops/page'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated' }) }))

const QUEUE = [
  {
    id: 'c1', title: 'Case review', label: 'Harris County · 2019', ref: 'ABC123', customerName: 'Maria Delgado', customerEmail: 'maria@example.com', status: 'AWAITING_DOCS', lane: 'TRIAL',
    daysInStage: 9, stalled: true, ocrHalt: false, delayOurs: true, subsequentWrit: true,
  },
]
const TIMELINE = [
  { id: '1', type: 'case.created', payload: {}, actor: 'system', createdAt: '2026-08-29T10:00:00Z' },
  { id: '2', type: 'delay.ours_marked', payload: {}, actor: 'admin_1', createdAt: '2026-08-29T11:00:00Z' },
]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      // The redesigned overview also loads /ops/status, /qa/holds and /cogs.
      const body = u.endsWith('/ops/queue') ? QUEUE
        : u.includes('/timeline') ? TIMELINE
        : u.endsWith('/ops/status') ? {
            email: { configured: true, from: 'x@y' }, stripe: 'test', autoApprove: true, malwareScan: true,
            sentry: false, posthog: false, pipeline: { awaitingDocs: 1, digitizing: 0, analyzing: 0, held: 0, ready: 0 }, retentionCandidates: 0,
          }
        : u.endsWith('/qa/holds') ? []
        : u.endsWith('/cogs') ? { totalUsd: 0 }
        : {}
      return { ok: true, json: async () => body } as Response
    })
  )
})

describe('Ops console (US-9)', () => {
  it('renders the queue with stall/hold chips and opens the event timeline with actions', async () => {
    render(<OpsConsole />)
    expect(await screen.findByText('STALL')).toBeInTheDocument()
    expect(screen.getByText('DELAY-OURS')).toBeInTheDocument()
    expect(screen.getByText('§4')).toBeInTheDocument()

    // The stalled case appears in "Needs you now" AND the table — open via the table row.
    fireEvent.click(screen.getAllByText('Maria Delgado').at(-1)!)
    await waitFor(() => expect(screen.getByText('delay ours marked')).toBeInTheDocument()) // de-snaked
    expect(screen.getByRole('button', { name: /Delete \(OPS-4\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /E-6 disclosure archive/ })).toBeInTheDocument()
    // Refunds moved to the Money page's dialog (payments_and_refunds spec); the drawer links there.
    expect(screen.getByRole('link', { name: /Refund/ })).toHaveAttribute('href', '/ops/money?case=c1')
  })

  it('the delete confirmation needs the case reference — not the title every case shares', async () => {
    render(<OpsConsole />)
    fireEvent.click((await screen.findAllByText('Maria Delgado')).at(-1)!)
    await waitFor(() => expect(screen.getByTestId('case-drawer')).toBeInTheDocument())
    const box = screen.getByTestId('delete-typed')
    const del = screen.getByTestId('delete-case')

    // 'Case review' is the constant Case.title on EVERY case — typing it used
    // to arm delete for any case in the queue.
    fireEvent.change(box, { target: { value: 'Case review' } })
    expect(del).toBeDisabled()

    // The reference identifies this one case.
    fireEvent.change(box, { target: { value: 'ABC123' } })
    expect(del).toBeEnabled()
  })
})
