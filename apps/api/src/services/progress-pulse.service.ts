/**
 * Live progress pulses (status page feedback, 2026-09-27).
 *
 * Two classes of progress signal reach the family's status page:
 *   - FACTS: CaseEvents — durable, registry-validated, replayable. Published
 *     by the transactional outbox, which stays the ONLY publisher on
 *     `case-progress:{caseId}` (M1 exit criterion).
 *   - PULSES: this module — ephemeral liveness for the long silences BETWEEN
 *     facts: a 15–20 minute model call, a 30-second batch poll, a Textract
 *     job on a 300-page scan. Published straight to `case-pulse:{caseId}`
 *     (a separate channel, so the outbox invariant holds) and mirrored into
 *     one short-TTL key so a cold page load can show the same line.
 *
 * A pulse says WHICH step is running, its PHASE, and WHEN it started — never
 * legal content, never finding counts (pre-QA honesty rule). Every call is
 * fire-and-forget and swallows failures: feedback must never break paid
 * model work, and a missing Redis simply means no pulses.
 */

export type PulsePhase = 'reading' | 'writing' | 'waiting' | 'saving';
export type PulseStage = 'digitizing' | 'analyzing';
export type PulseLabel = 'document' | 'context' | 'summary' | 'batch' | 'check';

export interface PulseStep {
  stage: PulseStage;
  label: PulseLabel;
  documentId?: string;
  screen?: string;
  sample?: number;
  samplesTotal?: number;
  screenIndex?: number;
  screensTotal?: number;
  /** batch: model passes returned so far / submitted. */
  done?: number;
  total?: number;
  startedAt: string;
}

export interface Pulse {
  kind: 'pulse';
  caseId: string;
  at: string;
  step: PulseStep;
  phase: PulsePhase;
}

/** The subset of ioredis this module uses — injectable for tests. */
export interface PulseSink {
  publish(channel: string, message: string): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export const pulseChannel = (caseId: string) => `case-pulse:${caseId}`;
export const pulseLastKey = (caseId: string) => `case-pulse:${caseId}:last`;
/** Two pulses with nothing new between them are at least this far apart. */
export const PULSE_MIN_GAP_MS = 4_000;
/** A silent step (a model still reading a 700k-token record) repeats its last pulse this often. */
export const PULSE_HEARTBEAT_MS = 15_000;
/** How long a cold load may trust the mirrored pulse. */
export const PULSE_LAST_TTL_S = 300;

interface LiveStep {
  caseId: string;
  step: PulseStep;
  phase: PulsePhase;
  lastSentAt: number;
  timer: ReturnType<typeof setInterval>;
}

const live = new Map<string, LiveStep>();

let sinkOverride: PulseSink | null | undefined;
let sinkPromise: Promise<PulseSink | null> | undefined;

/** Test seam: inject a fake sink, or `null` to disable pulses entirely. */
export function setPulseSink(sink: PulseSink | null | undefined): void {
  sinkOverride = sink;
  sinkPromise = undefined;
}

async function sink(): Promise<PulseSink | null> {
  if (sinkOverride !== undefined) return sinkOverride;
  if (!sinkPromise) {
    sinkPromise = (async () => {
      try {
        const { createConnection } = await import('../lib/redis');
        return createConnection() as unknown as PulseSink;
      } catch {
        return null;
      }
    })();
  }
  return sinkPromise;
}

function send(entry: LiveStep, now = Date.now()): void {
  entry.lastSentAt = now;
  const pulse: Pulse = { kind: 'pulse', caseId: entry.caseId, at: new Date(now).toISOString(), step: entry.step, phase: entry.phase };
  const json = JSON.stringify(pulse);
  void sink()
    .then(async (s) => {
      if (!s) return;
      await s.publish(pulseChannel(entry.caseId), json);
      await s.set(pulseLastKey(entry.caseId), json, 'EX', PULSE_LAST_TTL_S);
    })
    .catch(() => {});
}

export interface StepHandle {
  pulse(phase?: PulsePhase, patch?: Partial<Omit<PulseStep, 'startedAt'>>): void;
  end(): void;
}

/**
 * Open a step. One analysis step per case at a time (keyed by caseId, so
 * the model wrapper can pulse by caseId alone); concurrent digitizations of
 * the same case pass their own key.
 */
export function beginStep(
  caseId: string,
  step: Omit<PulseStep, 'startedAt'> & { startedAt?: string },
  phase: PulsePhase = 'reading',
  key: string = caseId
): StepHandle {
  endStepByKey(key, false);
  const entry: LiveStep = {
    caseId,
    step: { ...step, startedAt: step.startedAt ?? new Date().toISOString() },
    phase,
    lastSentAt: 0,
    timer: setInterval(() => {
      const e = live.get(key);
      if (e) send(e);
    }, PULSE_HEARTBEAT_MS),
  };
  entry.timer.unref?.();
  live.set(key, entry);
  send(entry);
  return { pulse: (p, patch) => pulseByKey(key, p, patch), end: () => endStepByKey(key) };
}

function pulseByKey(key: string, phase?: PulsePhase, patch?: Partial<Omit<PulseStep, 'startedAt'>>): void {
  const entry = live.get(key);
  if (!entry) return;
  let changed = false;
  if (phase && phase !== entry.phase) {
    entry.phase = phase;
    changed = true;
  }
  if (patch) {
    const step = entry.step as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (step[k] !== v) {
        step[k] = v;
        changed = true;
      }
    }
  }
  const now = Date.now();
  if (!changed && now - entry.lastSentAt < PULSE_MIN_GAP_MS) return;
  send(entry, now);
}

function endStepByKey(key: string, clearLast = true): void {
  const entry = live.get(key);
  if (!entry) return;
  clearInterval(entry.timer);
  live.delete(key);
  if (clearLast) {
    void sink()
      .then((s) => s?.del(pulseLastKey(entry.caseId)))
      .catch(() => {});
  }
}

/** Pulse the case's analysis step (no-op when none is open). */
export function pulse(caseId: string, phase?: PulsePhase, patch?: Partial<Omit<PulseStep, 'startedAt'>>): void {
  pulseByKey(caseId, phase, patch);
}

/** Close the case's analysis step (no-op when none is open). */
export function endStep(caseId: string): void {
  endStepByKey(caseId);
}

/**
 * The mirrored pulse for a cold page load, or null. Bounded: a Redis that
 * is down must never stall the checklist request that renders the page.
 */
export async function lastPulse(caseId: string, timeoutMs = 300): Promise<Pulse | null> {
  const timeout = <T,>(p: Promise<T>) =>
    Promise.race([
      p,
      new Promise<null>((r) => {
        const t = setTimeout(() => r(null), timeoutMs);
        (t as { unref?: () => void }).unref?.();
      }),
    ]);
  try {
    const s = await timeout(sink());
    if (!s) return null;
    const raw = await timeout(s.get(pulseLastKey(caseId)));
    if (!raw) return null;
    const p = JSON.parse(raw) as Pulse;
    if (p?.kind !== 'pulse' || !p.step || Date.now() - Date.parse(p.at) > PULSE_LAST_TTL_S * 1000) return null;
    return p;
  } catch {
    return null;
  }
}

/** Test seam: forget every open step without touching the sink. */
export function _resetPulses(): void {
  for (const key of [...live.keys()]) endStepByKey(key, false);
}

/** Test seam: what is open right now. */
export function _openSteps(): string[] {
  return [...live.keys()];
}
