import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import CaseStatus from '@/app/(daybreak)/case/[caseId]/status/page'

/**
 * Analysis-progress feedback (upload_page_ux_review.md §2): a long silent
 * stage reads as "nothing is happening" — the explainer panel must show on a
 * cold load mid-analysis, and screen.completed events must append
 * plain-language check lines WITHOUT finding counts (pre-QA honesty rule).
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
}))

let sseInstance: FakeEventSource | null = null
class FakeEventSource {
  onmessage: ((e: { data: string }) => void) | null = null
  constructor(public url: string) {
    sseInstance = this
  }
  close() {}
}

beforeEach(() => {
  sseInstance = null
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ customer: { stage: 'analyzing', overlay: null } }),
    }) as Response)
  )
})

describe('status page — what the system is doing during analysis', () => {
  it('cold load mid-analysis shows the plain-words explainer panel', async () => {
    render(<CaseStatus />)
    const panel = await screen.findByTestId('stage-explainer')
    expect(panel).toHaveTextContent(/running its checks/)
    expect(panel).toHaveTextContent(/double-checked word-for-word/)
  })

  it('screen.completed events append named checks — no finding counts pre-QA', async () => {
    render(<CaseStatus />)
    await screen.findByTestId('stage-explainer')
    act(() => {
      sseInstance!.onmessage!({
        data: JSON.stringify({ type: 'screen.completed', payload: { screen: 'brady', findingCount: 7 } }),
      })
      sseInstance!.onmessage!({
        data: JSON.stringify({ type: 'screen.completed', payload: { screen: 'iac', findingCount: 3 } }),
      })
    })
    const feed = await screen.findByTestId('checks-feed')
    expect(feed).toHaveTextContent('2 of 6 checks finished')
    expect(feed).toHaveTextContent(/evidence the State may not have turned over/)
    expect(feed).toHaveTextContent(/how well the defense lawyer did their job/)
    expect(feed).not.toHaveTextContent(/7|3 finding/) // counts never leak pre-QA
  })

  it('COLD LOAD mid-run seeds the feed and date anchors from server progress facts — no SSE needed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          customer: { stage: 'analyzing', overlay: null },
          slaStartedAt: '2026-09-01T15:00:00Z',
          expectedReadyAt: '2026-09-15T00:00:00Z',
          progressFacts: {
            pagesDigitized: 2140,
            documentsProcessed: 12,
            documentsTotal: 13,
            checksDone: ['brady', 'iac'],
            analysisStartedAt: '2026-09-01T16:00:00Z',
          },
        }),
      }) as Response)
    )
    render(<CaseStatus />)
    const feed = await screen.findByTestId('checks-feed')
    expect(feed).toHaveTextContent('2 of 6 checks finished')
    expect(feed).toHaveTextContent(/evidence the State may not have turned over/)
    const anchors = screen.getByTestId('date-anchors')
    expect(anchors).toHaveTextContent(/Started September 1/)
    expect(anchors).toHaveTextContent(/Expect your report by September 1[45]/) // tz-safe
  })

  it('cold load during digitizing shows page/document facts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          customer: { stage: 'digitizing', overlay: null },
          progressFacts: { pagesDigitized: 890, documentsProcessed: 4, documentsTotal: 13, checksDone: [], analysisStartedAt: null },
        }),
      }) as Response)
    )
    render(<CaseStatus />)
    const factsLine = await screen.findByTestId('digitize-facts')
    expect(factsLine).toHaveTextContent('890 pages read so far, across 4 of 13 documents')
  })

  it('a duplicate screen.completed (multi-sample runs) never double-lists a check', async () => {
    render(<CaseStatus />)
    await screen.findByTestId('stage-explainer')
    act(() => {
      const msg = { data: JSON.stringify({ type: 'screen.completed', payload: { screen: 'brady', findingCount: 1 } }) }
      sseInstance!.onmessage!(msg)
      sseInstance!.onmessage!(msg)
    })
    const feed = await screen.findByTestId('checks-feed')
    expect(feed).toHaveTextContent('1 of 6 checks finished')
  })
})
