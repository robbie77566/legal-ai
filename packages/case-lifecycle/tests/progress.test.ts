import { describe, it, expect } from 'vitest'
import { analysisTimeline, typicalCheckMinutes, activityItem, runEventItem, CUSTOMER_ACTIVITY_TYPES, validateEventPayload } from '../index'

const at = (m: number) => new Date(Date.UTC(2026, 8, 27, 10, m)).toISOString()

describe('analysis timeline — what is done, running, and next (status page, 2026-09-27)', () => {
  it('live path: phases give way to checks; a check is running until its screen completes', () => {
    const t = analysisTimeline([
      { type: 'analysis.phase', payload: { phase: 'context', screensTotal: 7 }, createdAt: at(0) },
      { type: 'analysis.phase', payload: { phase: 'summary', screensTotal: 7 }, createdAt: at(2) },
      { type: 'analysis.progress', payload: { screen: 'preserved_error', sample: 1, samplesTotal: 2, screenIndex: 1, screensTotal: 7 }, createdAt: at(4) },
      { type: 'analysis.progress', payload: { screen: 'preserved_error', sample: 2, samplesTotal: 2, screenIndex: 1, screensTotal: 7 }, createdAt: at(18) },
      { type: 'screen.completed', payload: { screen: 'preserved_error', findingCount: 9 }, createdAt: at(30) },
      { type: 'analysis.progress', payload: { screen: 'iac', sample: 1, samplesTotal: 2, screenIndex: 2, screensTotal: 7 }, createdAt: at(31) },
    ])
    expect(t.phase).toBeNull()
    expect(t.screensTotal).toBe(7)
    expect(t.checksDone).toEqual(['preserved_error'])
    expect(t.checks).toEqual([
      { screen: 'preserved_error', startedAt: at(4), finishedAt: at(30) },
      { screen: 'iac', startedAt: at(31), finishedAt: null },
    ])
    expect(t.nowChecking).toMatchObject({ screen: 'iac', sample: 1, samplesTotal: 2, screenIndex: 2, screensTotal: 7, startedAt: at(31) })
  })

  it('batch path (production): the batch phase holds until the first result lands', () => {
    const before = analysisTimeline([
      { type: 'analysis.phase', payload: { phase: 'context', screensTotal: 7 }, createdAt: at(0) },
      { type: 'analysis.phase', payload: { phase: 'batch', screensTotal: 7, requestsTotal: 14 }, createdAt: at(3) },
    ])
    expect(before.phase).toBe('batch')
    expect(before.requestsTotal).toBe(14)
    expect(before.nowChecking).toBeNull()
    const after = analysisTimeline([
      { type: 'analysis.phase', payload: { phase: 'batch', screensTotal: 7, requestsTotal: 14 }, createdAt: at(3) },
      { type: 'screen.completed', payload: { screen: 'brady', findingCount: 2 }, createdAt: at(40) },
    ])
    expect(after.phase).toBeNull()
    expect(after.checksDone).toEqual(['brady'])
    // No start marker on the batch path — the duration is unknown, not invented.
    expect(after.checks[0].startedAt).toBeNull()
  })

  it('a pre-check phase is current only while nothing has happened since', () => {
    const t = analysisTimeline([
      { type: 'analysis.progress', payload: { screen: 'iac', screenIndex: 1, screensTotal: 5 }, createdAt: at(1) },
      { type: 'analysis.phase', payload: { phase: 'summary', screensTotal: 5 }, createdAt: at(2) },
    ])
    expect(t.phase).toBe('summary')
    expect(t.nowChecking).toBeNull()
  })

  it('typical check minutes is the median of finished checks, never below one', () => {
    expect(typicalCheckMinutes([])).toBeNull()
    expect(typicalCheckMinutes([{ screen: 'a', startedAt: at(0), finishedAt: null }])).toBeNull()
    expect(
      typicalCheckMinutes([
        { screen: 'a', startedAt: at(0), finishedAt: at(12) },
        { screen: 'b', startedAt: at(12), finishedAt: at(30) },
        { screen: 'c', startedAt: at(30), finishedAt: at(44) },
      ])
    ).toBe(14)
    expect(typicalCheckMinutes([{ screen: 'a', startedAt: at(0), finishedAt: at(0) }])).toBe(1)
  })

  it('projections carry enums and counts the family may see — never findingCount', () => {
    const e = { type: 'screen.completed', payload: { screen: 'brady', findingCount: 7, pagesAnalyzed: 300 }, createdAt: at(5) }
    expect(activityItem(e)).toEqual({ type: 'screen.completed', at: at(5), screen: 'brady' })
    expect(runEventItem(e)).toEqual({ type: 'screen.completed', at: at(5), payload: { screen: 'brady' } })
    expect(runEventItem({ type: 'analysis.phase', payload: { phase: 'batch', screensTotal: 7, requestsTotal: 14 }, createdAt: at(1) }).payload).toEqual({ phase: 'batch', screensTotal: 7, requestsTotal: 14 })
    expect(JSON.stringify(runEventItem(e))).not.toMatch(/findingCount|pagesAnalyzed/)
  })

  it('the customer activity allowlist has no staff-side events', () => {
    for (const t of ['support.contacted', 'request.opened', 'request.decided', 'consent.granted', 'qa.edited', 'qa.rejected']) {
      expect(CUSTOMER_ACTIVITY_TYPES).not.toContain(t)
    }
    expect(CUSTOMER_ACTIVITY_TYPES).toContain('doc.ocr_started')
    expect(CUSTOMER_ACTIVITY_TYPES).toContain('analysis.phase')
  })
})

describe('new registry events are strict and PII-minimal', () => {
  it('analysis.phase v1', () => {
    expect(validateEventPayload('analysis.phase', 1, { phase: 'batch', screensTotal: 7, requestsTotal: 14 })).toEqual({ phase: 'batch', screensTotal: 7, requestsTotal: 14 })
    expect(() => validateEventPayload('analysis.phase', 1, { phase: 'thinking', screensTotal: 7 })).toThrow()
    expect(() => validateEventPayload('analysis.phase', 1, { phase: 'context', screensTotal: 7, note: 'free text' })).toThrow()
  })
  it('doc.ocr_started v1', () => {
    expect(validateEventPayload('doc.ocr_started', 1, { documentId: 'doc_1' })).toEqual({ documentId: 'doc_1' })
    expect(() => validateEventPayload('doc.ocr_started', 1, { documentId: 'doc_1', filename: 'x.pdf' })).toThrow()
  })
})
