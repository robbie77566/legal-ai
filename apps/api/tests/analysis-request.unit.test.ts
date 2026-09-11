import { describe, it, expect, afterEach } from 'vitest';
import { buildMessages, prewarmCache, prewarmEnabled, FIXED_SYSTEM } from '../src/services/analysis-request';

/** Cache pre-warm (2026-09-11): the batch's parallel items must READ the
 *  record from a 1h cache written once, not race to write it. */
describe('analysis request shape + cache pre-warm', () => {
  afterEach(() => { delete process.env.ANALYSIS_CACHE_PREWARM; });

  it('record is the cached first block; instruction follows the breakpoint; ttl only on 1h', () => {
    const m5 = buildMessages('RECORD', 'do screen', '5m');
    const c5 = m5[0].content as Array<{ type: string; text: string; cache_control?: { type: string; ttl?: string } }>;
    expect(c5[0]).toMatchObject({ text: 'RECORD', cache_control: { type: 'ephemeral' } });
    expect(c5[0].cache_control).not.toHaveProperty('ttl');
    expect(c5[1]).toMatchObject({ text: 'do screen' });
    expect(c5[1]).not.toHaveProperty('cache_control');
    const c1h = buildMessages('RECORD', 'x', '1h')[0].content as Array<{ cache_control?: { ttl?: string } }>;
    expect(c1h[0].cache_control).toMatchObject({ type: 'ephemeral', ttl: '1h' });
  });

  it('pre-warm: one live request, 1 output token, 1h breakpoint on the identical record prefix; usage returned', async () => {
    const calls: unknown[] = [];
    const client = { messages: { create: async (p: unknown) => { calls.push(p); return { usage: { input_tokens: 12, cache_creation_input_tokens: 696000, cache_read_input_tokens: 0 } }; } } };
    const u = await prewarmCache(client as never, 'claude-fable-5-1', 'RECORD');
    expect(calls).toHaveLength(1);
    const p = calls[0] as { model: string; max_tokens: number; system: string; messages: ReturnType<typeof buildMessages> };
    expect(p.model).toBe('claude-fable-5-1');
    expect(p.max_tokens).toBe(1);
    expect(p.system).toBe(FIXED_SYSTEM);
    const first = (p.messages[0].content as Array<{ text: string; cache_control?: { ttl?: string } }>)[0];
    expect(first.text).toBe('RECORD');
    expect(first.cache_control).toMatchObject({ type: 'ephemeral', ttl: '1h' });
    // The batch items must produce the SAME prefix bytes as the pre-warm.
    expect((buildMessages('RECORD', 'anything', '1h')[0].content as unknown[])[0]).toEqual(first);
    expect(u).toEqual({ cacheWriteTokens: 696000, cacheReadTokens: 0, inputTokens: 12 });
  });

  it('is on by default and off only with ANALYSIS_CACHE_PREWARM=0', () => {
    expect(prewarmEnabled()).toBe(true);
    process.env.ANALYSIS_CACHE_PREWARM = '0';
    expect(prewarmEnabled()).toBe(false);
    process.env.ANALYSIS_CACHE_PREWARM = '1';
    expect(prewarmEnabled()).toBe(true);
  });
});
