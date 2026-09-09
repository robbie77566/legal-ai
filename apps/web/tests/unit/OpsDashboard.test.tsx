import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OpsOverview from '@/app/ops/page'
import OpsLayout from '@/app/ops/layout'

/** Ops overview (ops_console_redesign.md): J1 "needs you now", J2 health
 *  tiles from /ops/status, grouped drawer actions with typed-title delete. */

vi.mock('next/navigation', () => ({ usePathname: () => '/ops' }))
const session = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: session.role } }, status: 'authenticated' }) }))

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
const REQUESTS = { open: [{ id: 'q_1', caseId: 'c_2', caseTitle: 'Bexar County · 2018', type: 'REFUND', reason: 'unreadable_record', note: '3 of 9 scans unusable', amountCents: 14900, requestedByEmail: 'dana@snotnoselegal.com', decision: null, decidedByEmail: null, decisionNote: null, createdAt: new Date().toISOString(), decidedAt: null }], decided: [] }
const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    const body = u.endsWith('/ops/status') ? STATUS
      : u.endsWith('/qa/holds') ? HOLDS
      : u.endsWith('/ops/queue') ? QUEUE
      : u.endsWith('/ops/requests') ? REQUESTS
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
    expect(needs).toHaveTextContent(/3/) // attention badge: hold + stall + approval
  })

  it('an Admin sees a support request as an approval card; declining needs a reason, approving posts the decision', async () => {
    render(<OpsOverview />)
    const card = await screen.findByTestId('approval-q_1')
    expect(card).toHaveTextContent(/Refund — Bexar County · 2018 · \$149\.00/)
    expect(card).toHaveTextContent(/dana@snotnoselegal.com · unreadable record/)
    fireEvent.click(screen.getByRole('button', { name: 'Decline…' }))
    const declineBtn = screen.getByRole('button', { name: 'Decline' })
    expect(declineBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Decline reason'), { target: { value: 'Ask the clerk first.' } })
    fireEvent.click(declineBtn)
    await waitFor(() => expect(calls).toContain('POST http://localhost:3001/ops/requests/q_1/decide'))
  })

  it('a Support sign-in sees its own requests under "Waiting on an admin", never the approvals', async () => {
    session.role = 'SUPPORT'
    render(<OpsOverview />)
    const waiting = await screen.findByTestId('waiting-on-admin')
    expect(waiting).toHaveTextContent(/PENDING/)
    expect(waiting).toHaveTextContent(/Refund — Bexar County · 2018/)
    expect(screen.queryByTestId('approval-q_1')).toBeNull()
    expect(screen.queryByTestId('health')).toBeNull()
    session.role = 'ADMIN'
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
      const body = u.endsWith('/ops/status') ? { ...STATUS, email: { configured: true, from: 'x@y' }, retentionCandidates: 0 } : u.endsWith('/ops/requests') ? { open: [], decided: [] } : []
      return { ok: true, status: 200, json: async () => body } as Response
    }))
    render(<OpsOverview />)
    expect(await screen.findByText(/Nothing is waiting on you/)).toBeInTheDocument()
    expect(screen.getByTestId('tile-email')).toHaveTextContent(/Resend configured/)
  })
})

describe('ops shell', () => {
  it('shouts when the API rejects the session instead of rendering empty pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response))
    render(<OpsLayout><div>child</div></OpsLayout>)
    expect(await screen.findByTestId('api-auth-banner')).toHaveTextContent(/rejecting your session/)
  })

  it('every ops page carries the same nav — no dead /qa/holds link', () => {
    render(<OpsLayout><div>child</div></OpsLayout>)
    const nav = screen.getByTestId('ops-nav')
    for (const label of ['Overview', 'Holds', 'Cases', 'Accounts', 'Promos', 'Money', 'Feedback', 'Retention', 'Team']) {
      expect(nav).toHaveTextContent(label)
    }
    expect(screen.getByRole('link', { name: 'Holds' })).toHaveAttribute('href', '/ops/holds')
    expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute('href', '/dashboard/permissions')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })

  it('a SUPPORT sign-in sees only the customer-facing doors — no Money, Promos, Holds, or Retention', () => {
    session.role = 'SUPPORT'
    render(<OpsLayout><div>child</div></OpsLayout>)
    const nav = screen.getByTestId('ops-nav')
    for (const label of ['Overview', 'Cases', 'Accounts', 'Feedback']) expect(nav).toHaveTextContent(label)
    for (const label of ['Money', 'Promos', 'Holds', 'Retention', 'Team']) expect(nav).not.toHaveTextContent(label)
    session.role = 'ADMIN'
  })
})

describe('drawer actions report next to the button (2026-09-09)', () => {
  it('Resume stuck pipeline shows its result inside the drawer, not only at the page top', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      const body = u.endsWith('/resume') ? { ok: true, analysisEnqueued: true, redigitized: 0, priorJobState: 'failed', undigitized: 0 }
        : u.endsWith('/ops/status') ? STATUS : u.endsWith('/qa/holds') ? HOLDS : u.endsWith('/ops/queue') ? QUEUE
        : u.endsWith('/ops/requests') ? REQUESTS : u.endsWith('/timeline') ? [] : u.endsWith('/cogs') ? { totalUsd: 0 } : { ok: true }
      calls.push(`${init?.method ?? 'GET'} ${u}`)
      return { ok: true, status: 200, json: async () => body } as Response
    }))
    render(<OpsOverview />)
    fireEvent.click(await screen.findByText('Bexar County · 2018')) // ANALYZING → button shown
    const drawer = await screen.findByTestId('case-drawer')
    fireEvent.click(screen.getByTestId('resume-pipeline'))
    const result = await screen.findByTestId('drawer-result')
    await waitFor(() => expect(result).toHaveTextContent(/analysis re-queued \(previous job: failed\)/))
    expect(drawer).toContainElement(result)
    expect(calls.some((c) => c === 'POST http://localhost:3001/ops/cases/c_2/resume')).toBe(true)
  })
})
