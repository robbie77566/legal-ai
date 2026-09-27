import { analysisTimeline, typicalCheckMinutes, activityItem, runEventItem, type AnalysisTimeline, type ActivityItem, type RunEvent } from '@hg/case-lifecycle'

/**
 * The status page's live feed model (2026-09-27). Pure and testable: the
 * server's progress facts seed it on load and on every poll, every stream
 * message folds into it, and the page renders from it.
 *
 * Two kinds of message ride the one stream:
 *   FACTS  — CaseEvents: durable, replayable, the record of what happened.
 *   PULSES — the worker's liveness between facts: which step, which phase,
 *            since when. A pulse is never a fact: it moves the "right now"
 *            line and the signal clock, nothing else.
 *
 * Finding counts never enter this model (pre-QA honesty rule).
 */

export type PulsePhase = 'reading' | 'writing' | 'waiting' | 'saving'
export type StepLabel = 'document' | 'context' | 'summary' | 'batch' | 'check'

export interface LiveStep {
  stage: 'digitizing' | 'analyzing'
  label: StepLabel
  documentId?: string
  screen?: string
  sample?: number
  samplesTotal?: number
  screenIndex?: number
  screensTotal?: number
  done?: number
  total?: number
  startedAt: string
}

export interface FeedState {
  /** The worker's own account of what it is doing, from the newest pulse. */
  step: LiveStep | null
  phase: PulsePhase | null
  /** When the newest pulse or fact arrived — "last signal 12 seconds ago". */
  lastSignalAt: string | null
  /** The lane's whole plan (server), so pending checks can be listed too. */
  screensPlanned: string[]
  /** This run's analysis events; the timeline is always re-folded from them. */
  runEvents: RunEvent[]
  documentInProgress: { startedAt: string } | null
  activity: ActivityItem[]
}

export function emptyFeed(): FeedState {
  return { step: null, phase: null, lastSignalAt: null, screensPlanned: [], runEvents: [], documentInProgress: null, activity: [] }
}

/** The subset of the checklist endpoint's `progressFacts` this model reads. */
export interface ProgressFactsLike {
  screensPlanned?: string[]
  runEvents?: RunEvent[]
  /** Older servers: finished screens only. */
  checksDone?: string[]
  documentInProgress?: { startedAt: string } | null
  recentActivity?: ActivityItem[]
  livePulse?: { kind: 'pulse'; at: string; step: LiveStep; phase: PulsePhase } | null
  lastActivityAt?: string | null
}

/** How old a mirrored pulse may be and still describe "right now". */
export const PULSE_FRESH_MS = 2 * 60_000

const newest = (...isos: (string | null | undefined)[]) => {
  const xs = isos.filter((x): x is string => !!x)
  return xs.length ? xs.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null
}

/** Seed (or re-seed on every poll) from the server's facts. Live-only knowledge survives: a fresher pulse, the newest signal. */
export function feedFromFacts(prev: FeedState, facts: ProgressFactsLike, now = Date.now()): FeedState {
  const pulse = facts.livePulse && now - Date.parse(facts.livePulse.at) < PULSE_FRESH_MS ? facts.livePulse : null
  const usePulse = !!pulse && (!prev.lastSignalAt || Date.parse(pulse.at) >= Date.parse(prev.lastSignalAt))
  let runEvents = facts.runEvents ?? prev.runEvents
  if (!facts.runEvents && facts.checksDone?.length) {
    const at = facts.lastActivityAt ?? new Date(now).toISOString()
    runEvents = facts.checksDone.map((screen) => ({ type: 'screen.completed', at, payload: { screen } }))
  }
  return {
    ...prev,
    step: usePulse ? pulse.step : prev.step,
    phase: usePulse ? pulse.phase : prev.phase,
    lastSignalAt: newest(prev.lastSignalAt, facts.lastActivityAt, pulse?.at),
    screensPlanned: facts.screensPlanned?.length ? facts.screensPlanned : prev.screensPlanned,
    runEvents,
    documentInProgress: facts.documentInProgress === undefined ? prev.documentInProgress : facts.documentInProgress,
    activity: facts.recentActivity?.length ? facts.recentActivity : prev.activity,
  }
}

interface StreamMessage {
  kind?: string
  type?: string
  at?: string
  payload?: Record<string, unknown>
  step?: LiveStep
  phase?: PulsePhase
}

const RUN_EVENT_TYPES = new Set(['analysis.phase', 'analysis.progress', 'screen.completed'])

/** Fold one stream message (a fact or a pulse) into the feed. */
export function applyMessage(prev: FeedState, raw: unknown, now = Date.now()): FeedState {
  const msg = (raw ?? {}) as StreamMessage
  const at = new Date(now).toISOString()
  if (msg.kind === 'pulse' && msg.step) {
    return { ...prev, step: msg.step, phase: msg.phase ?? prev.phase, lastSignalAt: at }
  }
  if (typeof msg.type !== 'string') return prev
  const event = { type: msg.type, payload: msg.payload ?? {}, createdAt: msg.at ?? at }
  const next: FeedState = { ...prev, lastSignalAt: at }
  if (RUN_EVENT_TYPES.has(msg.type)) {
    const item = runEventItem(event)
    // At-least-once delivery: the same fact may arrive twice.
    const dup = prev.runEvents.some((e) => e.type === item.type && e.at === item.at && JSON.stringify(e.payload) === JSON.stringify(item.payload))
    next.runEvents = dup ? prev.runEvents : [...prev.runEvents, item]
    // A finished check is a fact; the pulse that described it is stale.
    if (msg.type === 'screen.completed' && prev.step?.label === 'check' && prev.step.screen === msg.payload?.screen) {
      next.step = null
      next.phase = null
    }
  } else if (msg.type === 'doc.ocr_started') {
    next.documentInProgress = { startedAt: event.createdAt }
  } else if (msg.type === 'doc.ocr_done') {
    next.documentInProgress = null
    if (prev.step?.label === 'document' && prev.step.documentId === msg.payload?.documentId) {
      next.step = null
      next.phase = null
    }
  } else if (msg.type === 'stage.entered') {
    // A new stage ends whatever the last one was doing.
    next.step = null
    next.phase = null
    next.documentInProgress = null
  }
  next.activity = [activityItem(event), ...prev.activity].slice(0, 50)
  return next
}

export function timelineOf(state: FeedState): AnalysisTimeline {
  return analysisTimeline(state.runEvents.map((e) => ({ type: e.type, payload: e.payload, createdAt: e.at })))
}

export const PHASE_WORDS: Record<PulsePhase, string> = {
  reading: 'reading the full record',
  writing: 'writing up what it found',
  waiting: 'waiting for results',
  saving: 'saving what it found',
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
}

export interface RightNow {
  headline: string
  detail: string | null
  sinceMinutes: number
}

/**
 * "Right now" in the family's words. Prefers the worker's own pulse (it
 * knows the phase); falls back to the durable facts (a cold load whose
 * pulse has expired still says which check is running and since when).
 */
export function describeRightNow(state: FeedState, screenNames: Record<string, string>, now = Date.now()): RightNow | null {
  const name = (s?: string) => (s && screenNames[s]) || 'one of the checks'
  const mins = (iso: string) => minutesSince(iso, now)
  const soFar = (iso: string) => (mins(iso) < 1 ? 'just started' : `${mins(iso)} min so far`)
  const since = (iso: string) => (mins(iso) < 1 ? 'just now' : `${mins(iso)} min ago`)
  const t = timelineOf(state)
  const step = state.step
  if (step) {
    const phase = state.phase ?? 'reading'
    switch (step.label) {
      case 'check': {
        const pass = step.samplesTotal && step.samplesTotal > 1 ? `, pass ${step.sample ?? 1} of ${step.samplesTotal}` : ''
        const index = step.screenIndex && step.screensTotal ? `Check ${step.screenIndex} of ${step.screensTotal}: ` : ''
        return { headline: `${index}${name(step.screen)}${pass}`, detail: `Now ${PHASE_WORDS[phase]} (${soFar(step.startedAt)}).`, sinceMinutes: mins(step.startedAt) }
      }
      case 'batch': {
        const total = step.total ?? t.requestsTotal ?? 0
        const done = step.done ?? 0
        const count = step.screensTotal ? `All ${step.screensTotal} checks` : 'All the checks'
        const back = total ? ` ${done} of ${total} passes have come back.` : ''
        const detail =
          phase === 'waiting'
            ? `${count} are running at the same time.${back}`
            : phase === 'saving'
              ? `The results are back — ${PHASE_WORDS.saving}.`
              : `Finishing the last passes one at a time — ${PHASE_WORDS[phase]}.`
        return { headline: 'Running every check on the record', detail: `${detail} (${soFar(step.startedAt)})`, sinceMinutes: mins(step.startedAt) }
      }
      case 'context':
        return { headline: 'Getting to know the record', detail: `Reading the whole record once to learn the names, dates and charges before the checks begin (${soFar(step.startedAt)}).`, sinceMinutes: mins(step.startedAt) }
      case 'summary':
        return { headline: 'Pulling the key facts for your report', detail: `The verdict, the sentence and the dates, taken word-for-word from the record (${soFar(step.startedAt)}).`, sinceMinutes: mins(step.startedAt) }
      case 'document':
        return {
          headline: 'Reading one of your documents',
          detail: `${phase === 'saving' ? 'Saving the pages it read' : 'Turning the pages into text it can search'} (${soFar(step.startedAt)}). Scanned pages take longer than typed ones.`,
          sinceMinutes: mins(step.startedAt),
        }
    }
  }
  if (t.nowChecking) {
    const n = t.nowChecking
    const pass = n.samplesTotal > 1 ? `, pass ${n.sample} of ${n.samplesTotal}` : ''
    const total = n.screensTotal || state.screensPlanned.length
    return { headline: `Check ${n.screenIndex} of ${total}: ${name(n.screen)}${pass}`, detail: `Started ${since(n.startedAt)}.`, sinceMinutes: mins(n.startedAt) }
  }
  if (t.phase === 'batch') {
    const count = t.screensTotal ? `All ${t.screensTotal} checks` : 'All the checks'
    return { headline: 'Running every check on the record', detail: `${count} are running at the same time; results come back together.`, sinceMinutes: 0 }
  }
  if (t.phase === 'context') return { headline: 'Getting to know the record', detail: 'Reading the whole record once to learn the names, dates and charges before the checks begin.', sinceMinutes: 0 }
  if (t.phase === 'summary') return { headline: 'Pulling the key facts for your report', detail: 'The verdict, the sentence and the dates, taken word-for-word from the record.', sinceMinutes: 0 }
  if (state.documentInProgress) {
    return { headline: 'Reading one of your documents', detail: `Started ${since(state.documentInProgress.startedAt)}. Scanned pages take longer than typed ones.`, sinceMinutes: mins(state.documentInProgress.startedAt) }
  }
  return null
}

export interface CheckRow {
  screen: string
  name: string
  status: 'done' | 'running' | 'pending'
  /** done: how long it took; running: how long so far. */
  minutes: number | null
}

/** Every planned check with its state — the family sees the whole plan, not only the finished part. */
export function checkRows(state: FeedState, screenNames: Record<string, string>, now = Date.now()): CheckRow[] {
  const t = timelineOf(state)
  const planned = state.screensPlanned.length ? state.screensPlanned : t.checks.map((c) => c.screen)
  const extra = t.checks.map((c) => c.screen).filter((s) => !planned.includes(s))
  const running = state.step?.label === 'check' ? state.step.screen : t.nowChecking?.screen
  return [...planned, ...extra].map((screen) => {
    const c = t.checks.find((x) => x.screen === screen)
    const label = screenNames[screen] ?? screen
    if (c?.finishedAt) {
      const took = c.startedAt ? Math.max(1, Math.round((Date.parse(c.finishedAt) - Date.parse(c.startedAt)) / 60_000)) : null
      return { screen, name: label, status: 'done', minutes: took }
    }
    if (screen === running) {
      const since = state.step?.label === 'check' && state.step.screen === screen ? state.step.startedAt : (c?.startedAt ?? t.nowChecking?.startedAt ?? null)
      return { screen, name: label, status: 'running', minutes: since ? minutesSince(since, now) : null }
    }
    return { screen, name: label, status: 'pending', minutes: null }
  })
}

/** Median minutes a finished check took in this run — null until one has. */
export function typicalMinutes(state: FeedState): number | null {
  return typicalCheckMinutes(timelineOf(state).checks)
}

/** Silence long enough to say so — per stage, generous, honest. */
export const STALL_MINUTES: Record<string, number> = {
  docs_received: 15,
  digitizing: 20,
  analyzing: 45,
}

export function stalledMinutes(state: FeedState, stage: string | null | undefined, now = Date.now()): number | null {
  if (!stage || !(stage in STALL_MINUTES) || !state.lastSignalAt) return null
  const m = minutesSince(state.lastSignalAt, now)
  return m >= STALL_MINUTES[stage] ? m : null
}
