import { describe, it, expect } from 'vitest'
import { emptyFeed, feedFromFacts, applyMessage, describeRightNow, checkRows, typicalMinutes, stalledMinutes, timelineOf } from '@/lib/progress-feed'
import { describeActivityItem, agoFine } from '@/lib/tracker'

const NAMES: Record<string, string> = { preserved_error: 'objections', iac: 'the lawyer', brady: 'hidden evidence', sentencing: 'sentencing problems' }
const NOW = Date.parse('2026-09-27T12:00:00Z')
const min = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe('progress feed — the status page model (2026-09-27)', () => {
  it('a fresh live pulse describes the step, its phase, and how long so far', () => {
    let s = feedFromFacts(emptyFeed(), {
      screensPlanned: ['preserved_error', 'iac', 'brady', 'sentencing'],
      livePulse: { kind: 'pulse', at: min(0.2), phase: 'reading', step: { stage: 'analyzing', label: 'check', screen: 'sentencing', sample: 1, samplesTotal: 2, screenIndex: 4, screensTotal: 4, startedAt: min(6) } },
    }, NOW)
    expect(describeRightNow(s, NAMES, NOW)).toEqual({ headline: 'Check 4 of 4: sentencing problems, pass 1 of 2', detail: 'Now reading the full record (6 min so far).', sinceMinutes: 6 })
    s = applyMessage(s, { kind: 'pulse', caseId: 'c', at: min(0), phase: 'writing', step: { ...s.step!, startedAt: min(6) } }, NOW)
    expect(describeRightNow(s, NAMES, NOW)?.detail).toBe('Now writing up what it found (6 min so far).')
    expect(s.lastSignalAt).toBe(new Date(NOW).toISOString())
  })

  it('a stale mirrored pulse is ignored; the durable facts still say which check is running', () => {
    const s = feedFromFacts(emptyFeed(), {
      screensPlanned: ['preserved_error', 'iac'],
      runEvents: [{ type: 'analysis.progress', at: min(9), payload: { screen: 'iac', sample: 1, samplesTotal: 1, screenIndex: 2, screensTotal: 2 } }],
      livePulse: { kind: 'pulse', at: min(30), phase: 'reading', step: { stage: 'analyzing', label: 'check', screen: 'iac', startedAt: min(40) } },
    }, NOW)
    expect(s.step).toBeNull()
    expect(describeRightNow(s, NAMES, NOW)).toEqual({ headline: 'Check 2 of 2: the lawyer', detail: 'Started 9 min ago.', sinceMinutes: 9 })
  })

  it('production batch: the phase names the wait, and each poll pulse reports passes returned', () => {
    let s = feedFromFacts(emptyFeed(), {
      screensPlanned: ['preserved_error', 'iac', 'brady', 'sentencing'],
      runEvents: [{ type: 'analysis.phase', at: min(20), payload: { phase: 'batch', screensTotal: 4, requestsTotal: 8 } }],
    }, NOW)
    expect(describeRightNow(s, NAMES, NOW)?.headline).toBe('Running every check on the record')
    expect(describeRightNow(s, NAMES, NOW)?.detail).toMatch(/All 4 checks are running at the same time/)
    s = applyMessage(s, { kind: 'pulse', at: min(0), phase: 'waiting', step: { stage: 'analyzing', label: 'batch', screensTotal: 4, done: 3, total: 8, startedAt: min(20) } }, NOW)
    expect(describeRightNow(s, NAMES, NOW)?.detail).toBe('All 4 checks are running at the same time. 3 of 8 passes have come back. (20 min so far)')
    // Results land: every check flips to done, the batch step is gone with the stage's first fact.
    for (const screen of ['preserved_error', 'iac', 'brady', 'sentencing']) {
      s = applyMessage(s, { type: 'screen.completed', at: min(0), payload: { screen, findingCount: 4 } }, NOW)
    }
    expect(checkRows(s, NAMES, NOW).map((r) => r.status)).toEqual(['done', 'done', 'done', 'done'])
    expect(timelineOf(s).phase).toBeNull()
  })

  it('check rows show the whole plan — done with duration, running with elapsed, pending', () => {
    const s = feedFromFacts(emptyFeed(), {
      screensPlanned: ['preserved_error', 'iac', 'brady', 'sentencing'],
      runEvents: [
        { type: 'analysis.progress', at: min(40), payload: { screen: 'preserved_error', screenIndex: 1, screensTotal: 4 } },
        { type: 'screen.completed', at: min(26), payload: { screen: 'preserved_error' } },
        { type: 'analysis.progress', at: min(26), payload: { screen: 'iac', screenIndex: 2, screensTotal: 4 } },
        { type: 'screen.completed', at: min(10), payload: { screen: 'iac' } },
        { type: 'analysis.progress', at: min(10), payload: { screen: 'brady', screenIndex: 3, screensTotal: 4 } },
      ],
    }, NOW)
    expect(checkRows(s, NAMES, NOW)).toEqual([
      { screen: 'preserved_error', name: 'objections', status: 'done', minutes: 14 },
      { screen: 'iac', name: 'the lawyer', status: 'done', minutes: 16 },
      { screen: 'brady', name: 'hidden evidence', status: 'running', minutes: 10 },
      { screen: 'sentencing', name: 'sentencing problems', status: 'pending', minutes: null },
    ])
    expect(typicalMinutes(s)).toBe(15)
  })

  it('facts from an older server (checksDone only) still render as finished checks', () => {
    const s = feedFromFacts(emptyFeed(), { checksDone: ['brady', 'iac'], lastActivityAt: min(3) }, NOW)
    expect(timelineOf(s).checksDone).toEqual(['brady', 'iac'])
    expect(checkRows(s, NAMES, NOW).map((r) => [r.screen, r.status, r.minutes])).toEqual([['brady', 'done', null], ['iac', 'done', null]])
  })

  it('a duplicate fact (at-least-once delivery) folds once', () => {
    let s = emptyFeed()
    const msg = { type: 'screen.completed', at: min(1), payload: { screen: 'brady', findingCount: 2 } }
    s = applyMessage(s, msg, NOW)
    s = applyMessage(s, msg, NOW)
    expect(s.runEvents).toHaveLength(1)
    expect(s.activity).toHaveLength(2) // the log keeps every arrival; it is a log
  })

  it('digitizing: the document being read, from a fact or a pulse, ends with its doc.ocr_done', () => {
    let s = applyMessage(emptyFeed(), { type: 'doc.ocr_started', at: min(3), payload: { documentId: 'd1' } }, NOW)
    expect(describeRightNow(s, NAMES, NOW)).toMatchObject({ headline: 'Reading one of your documents', detail: expect.stringMatching(/Started 3 min ago/) })
    s = applyMessage(s, { kind: 'pulse', at: min(0), phase: 'reading', step: { stage: 'digitizing', label: 'document', documentId: 'd1', startedAt: min(3) } }, NOW)
    expect(describeRightNow(s, NAMES, NOW)?.detail).toMatch(/Turning the pages into text it can search \(3 min so far\)/)
    s = applyMessage(s, { type: 'doc.ocr_done', at: min(0), payload: { documentId: 'd1', pages: 40, lowConfidencePages: 0 } }, NOW)
    expect(s.step).toBeNull()
    expect(describeRightNow(s, NAMES, NOW)).toBeNull()
  })

  it('a new stage clears the previous step; a finished check clears its own pulse', () => {
    let s = applyMessage(emptyFeed(), { kind: 'pulse', at: min(0), phase: 'writing', step: { stage: 'analyzing', label: 'check', screen: 'brady', startedAt: min(5) } }, NOW)
    s = applyMessage(s, { type: 'screen.completed', at: min(0), payload: { screen: 'brady' } }, NOW)
    expect(s.step).toBeNull()
    s = applyMessage(s, { kind: 'pulse', at: min(0), phase: 'reading', step: { stage: 'analyzing', label: 'check', screen: 'iac', startedAt: min(0) } }, NOW)
    s = applyMessage(s, { type: 'stage.entered', at: min(0), payload: { status: 'QA_REVIEW' } }, NOW)
    expect(s.step).toBeNull()
  })

  it('stalled only after a generous, per-stage silence', () => {
    const quiet = { ...emptyFeed(), lastSignalAt: min(30) }
    expect(stalledMinutes(quiet, 'analyzing', NOW)).toBeNull()
    expect(stalledMinutes(quiet, 'digitizing', NOW)).toBe(30)
    expect(stalledMinutes({ ...emptyFeed(), lastSignalAt: min(50) }, 'analyzing', NOW)).toBe(50)
    expect(stalledMinutes(quiet, 'quality_review', NOW)).toBeNull()
    expect(stalledMinutes(emptyFeed(), 'analyzing', NOW)).toBeNull()
  })

  it('activity lines name the check or phase, never a count; the signal clock speaks in seconds', () => {
    expect(describeActivityItem({ type: 'screen.completed', screen: 'brady' }, NAMES)).toBe('finished checking for hidden evidence')
    expect(describeActivityItem({ type: 'analysis.progress', screen: 'iac' }, NAMES)).toBe('started checking for the lawyer')
    expect(describeActivityItem({ type: 'analysis.phase', phase: 'batch' }, NAMES)).toBe('sent every check to run at once')
    expect(describeActivityItem({ type: 'doc.ocr_started' }, NAMES)).toBe('started reading a document')
    expect(agoFine(new Date(NOW - 2000).toISOString(), NOW)).toBe('just now')
    expect(agoFine(new Date(NOW - 12_000).toISOString(), NOW)).toBe('12 seconds ago')
    expect(agoFine(min(4), NOW)).toBe('4 minutes ago')
  })
})
