import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OpsConsole from '@/app/ops/page'

const QUEUE = [
  {
    id: 'c1', title: 'Family Case Review', status: 'AWAITING_DOCS', lane: 'TRIAL',
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
    fireEvent.click(screen.getAllByText('Family Case Review').at(-1)!)
    await waitFor(() => expect(screen.getByText('delay ours marked')).toBeInTheDocument()) // de-snaked
    expect(screen.getByRole('button', { name: /Delete \(OPS-4\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /E-6 disclosure archive/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refund/ })).toBeInTheDocument()
  })
})
