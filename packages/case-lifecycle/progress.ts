/**
 * Progress facts derived from the CaseEvent stream (status page, 2026-09-27).
 * Pure: the api builds `progressFacts` with it on a cold load, the web page
 * folds live events with the same rules. Counts of FINDINGS never appear
 * here — completed checks are facts; numbers wait for the verified report.
 */

export interface ProgressEventLike {
  type: string
  payload: unknown
  createdAt: Date | string
}

export interface CheckTiming {
  screen: string
  startedAt: string | null
  finishedAt: string | null
}

export interface NowChecking {
  screen: string
  sample: number
  samplesTotal: number
  screenIndex: number
  screensTotal: number
  startedAt: string
}

export type AnalysisPhase = 'context' | 'summary' | 'batch'

export interface AnalysisTimeline {
  checksDone: string[]
  checks: CheckTiming[]
  nowChecking: NowChecking | null
  /** A pre-check phase that has started and not yet given way to a check. */
  phase: AnalysisPhase | null
  screensTotal: number | null
  requestsTotal: number | null
}

const iso = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString())
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Fold one run's analysis events (oldest first) into what is done, running, and next. */
export function analysisTimeline(events: ProgressEventLike[]): AnalysisTimeline {
  const checks = new Map<string, CheckTiming>()
  let nowChecking: NowChecking | null = null
  let phase: AnalysisPhase | null = null
  let screensTotal: number | null = null
  let requestsTotal: number | null = null

  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>
    const screen = typeof p.screen === 'string' ? p.screen : null
    if (e.type === 'analysis.phase') {
      const ph = p.phase
      phase = ph === 'context' || ph === 'summary' || ph === 'batch' ? ph : null
      if (typeof p.screensTotal === 'number') screensTotal = p.screensTotal
      if (typeof p.requestsTotal === 'number') requestsTotal = p.requestsTotal
      nowChecking = null
    } else if (e.type === 'analysis.progress' && screen) {
      const c = checks.get(screen) ?? { screen, startedAt: null, finishedAt: null }
      if (!c.startedAt) c.startedAt = iso(e.createdAt)
      checks.set(screen, c)
      nowChecking = {
        screen,
        sample: num(p.sample, 1),
        samplesTotal: num(p.samplesTotal, 1),
        screenIndex: num(p.screenIndex, checks.size),
        screensTotal: num(p.screensTotal, screensTotal ?? 0),
        startedAt: iso(e.createdAt),
      }
      if (nowChecking.screensTotal) screensTotal = nowChecking.screensTotal
      phase = null
    } else if (e.type === 'screen.completed' && screen) {
      const c = checks.get(screen) ?? { screen, startedAt: null, finishedAt: null }
      c.finishedAt = iso(e.createdAt)
      checks.set(screen, c)
      if (nowChecking?.screen === screen) nowChecking = null
      // Batched checks come back together: the first result ends the wait.
      if (phase === 'batch') phase = null
    }
  }

  const all = [...checks.values()]
  return {
    checksDone: all.filter((c) => c.finishedAt).map((c) => c.screen),
    checks: all,
    nowChecking,
    phase,
    screensTotal,
    requestsTotal,
  }
}

/** Median minutes a finished check took in this run — null until one has. */
export function typicalCheckMinutes(checks: CheckTiming[]): number | null {
  const mins = checks
    .filter((c) => c.startedAt && c.finishedAt)
    .map((c) => (Date.parse(c.finishedAt!) - Date.parse(c.startedAt!)) / 60_000)
    .filter((m) => Number.isFinite(m) && m >= 0)
    .sort((a, b) => a - b)
  if (!mins.length) return null
  const mid = Math.floor(mins.length / 2)
  const median = mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
  return Math.max(1, Math.round(median))
}

/**
 * Event types a family may see in "everything the system has done so far".
 * Staff-side events (support notes, requests, consents) never appear.
 */
export const CUSTOMER_ACTIVITY_TYPES = [
  'case.created',
  'interview.completed',
  'doc.uploaded',
  'zip.ingested',
  'doc.ocr_started',
  'doc.ocr_done',
  'doc.removed',
  'doc.classified',
  'doc.confirmed',
  'doc.corrected',
  'docs.complete',
  'stage.entered',
  'ocr.halted',
  'ocr.resumed',
  'analysis.phase',
  'analysis.progress',
  'screen.completed',
  'adjudication.completed',
  'qa.approved',
  'report.rendered',
  'report.delivered',
  'hold.set',
  'hold.cleared',
  'pipeline.resumed',
  'rerun.purchased',
  'delay.ours_marked',
  'delay.ours_cleared',
] as const

export interface ActivityItem {
  type: string
  at: string
  screen?: string
  phase?: string
}

/** The enums and counts an analysis event may carry to the page — never `findingCount`. */
const RUN_EVENT_KEYS = ['screen', 'sample', 'samplesTotal', 'screenIndex', 'screensTotal', 'phase', 'requestsTotal'] as const

export interface RunEvent {
  type: string
  at: string
  payload: Partial<Record<(typeof RUN_EVENT_KEYS)[number], string | number>>
}

/** One run event as the page may hold it, so it can re-fold the timeline as live events arrive. */
export function runEventItem(e: ProgressEventLike): RunEvent {
  const p = (e.payload ?? {}) as Record<string, unknown>
  const payload: RunEvent['payload'] = {}
  for (const k of RUN_EVENT_KEYS) {
    const v = p[k]
    if (typeof v === 'string' || typeof v === 'number') payload[k] = v
  }
  return { type: e.type, at: iso(e.createdAt), payload }
}

/** The customer-safe projection of one event: its type, time, and the enum that names the step. */
export function activityItem(e: ProgressEventLike): ActivityItem {
  const p = (e.payload ?? {}) as Record<string, unknown>
  const item: ActivityItem = { type: e.type, at: iso(e.createdAt) }
  if (typeof p.screen === 'string') item.screen = p.screen
  if (typeof p.phase === 'string') item.phase = p.phase
  return item
}
