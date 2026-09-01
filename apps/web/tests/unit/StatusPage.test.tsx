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
