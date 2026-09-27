import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  beginStep, pulse, endStep, lastPulse, setPulseSink, _resetPulses, _openSteps,
  pulseChannel, pulseLastKey, PULSE_MIN_GAP_MS, PULSE_HEARTBEAT_MS, PULSE_LAST_TTL_S,
  type PulseSink, type Pulse,
} from '../src/services/progress-pulse.service';

/**
 * Live pulses (status page, 2026-09-27): liveness between durable facts.
 * Published on their own channel (the outbox stays the only publisher on
 * case-progress), mirrored to a TTL key for cold loads, throttled, and
 * never able to break the work they describe.
 */
class FakeSink implements PulseSink {
  published: { channel: string; msg: Pulse }[] = [];
  store = new Map<string, { value: string; ttl: number }>();
  fail = false;
  async publish(channel: string, message: string) {
    if (this.fail) throw new Error('redis down');
    this.published.push({ channel, msg: JSON.parse(message) });
  }
  async set(key: string, value: string, _mode: 'EX', seconds: number) {
    if (this.fail) throw new Error('redis down');
    this.store.set(key, { value, ttl: seconds });
  }
  async get(key: string) {
    if (this.fail) throw new Error('redis down');
    return this.store.get(key)?.value ?? null;
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

const flush = () => new Promise((r) => setImmediate(r));

let sink: FakeSink;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  sink = new FakeSink();
  setPulseSink(sink);
});
afterEach(async () => {
  _resetPulses();
  setPulseSink(undefined);
  vi.useRealTimers();
});

describe('progress pulses', () => {
  it('beginStep publishes at once on the pulse channel and mirrors to the TTL key', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'check', screen: 'iac', sample: 1, samplesTotal: 2, screenIndex: 2, screensTotal: 7 });
    await flush();
    expect(sink.published).toHaveLength(1);
    expect(sink.published[0].channel).toBe(pulseChannel('case_1'));
    expect(sink.published[0].msg).toMatchObject({ kind: 'pulse', caseId: 'case_1', phase: 'reading', step: { label: 'check', screen: 'iac', screensTotal: 7 } });
    expect(typeof sink.published[0].msg.step.startedAt).toBe('string');
    const mirrored = sink.store.get(pulseLastKey('case_1'));
    expect(mirrored?.ttl).toBe(PULSE_LAST_TTL_S);
    expect(JSON.parse(mirrored!.value)).toMatchObject({ step: { screen: 'iac' } });
    expect(JSON.stringify(sink.published[0].msg)).not.toMatch(/finding/i);
  });

  it('a phase change publishes immediately; an unchanged pulse is throttled; the heartbeat repeats a silent step', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'check', screen: 'iac' });
    await flush();
    pulse('case_1', 'reading'); // nothing new, too soon
    await flush();
    expect(sink.published).toHaveLength(1);
    pulse('case_1', 'writing'); // first token streamed
    await flush();
    expect(sink.published).toHaveLength(2);
    expect(sink.published[1].msg.phase).toBe('writing');
    vi.advanceTimersByTime(PULSE_MIN_GAP_MS + 1);
    pulse('case_1'); // same phase, but the gap has passed
    await flush();
    expect(sink.published).toHaveLength(3);
    vi.advanceTimersByTime(PULSE_HEARTBEAT_MS + 1);
    await flush();
    expect(sink.published.length).toBeGreaterThanOrEqual(4);
    expect(sink.published.at(-1)!.msg.phase).toBe('writing');
    expect(sink.published.at(-1)!.msg.step.startedAt).toBe(sink.published[0].msg.step.startedAt);
  });

  it('a batch poll patch with new counts publishes; identical counts inside the gap do not', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'batch', screensTotal: 7, done: 0, total: 14 }, 'waiting');
    await flush();
    pulse('case_1', 'waiting', { done: 0, total: 14 });
    await flush();
    expect(sink.published).toHaveLength(1);
    pulse('case_1', 'waiting', { done: 3, total: 14 });
    await flush();
    expect(sink.published).toHaveLength(2);
    expect(sink.published[1].msg.step).toMatchObject({ done: 3, total: 14 });
  });

  it('endStep stops the heartbeat and clears the mirrored key; a later pulse is a no-op', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'context', screensTotal: 7 });
    await flush();
    endStep('case_1');
    await flush();
    expect(_openSteps()).toEqual([]);
    expect(sink.store.has(pulseLastKey('case_1'))).toBe(false);
    vi.advanceTimersByTime(PULSE_HEARTBEAT_MS * 3);
    pulse('case_1', 'writing');
    await flush();
    expect(sink.published).toHaveLength(1);
  });

  it('a new step for the same case replaces the old one; digitizing steps for two documents coexist by key', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'context', screensTotal: 7 });
    beginStep('case_1', { stage: 'analyzing', label: 'summary', screensTotal: 7 });
    await flush();
    expect(_openSteps()).toEqual(['case_1']);
    const a = beginStep('case_1', { stage: 'digitizing', label: 'document', documentId: 'd1' }, 'reading', 'case_1#d1');
    const b = beginStep('case_1', { stage: 'digitizing', label: 'document', documentId: 'd2' }, 'reading', 'case_1#d2');
    await flush();
    expect(_openSteps()).toEqual(['case_1', 'case_1#d1', 'case_1#d2']);
    a.end();
    expect(_openSteps()).toEqual(['case_1', 'case_1#d2']);
    b.pulse('saving');
    await flush();
    expect(sink.published.at(-1)!.msg).toMatchObject({ phase: 'saving', step: { documentId: 'd2' } });
  });

  it('lastPulse returns the mirrored pulse while fresh and null when stale, missing, or the sink fails', async () => {
    beginStep('case_1', { stage: 'analyzing', label: 'check', screen: 'brady' });
    await flush();
    expect((await lastPulse('case_1'))?.step.screen).toBe('brady');
    expect(await lastPulse('case_2')).toBeNull();
    vi.setSystemTime(Date.now() + (PULSE_LAST_TTL_S + 5) * 1000);
    expect(await lastPulse('case_1')).toBeNull();
    sink.fail = true;
    expect(await lastPulse('case_1')).toBeNull();
  });

  it('a failing sink never throws into the caller', async () => {
    sink.fail = true;
    expect(() => beginStep('case_1', { stage: 'analyzing', label: 'check', screen: 'iac' })).not.toThrow();
    expect(() => pulse('case_1', 'writing')).not.toThrow();
    await flush();
    expect(() => endStep('case_1')).not.toThrow();
  });

  it('with pulses disabled (no sink) every call is a silent no-op', async () => {
    setPulseSink(null);
    beginStep('case_1', { stage: 'analyzing', label: 'check', screen: 'iac' });
    pulse('case_1', 'writing');
    await flush();
    expect(await lastPulse('case_1')).toBeNull();
    endStep('case_1');
  });
});
