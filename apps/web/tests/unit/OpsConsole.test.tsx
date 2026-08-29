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
      const body = u.endsWith('/ops/queue') ? QUEUE : u.includes('/timeline') ? TIMELINE : {}
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

    fireEvent.click(screen.getByText('Family Case Review'))
    await waitFor(() => expect(screen.getByText('delay.ours_marked')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Delete \(OPS-4\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /E-6 disclosure archive/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refund/ })).toBeInTheDocument()
  })
})
