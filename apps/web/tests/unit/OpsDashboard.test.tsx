import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OpsOverview from '@/app/ops/page'
import OpsLayout from '@/app/ops/layout'

/** Ops overview (ops_console_redesign.md): J1 "needs you now", J2 health
 *  tiles from /ops/status, grouped drawer actions with typed-title delete. */

vi.mock('next/navigation', () => ({ usePathname: () => '/ops' }))

const STATUS = {
  email: { configured: false, from: null },
  stripe: 'test',
  autoApprove: true,
  malwareScan: true,
  sentry: true,
  posthog: false,
  pipeline: { awaitingDocs: 2, digitizing: 1, analyzing: 1, held: 1, ready: 4 },
  retentionCandidates: 0,
}
const HOLDS = [{ caseId: 'c_h', title: 'Harris County · 2019', reasons: ['drop_ratio'], heldAt: new Date().toISOString(), slaRemainingHours: 3.5 }]
const QUEUE = [
  { id: 'c_1', title: 'Travis County · 2020', status: 'AWAITING_DOCS', lane: 'TRIAL', daysInStage: 9, stalled: true, ocrHalt: false, delayOurs: false, subsequentWrit: false },
  { id: 'c_2', title: 'Bexar County · 2018', status: 'ANALYZING', lane: 'TRIAL', daysInStage: 1, stalled: false, ocrHalt: false, delayOurs: false, subsequentWrit: false },
]
const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    const body = u.endsWith('/ops/status') ? STATUS
      : u.endsWith('/qa/holds') ? HOLDS
      : u.endsWith('/ops/queue') ? QUEUE
      : u.endsWith('/timeline') ? [{ id: 'e1', type: 'payment.succeeded', payload: {}, actor: 'stripe', createdAt: new Date().toISOString() }]
      : u.endsWith('/cogs') ? { totalUsd: 4.66 }
      : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('ops overview', () => {
  it('J2: health tiles read the system state and shout about a silent email failure', async () => {
    render(<OpsOverview />)
    expect(await screen.findByTestId('tile-email')).toHaveTextContent(/NOT SENDING — logging only/)
    expect(screen.getByTestId('tile-stripe')).toHaveTextContent(/Test mode/)
    expect(screen.getByTestId('tile-auto-approve')).toHaveTextContent(/reports auto-deliver/)
    expect(screen.getByTestId('tile-pipeline')).toHaveTextContent(/2 docs · 1 reading · 1 analyzing/)
  })

  it('J1: "needs you now" surfaces the hold with its promise countdown and the stalled case', async () => {
    render(<OpsOverview />)
    const needs = await screen.findByTestId('needs-you')
    await waitFor(() => expect(needs).toHaveTextContent(/Harris County · 2019/))
    expect(needs).toHaveTextContent(/3\.5h left/)
    expect(needs).toHaveTextContent(/Stalled 9 days awaiting documents/)
    expect(needs).toHaveTextContent(/2/) // attention badge
  })

  it('one-click re-run on a hold hits the existing QA rerun path', async () => {
    render(<OpsOverview />)
    await screen.findByText(/Harris County · 2019/)
    fireEvent.click(screen.getByRole('button', { name: /Re-run analysis/ }))
    await waitFor(() => expect(calls.some((c) => c === 'POST http://localhost:3001/qa/cases/c_h/rerun')).toBe(true))
  })

  it('case drawer groups routine vs irreversible, shows COGS, and gates delete behind the typed title', async () => {
    render(<OpsOverview />)
    fireEvent.click(await screen.findByText('Bexar County · 2018'))
    const drawer = await screen.findByTestId('case-drawer')
    await waitFor(() => expect(drawer).toHaveTextContent(/COGS \$4\.66/))
    expect(drawer).toHaveTextContent(/Routine/)
    expect(drawer).toHaveTextContent(/Irreversible/)
    const del = screen.getByTestId('delete-case')
    expect(del).toBeDisabled()
    fireEvent.change(screen.getByTestId('delete-typed'), { target: { value: 'Bexar County · 2018' } })
    expect(del).not.toBeDisabled()
    expect(drawer).toHaveTextContent(/payment succeeded/) // de-snaked timeline
  })

  it('empty state says so when nothing needs attention', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      const body = u.endsWith('/ops/status') ? { ...STATUS, email: { configured: true, from: 'x@y' }, retentionCandidates: 0 } : u.endsWith('/qa/holds') ? [] : []
      return { ok: true, status: 200, json: async () => body } as Response
    }))
    render(<OpsOverview />)
    expect(await screen.findByText(/Nothing is waiting on you/)).toBeInTheDocument()
    expect(screen.getByTestId('tile-email')).toHaveTextContent(/Resend configured/)
  })
})

describe('ops shell', () => {
  it('every ops page carries the same nav — no dead /qa/holds link', () => {
    render(<OpsLayout><div>child</div></OpsLayout>)
    const nav = screen.getByTestId('ops-nav')
    for (const label of ['Overview', 'Holds', 'Accounts', 'Promos', 'Feedback', 'Retention']) {
      expect(nav).toHaveTextContent(label)
    }
    expect(screen.getByRole('link', { name: 'Holds' })).toHaveAttribute('href', '/ops/holds')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })
})
