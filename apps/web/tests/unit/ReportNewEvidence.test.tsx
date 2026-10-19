import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CaseReport from '@/app/(daybreak)/case/[caseId]/report/page'
import { LangProvider } from '@/lib/i18n'

/**
 * K3 — the new-evidence card on the family report (PRD FR-10;
 * mvp_ui_design_spec §5.7 "New-evidence flag (FR-10) renders as its own
 * card"). Rendered only when the case facts say the family told us about
 * evidence never presented; their words verbatim; English and Spanish.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useSearchParams: () => new URLSearchParams(''), useRouter: () => ({ push: vi.fn() }) }))

const NOTE = 'My cousin Ana saw him at work that night and was never called to testify.'
const base = {
  summaryGap: null,
  rerunPriceCents: 9900,
  bottomLine: { tier: 'consult', headline: 'Worth a conversation with a lawyer.', body: ['Not legal advice.'] },
  caseSummary: [],
  versionNo: 1,
  templateVersion: 'AB-v2',
  renderedAt: '2026-10-19T10:00:00Z',
  deadlinePosture: null,
  subsequentWritMode: false,
  droppedByReverification: 0,
  strongSignals: [],
  possibleIssues: [{ category: 'brady', severity: 'supportive', confidence: 0.6, partAText: 'Something was not handed over.', partBText: 'B', citations: [] }],
}
let payload: Record<string, unknown> = {}

beforeEach(() => {
  window.localStorage.clear()
  try { localStorage.setItem('snl:report-opened:case_1', '1') } catch {}
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    const body = u.endsWith('/report/versions') ? [{ versionNo: 1, renderedAt: '2026-10-19T10:00:00Z' }] : u.endsWith('/report') ? payload : {}
    return { ok: true, status: 200, json: async () => body } as Response
  }))
})

async function open(lang: 'en' | 'es' = 'en') {
  window.localStorage.setItem('snl_lang', lang)
  render(
    <LangProvider>
      <CaseReport />
    </LangProvider>
  )
  const gate = await screen.findByRole('button', { name: /Read it now/ }).catch(() => null)
  if (gate) fireEvent.click(gate)
}

describe('report — the new-evidence card (FR-10, K3)', () => {
  it('renders its own card with the spec copy and the family note verbatim, after the findings and before the next step', async () => {
    payload = { ...base, newEvidence: { told: true, note: NOTE } }
    await open()
    const card = await screen.findByTestId('new-evidence-card')
    expect(card).toHaveTextContent('Evidence that was never presented')
    expect(card).toHaveTextContent('You told us about evidence that was never presented — this review can’t evaluate it, but your attorney must know about it.')
    expect(card).toHaveTextContent(NOTE)
    // order: findings → card → "What to do next"
    const finding = screen.getByText('Something was not handed over.')
    const next = screen.getByText('What to do next')
    expect(finding.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('without a note, repeats the question and the answer they gave — never an inference', async () => {
    payload = { ...base, newEvidence: { told: true } }
    await open()
    const card = await screen.findByTestId('new-evidence-card')
    expect(card).toHaveTextContent(/you answered yes/)
    expect(card).not.toHaveTextContent(NOTE)
  })

  it('is absent when the facts say nothing', async () => {
    payload = { ...base, newEvidence: null }
    await open()
    expect(await screen.findByText('Something was not handed over.')).toBeInTheDocument()
    expect(screen.queryByTestId('new-evidence-card')).toBeNull()
    expect(screen.queryByText(/evidence that was never presented/i)).toBeNull()
  })

  it('renders in Spanish with the note still verbatim', async () => {
    payload = { ...base, newEvidence: { told: true, note: NOTE } }
    await open('es')
    const card = await screen.findByTestId('new-evidence-card')
    expect(card).toHaveTextContent('Evidencia que nunca se presentó')
    expect(card).toHaveTextContent('Usted nos contó sobre evidencia que nunca se presentó — esta revisión no puede evaluarla, pero su abogado debe saberlo.')
    expect(card).toHaveTextContent(NOTE)
  })
})
