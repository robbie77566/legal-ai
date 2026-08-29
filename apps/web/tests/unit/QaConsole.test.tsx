import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QaConsole from '@/app/qa/page'

const QUEUE = [
  { id: 'c1', title: 'Family Case Review', lane: 'TRIAL', subsequentWrit: true, findingCount: 2, updatedAt: '' },
]
const DETAIL = {
  case: { id: 'c1', title: 'Family Case Review', lane: 'TRIAL', status: 'QA_REVIEW', subsequentWrit: true },
  run: { id: 'r1' },
  findings: [
    {
      id: 'f1', category: 'junk_science', severity: 'dispositive', confidence: 0.9,
      adjudication: 'not_run', provenance: 'ai',
      partAText: 'Plain English text.', partBText: 'Attorney text.',
      citations: [{ volume: 'RR3', page: 214, excerpt: 'quoted record text', excerptHash: 'a'.repeat(64) }],
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      const body = u.endsWith('/qa/queue') ? QUEUE : u.includes('/qa/cases/') ? DETAIL : {}
      return { ok: true, json: async () => body } as Response
    })
  )
})

describe('QA console (US-8)', () => {
  it('renders the queue and opens a case with citation, hash, and both report parts', async () => {
    render(<QaConsole />)
    const row = await screen.findByText('Family Case Review')
    fireEvent.click(row)

    await waitFor(() => expect(screen.getByText(/quoted record text/)).toBeInTheDocument())
    expect(screen.getByText(/RR3 p\.214/)).toBeInTheDocument()
    expect(screen.getByText('Plain English text.')).toBeInTheDocument()
    expect(screen.getByText('Attorney text.')).toBeInTheDocument()
    expect(screen.getAllByText(/subsequent-writ mode|§4 MODE/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Approve — release to family/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reject/ })).toBeInTheDocument()
  })
})
