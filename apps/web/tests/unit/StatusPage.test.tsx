import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import CaseStatus from '@/app/(daybreak)/case/[caseId]/status/page'
import { ago, describeActivity } from '@/lib/tracker'

/**
 * Analysis-progress feedback (upload_page_ux_review.md §2): a long silent
 * stage reads as "nothing is happening" — the explainer panel must show on a
 * cold load mid-analysis, and screen.completed events must append
 * plain-language check lines WITHOUT finding counts (pre-QA honesty rule).
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ caseId: 'case_1' }),
}))
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'family@example.com' } }, status: 'authenticated' }),
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
    // Civil date rendered WITHOUT timezone conversion (§11a.4): exactly the
    // 15th everywhere — it used to roll back to the 14th west of UTC.
    expect(anchors).toHaveTextContent('Expect your report by September 15')
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

describe('status page — proof of life and "safe to leave" (round 4, 2026-09-06)', () => {
  it('ago() and describeActivity() speak plainly', () => {
    const now = Date.parse('2026-09-06T12:00:00Z')
    expect(ago('2026-09-06T11:59:40Z', now)).toBe('just now')
    expect(ago('2026-09-06T11:56:00Z', now)).toBe('4 minutes ago')
    expect(ago('2026-09-06T11:59:00Z', now)).toBe('1 minute ago')
    expect(ago('2026-09-06T09:00:00Z', now)).toBe('3 hours ago')
    expect(describeActivity('doc.ocr_done')).toBe('finished reading a document')
    expect(describeActivity('screen.completed')).toBe('finished one of the checks')
    expect(describeActivity('something.new')).toBe('made progress')
  })

  it('while working: says it is safe to leave, names the email, and shows the newest activity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          customer: { stage: 'analyzing', overlay: null },
          progressFacts: {
            pagesDigitized: 20000, documentsProcessed: 95, documentsTotal: 95, checksDone: [],
            analysisStartedAt: '2026-09-06T10:00:00Z',
            lastActivityAt: new Date(Date.now() - 4 * 60_000).toISOString(),
            lastActivityType: 'doc.ocr_done',
          },
        }),
      }) as Response)
    )
    render(<CaseStatus />)
    const safe = await screen.findByTestId('safe-to-leave')
    expect(safe).toHaveTextContent(/don’t need to stay on this page/)
    expect(safe).toHaveTextContent(/safe to close/)
    expect(safe).toHaveTextContent('family@example.com')
    expect(safe).toHaveTextContent(/email .* with a link/)
    const life = screen.getByTestId('last-activity')
    expect(life).toHaveTextContent(/Still working — 4 minutes ago it finished reading a document/)
    // Analysis with no check finished yet still reads as motion, not silence.
    expect(screen.getByTestId('checks-feed')).toHaveTextContent('Check 1 of 6 in progress')
  })

  it('polls the facts every 20s so a silent stream never looks locked up', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ customer: { stage: 'digitizing', overlay: null }, progressFacts: { pagesDigitized: 1, documentsProcessed: 1, documentsTotal: 95, checksDone: [] } }),
      }) as Response)
      vi.stubGlobal('fetch', fetchMock)
      render(<CaseStatus />)
      await act(async () => { await Promise.resolve() })
      const before = fetchMock.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a live event refreshes the activity line immediately', async () => {
    render(<CaseStatus />)
    await screen.findByTestId('stage-explainer')
    act(() => {
      sseInstance!.onmessage!({ data: JSON.stringify({ type: 'screen.completed', payload: { screen: 'brady', findingCount: 2 } }) })
    })
    const life = await screen.findByTestId('last-activity')
    expect(life).toHaveTextContent(/just now it finished one of the checks/)
  })

  it('delivered: no "safe to leave" nag — the report is ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ customer: { stage: 'delivered', overlay: null }, progressFacts: { pagesDigitized: 1, documentsProcessed: 1, documentsTotal: 1, checksDone: [] } }) }) as Response)
    )
    render(<CaseStatus />)
    await screen.findByText(/Your report is ready/)
    expect(screen.queryByTestId('safe-to-leave')).toBeNull()
  })
})
