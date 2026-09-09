import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/diagnostics' }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated' }) }))
import DiagnosticsPage from '@/app/ops/diagnostics/page'

const DIAG = {
  at: '2026-09-09T20:00:00Z',
  process: { node: 'v22.13.0', uptimeMin: 42, rssMb: 310, heapLimitMb: 1536 },
  env: { NODE_ENV: 'production', ANALYSIS_BATCH: '1', CLAMD_HOST: 'clamav', AUTO_APPROVE: null },
  secretsPresent: { ANTHROPIC_API_KEY: true, AWS_ACCESS_KEY_ID: true, STRIPE_WEBHOOK_SECRET: false },
  checks: {
    redis: { ok: true, detail: 'PONG (PONG)', ms: 3 },
    s3: { ok: true, detail: 'bucket x reachable', ms: 120 },
    textract: { ok: true, detail: 'authorized', ms: 200 },
    anthropic: { ok: true, detail: 'key valid', ms: 400 },
    clamd: { ok: false, detail: 'clamd clamav: connect ECONNREFUSED — every upload\'s digitizing will fail and retry until dead', ms: 12 },
  },
  queues: {
    analysis: { workers: 1, counts: { waiting: 0, active: 0, failed: 0, completed: 3 }, failed: [] },
    ingestion: { workers: 1, counts: { waiting: 0, active: 0, failed: 2, completed: 10 }, failed: [{ id: '77', caseId: 'c_9', documentId: 'd_1', reason: 'Error: clamd timeout', attemptsMade: 3, failedAt: '2026-09-09T19:50:00Z' }] },
    zip: { workers: 0, counts: {}, failed: [] },
  },
}

describe('ops diagnostics', () => {
  it('leads with what is wrong: the failed dependency, the workerless queue, and the failed job reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => DIAG }) as Response))
    render(<DiagnosticsPage />)
    const verdict = await screen.findByTestId('diag-verdict')
    expect(verdict).toHaveTextContent(/ClamAV .* ECONNREFUSED/)
    expect(verdict).toHaveTextContent(/zip queue has no worker/)
    expect(verdict).toHaveTextContent(/1 failed job/)
    expect(screen.getByTestId('check-clamd')).toHaveAttribute('data-ok', 'false')
    expect(screen.getByTestId('check-s3')).toHaveAttribute('data-ok', 'true')
    expect(screen.getByTestId('diag-failed')).toHaveTextContent(/clamd timeout/)
    expect(screen.getByTestId('diag-failed')).toHaveTextContent(/3 attempt/)
    expect(screen.getByTestId('diag-secrets')).toHaveTextContent(/STRIPE_WEBHOOK_SECRET\s*MISSING/)
    expect(screen.getByTestId('diag-env')).toHaveTextContent(/AUTO_APPROVE\s*\(unset\)/)
  })

  it('all green says so and points at the case card', async () => {
    const green = { ...DIAG, checks: Object.fromEntries(Object.entries(DIAG.checks).map(([k, c]) => [k, { ...c, ok: true }])), queues: { analysis: { workers: 1, counts: {}, failed: [] }, ingestion: { workers: 2, counts: {}, failed: [] }, zip: { workers: 1, counts: {}, failed: [] } } }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => green }) as Response))
    render(<DiagnosticsPage />)
    expect(await screen.findByTestId('diag-verdict')).toHaveTextContent(/Every dependency answers/)
  })
})
