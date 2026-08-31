import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { createConnection } from '../lib/redis';
import { runAnalysis, type AnalysisModel } from '../services/analysis.service';
import { recordModelCost } from '../services/costs.service';

/**
 * Analysis worker (M4) — Claude Opus 5 via the official Anthropic SDK.
 *
 * Request shape is built for prompt caching (cost doc §3.2): the RECORD is a
 * byte-stable cached user block, and the per-screen instruction comes AFTER
 * the cache breakpoint — so screen 1 writes the record to cache and screens
 * 2..n read it at ~0.1× input price. (The `AnalysisModel` seam's `system`
 * arg is the per-screen instruction; a fixed examiner preamble holds the
 * top-level system slot so the prefix stays identical across screens.)
 *
 * Streaming (long records exceed non-streaming HTTP comfort), adaptive
 * thinking (Opus 5 default — no `thinking` param needed), and server-side
 * refusal fallbacks enabled by default.
 *
 * Honest failure mode unchanged: with no Anthropic credential the case STAYS
 * at DOCS_COMPLETE and this logs loudly — never fake findings, never fake
 * progress (SRE-4). BullMQ retries cover transient API errors.
 */

const FIXED_SYSTEM =
  'You are a meticulous post-conviction record examiner. You analyze Texas criminal court records exactly as instructed in the final message of each request, and you respond with ONLY the JSON object that instruction specifies.';

function buildModel(caseId: string, tenantId: string, modelName: string): AnalysisModel | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic(); // resolves credentials from the environment

  const liveInvoke = async (screenInstruction: string, record: string): Promise<string> => {
      const response = await client.beta.messages
        .stream({
          model: modelName,
          max_tokens: 32000, // Fable comparison hit 16k mid-array; verbose models need headroom
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: FIXED_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: record,
                  cache_control: { type: 'ephemeral' }, // screens 2..n read this at ~0.1×
                },
                { type: 'text', text: screenInstruction },
              ],
            },
          ],
        })
        .finalMessage();

      if (response.stop_reason === 'refusal') {
        // Whole fallback chain declined — an empty screen for QA, never a crash.
        console.warn(
          `[analysis] refusal on screen (category: ${response.stop_details?.category ?? 'unknown'})`
        );
        return '{"findings":[]}';
      }

      console.log(
        `[analysis] ${response.model} usage — in:${response.usage.input_tokens}` +
          ` cache_write:${response.usage.cache_creation_input_tokens ?? 0}` +
          ` cache_read:${response.usage.cache_read_input_tokens ?? 0}` +
          ` out:${response.usage.output_tokens}`
      );
      // NFR-4: COGS is a query. Fire-and-forget by design (never blocks or
      // kills paid model work); estimate rates are env-configured.
      void recordModelCost({
        caseId,
        tenantId,
        provider: response.model,
        usage: {
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      });

      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
  };

  /**
   * Batch runner (Message Batches, 50% price; cost doc §3.2). One batch
   * per case run — requests share the record prefix, so prompt-cache hits
   * inside the batch are best-effort but likely. Stage budget: past
   * ANALYSIS_BATCH_BUDGET_MS the batch is cancelled and unfinished
   * requests fall back to the live API (the 10-business-day SLA never
   * hangs on a stuck batch). Every key gets a result, guaranteed.
   */
  const batchInvokeMany = async (
    requests: { key: string; instruction: string }[],
    record: string
  ): Promise<Map<string, string>> => {
    const budgetMs = Math.max(60_000, Number(process.env.ANALYSIS_BATCH_BUDGET_MS ?? '') || 4 * 3600_000);
    const out = new Map<string, string>();
    try {
      const batch = await client.messages.batches.create({
        requests: requests.map((r) => ({
          custom_id: r.key,
          params: {
            model: modelName,
            max_tokens: 32000,
            system: FIXED_SYSTEM,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: record, cache_control: { type: 'ephemeral' } },
                  { type: 'text', text: r.instruction },
                ],
              },
            ],
          },
        })),
      });
      console.log(`[analysis] batch ${batch.id}: ${requests.length} requests submitted`);

      const started = Date.now();
      let b = batch;
      while (b.processing_status === 'in_progress') {
        if (Date.now() - started > budgetMs) {
          console.warn(`[analysis] batch ${batch.id} over budget — cancelling, falling back live`);
          await client.messages.batches.cancel(batch.id).catch(() => {});
          break;
        }
        await new Promise((res) => setTimeout(res, 30_000));
        b = await client.messages.batches.retrieve(batch.id);
      }

      if (b.processing_status === 'ended') {
        for await (const entry of await client.messages.batches.results(batch.id)) {
          if (entry.result.type !== 'succeeded') {
            console.warn(`[analysis] batch item ${entry.custom_id}: ${entry.result.type}`);
            continue;
          }
          const msg = entry.result.message;
          void recordModelCost({
            caseId, tenantId, provider: `${msg.model}#batch`,
            usage: {
              tokensIn: msg.usage.input_tokens,
              tokensOut: msg.usage.output_tokens,
              cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
            },
            usdFactor: 0.5,
          });
          console.log(
            `[analysis] batch item ${entry.custom_id} usage — in:${msg.usage.input_tokens}` +
              ` cache_write:${msg.usage.cache_creation_input_tokens ?? 0}` +
              ` cache_read:${msg.usage.cache_read_input_tokens ?? 0} out:${msg.usage.output_tokens}`
          );
          out.set(
            entry.custom_id,
            msg.stop_reason === 'refusal'
              ? '{"findings":[]}'
              : msg.content
                  .filter((c): c is Anthropic.TextBlock => c.type === 'text')
                  .map((c) => c.text)
                  .join('')
          );
        }
      }
    } catch (e) {
      console.warn(`[analysis] batch submission failed — full live fallback: ${(e as Error).message.slice(0, 160)}`);
    }

    for (const r of requests) {
      if (!out.has(r.key)) out.set(r.key, await liveInvoke(r.instruction, record));
    }
    return out;
  };

  return {
    name: modelName,
    invoke: liveInvoke,
    ...(process.env.ANALYSIS_BATCH === '1' ? { invokeMany: batchInvokeMany } : {}),
  };
}

export const analysisWorker = new Worker(
  'analysis',
  async (job: Job) => {
    const { caseId, tenantId } = job.data as { caseId: string; tenantId: string };
    // Multi-engine union (Advanced tier): ANALYSIS_ENGINES is a comma list;
    // single-engine default preserves the launch posture.
    const engines = (process.env.ANALYSIS_ENGINES ?? process.env.ANALYSIS_MODEL ?? 'claude-opus-5')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const models = engines
      .map((name) => buildModel(caseId, tenantId, name))
      .filter((m): m is AnalysisModel => m !== null);
    const model = models[0];
    if (!model) {
      console.error(
        `[analysis] No ANTHROPIC_API_KEY configured — case ${caseId} remains at DOCS_COMPLETE. ` +
          'This is a page-level condition in production (SRE-2).'
      );
      return { skipped: 'no model configured' };
    }
    const summary = await runAnalysis(caseId, tenantId, models);
    console.log(`[analysis] case ${caseId}:`, summary);
    return summary;
  },
  { connection: createConnection(), concurrency: 2 }
);
