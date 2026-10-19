import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The eval gate in the staff console (persona_rollout_plan.md §5 J): the
 * Today page's "Eval gate: green/red (date)" line linking to /ops/eval, and
 * the /ops/eval page — runs newest first, the latest scorecard per ledger,
 * the cost per bucket table, and Run now for an administrator.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/ops/eval' }))
const session = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: session.role, email: 'robbie@snotnoselegal.com' } }, status: 'authenticated' }), signOut: vi.fn() }))

import EvalGatePage from '@/app/ops/eval/page'
import OpsOverview from '@/app/ops/page'
import OpsLayout from '@/app/ops/layout'

const LISTING = {
  ledgers: [
    { name: 'brian', caseTitle: 'Brazoria 78734-CR', provenance: 'ATTORNEY-SIGNED', mustFind: 7, verdicts: 0 },
    { name: 'gary', caseTitle: 'San Jacinto CR13893', provenance: 'ATTORNEY-SIGNED', mustFind: 5, verdicts: 0 },
  ],
  costPerBucket: {
    SHORT: { n: 0, meanCents: null, totalCents: 0, unpriced: 0 },
    STANDARD: { n: 0, meanCents: null, totalCents: 0, unpriced: 0 },
    EXTENDED: { n: 3, meanCents: 1850, totalCents: 5550, unpriced: 1 },
    LONG: { n: 0, meanCents: null, totalCents: 0, unpriced: 0 },
  },
  runs: [
    { id: 'er_3', ledger: 'gary', caseId: 'c_g2', runId: null, status: 'RUNNING', pass: null, reasons: [], bucket: 'EXTENDED', meteredPages: { reporter: 602, clerk: 0, exhibit: 0, unknown: 0 }, costCents: null, error: null, triggeredBy: 'u_admin', startedAt: '2026-10-19T10:00:00Z', finishedAt: null, summary: null },
    { id: 'er_2', ledger: 'brian', caseId: 'c_b1', runId: 'run_b', status: 'SCORED', pass: false, reasons: ['recall_below_floor: 86% found, floor 100%', 'missed:willetts-seated-juror'], bucket: 'EXTENDED', meteredPages: { reporter: 1013, clerk: 0, exhibit: 0, unknown: 0 }, costCents: 2400, error: null, triggeredBy: 'eval-gate', startedAt: '2026-10-12T09:15:00Z', finishedAt: '2026-10-12T10:40:00Z',
      summary: { mustFindTotal: 7, found: 6, missed: ['willetts-seated-juror'], recall: 6 / 7, precision: null, droppedAtVerification: 0.25, model: 'engine-prod', promptSet: 'v2', promptHash: 'abc123def456', findings: 15, margin: (34900 - 2400) / 34900, priceCents: 34900, bucketNote: null } },
    { id: 'er_1', ledger: 'gary', caseId: 'c_g1', runId: 'run_g', status: 'SCORED', pass: true, reasons: [], bucket: 'EXTENDED', meteredPages: { reporter: 602, clerk: 0, exhibit: 0, unknown: 0 }, costCents: 1300, error: null, triggeredBy: 'eval-gate', startedAt: '2026-10-12T09:15:00Z', finishedAt: '2026-10-12T10:05:00Z',
      summary: { mustFindTotal: 5, found: 5, missed: [], recall: 1, precision: null, droppedAtVerification: 0.1, model: 'engine-prod', promptSet: 'v2', promptHash: 'abc123def456', findings: 22, margin: (34900 - 1300) / 34900, priceCents: 34900, bucketNote: null } },
  ],
}
const STATUS = {
  email: { configured: true, from: 'x@y' }, stripe: 'test', autoApprove: true, malwareScan: true, sentry: true, posthog: false,
  pipeline: { awaitingDocs: 0, digitizing: 0, analyzing: 0, held: 0, ready: 0 }, retentionCandidates: 0,
  professional: {
    verificationsPending: 0, quoteRequestsOpen: 0, pilotRecordsThisWeek: 0, allowancesNearZero: [], investigationsPastSla: [],
    evalGate: { lastRunAt: '2026-10-12T09:15:00Z', pass: false, failedLedgers: ['brian'], neverRun: [] },
  },
}

const calls: Array<{ method: string; url: string; body?: unknown }> = []
beforeEach(() => {
  calls.length = 0
  session.role = 'ADMIN'
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    calls.push({ method: init?.method ?? 'GET', url: path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (path === '/ops/eval/runs' && init?.method === 'POST') return { ok: true, status: 202, json: async () => ({ runs: [{ id: 'er_9', ledger: 'gary', caseId: 'c_g9', status: 'QUEUED' }] }) } as Response
    const body = path.startsWith('/ops/eval/runs') ? LISTING
      : path.startsWith('/ops/status') ? STATUS
      : path.startsWith('/ops/queue') ? []
      : path.startsWith('/ops/requests') ? { open: [], decided: [] }
      : path.startsWith('/qa/holds') ? []
      : { ok: true }
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

describe('/ops/eval', () => {
  it('leads with the verdict, shows the latest scorecard per ledger, cost per bucket, and the runs newest first', async () => {
    render(<EvalGatePage />)
    const verdict = await screen.findByTestId('eval-verdict')
    expect(verdict).toHaveAttribute('data-pass', 'false')
    expect(verdict).toHaveTextContent(/RED — brian/)
    expect(verdict).toHaveTextContent(/Not promotable/)

    const brian = screen.getByTestId('eval-ledger-brian')
    expect(brian).toHaveTextContent('RED')
    expect(brian).toHaveTextContent('6/7 (86%)')
    expect(brian).toHaveTextContent('willetts-seated-juror')
    expect(brian).toHaveTextContent('25%') // dropped at verification
    expect(brian).toHaveTextContent('EXTENDED · 1013 RR pp')
    expect(brian).toHaveTextContent('$24.00')
    expect(brian).toHaveTextContent('engine-prod · v2 abc123def456')
    expect(brian).toHaveTextContent('recall_below_floor')
    const gary = screen.getByTestId('eval-ledger-gary')
    expect(gary).toHaveTextContent('GREEN')
    expect(gary).toHaveTextContent('5/5 (100%)')

    expect(screen.getByTestId('eval-cost-EXTENDED')).toHaveTextContent(/EXTENDED\s*3\s*\$18\.50\s*\$55\.50\s*1/)
    expect(screen.getByTestId('eval-cost-SHORT')).toHaveTextContent(/SHORT\s*0\s*—/)

    const rows = screen.getByTestId('eval-runs').querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('RUNNING')
    expect(rows[0]).toHaveTextContent('console') // started from this page
    expect(rows[1]).toHaveTextContent('brian')
    expect(rows[1]).toHaveTextContent('schedule') // the Monday workflow's bearer
    expect(rows[2]).toHaveTextContent('gary')
  })

  it('Run now posts to /ops/eval/runs for every ledger, or the picked ones, and reports the start', async () => {
    render(<EvalGatePage />)
    await screen.findByTestId('eval-verdict')
    fireEvent.click(screen.getByTestId('eval-run-now'))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/ops/eval/runs')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({})
    expect(await screen.findByTestId('eval-notice')).toHaveTextContent(/Started 1 run/)

    const [brianBox] = screen.getByTestId('eval-ledger-picker').querySelectorAll('input[type=checkbox]')
    fireEvent.click(brianBox)
    fireEvent.click(screen.getByTestId('eval-run-now'))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
    expect(calls.filter((c) => c.method === 'POST')[1].body).toEqual({ ledgers: ['gary'] })
  })

  it('Support sees no Run now and no nav door', () => {
    session.role = 'SUPPORT'
    render(<OpsLayout><EvalGatePage /></OpsLayout>)
    expect(screen.getByTestId('ops-nav')).not.toHaveTextContent('Eval gate')
    expect(screen.queryByTestId('eval-run-now')).toBeNull()
  })

  it('ADMIN nav has the door', () => {
    render(<OpsLayout><div /></OpsLayout>)
    expect(screen.getByRole('link', { name: 'Eval gate' })).toHaveAttribute('href', '/ops/eval')
  })
})

describe('Today: the eval gate line', () => {
  it('shows red with the date in the Professional group and links to /ops/eval', async () => {
    render(<OpsOverview />)
    const tile = await screen.findByTestId('pro-eval-gate')
    expect(tile).toHaveAttribute('href', '/ops/eval')
    expect(tile).toHaveTextContent(/red \(Oct 12\)/)
    expect(tile).toHaveTextContent(/failed: brian/)
  })
})
