import type Anthropic from '@anthropic-ai/sdk';

/**
 * Request shape + cache pre-warm for the analysis engine (cost doc §3.2;
 * model_landscape_2026-09.md §2).
 *
 * The RECORD is a byte-stable cached user block; the per-screen instruction
 * comes AFTER the cache breakpoint, so every screen×sample shares one prefix.
 *
 * Measured 2026-08-30: parallel batch items RACE the prompt cache — on a
 * 696k-token record 7 of 10 items re-wrote it, and cache writes were 88% of
 * a $17 run. Fix (PO 2026-09-11): before submitting a batch, ONE live
 * request with max_tokens=1 writes the prefix to a 1-hour cache; the batch
 * items then carry the same 1h breakpoint and read it. Cost model per
 * Gary-sized case on Fable 5.1: as measured $40 → ~$24 pre-warmed batch.
 */
export const FIXED_SYSTEM =
  'You are a meticulous post-conviction record examiner. You analyze Texas criminal court records exactly as instructed in the final message of each request, and you respond with ONLY the JSON object that instruction specifies.';

export type CacheTtl = '5m' | '1h';

export function cacheControl(ttl: CacheTtl): { type: 'ephemeral'; ttl?: '1h' } {
  return ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

/** The user message every analysis request shares: cached record, then the instruction. */
export function buildMessages(record: string, instruction: string, ttl: CacheTtl): Anthropic.MessageParam[] {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: record, cache_control: cacheControl(ttl) },
        { type: 'text', text: instruction },
      ],
    },
  ];
}

export function prewarmEnabled(): boolean {
  return process.env.ANALYSIS_CACHE_PREWARM !== '0';
}

export interface PrewarmUsage { cacheWriteTokens: number; cacheReadTokens: number; inputTokens: number }

/**
 * Write the record prefix to the 1h cache with a 1-token live request.
 * The instruction block must be present (it is what follows the breakpoint)
 * but its text is irrelevant to the cached prefix, so a fixed stub is used.
 * Returns usage so the caller can record cost; throws on API failure — the
 * caller decides whether to proceed without the warm cache.
 */
export async function prewarmCache(
  client: Pick<Anthropic, 'messages'>,
  modelName: string,
  record: string
): Promise<PrewarmUsage> {
  const res = await client.messages.create({
    model: modelName,
    max_tokens: 1,
    system: FIXED_SYSTEM,
    messages: buildMessages(record, 'Reply with the single word OK.', '1h'),
  });
  return {
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    inputTokens: res.usage.input_tokens,
  };
}
