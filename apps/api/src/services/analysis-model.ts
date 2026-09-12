import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisModel } from './analysis.service';
import { recordModelCost } from './costs.service';
import { FIXED_SYSTEM, buildMessages, prewarmCache, prewarmEnabled } from './analysis-request';

/**
 * The live/batch Anthropic-backed AnalysisModel (moved out of the worker on
 * 2026-09-12 so the case-summary backfill can use the same model, caching
 * and cost recording without importing the BullMQ worker).
 *
 * Request shape is built for prompt caching (cost doc §3.2): the RECORD is a
 * byte-stable cached user block, and the per-screen instruction comes AFTER
 * the cache breakpoint — so screen 1 writes the record to cache and screens
 * 2..n read it at ~0.1× input price.
 */
export function buildModel(caseId: string, tenantId: string, modelName: string): AnalysisModel | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic(); // resolves credentials from the environment

  /**
   * One streamed request. NO server-side fallbacks here: with
   * `fallbacks:'default'` a refusal re-routed by the server comes back in a
   * shape the SDK's stream helper cannot handle — it dereferences
   * `stream.controller.signal` and throws "Cannot read properties of
   * undefined (reading 'signal')". That killed nine production runs on a
   * record whose content trips the classifiers (2026-09-11). Refusals are
   * handled by US instead: one client-side retry on the fallback engine,
   * then an empty sample.
   */
  const streamOnce = async (model: string, screenInstruction: string, record: string) =>
    client.messages
      .stream({
        model,
        max_tokens: 32000, // Fable comparison hit 16k mid-array; verbose models need headroom
        system: FIXED_SYSTEM,
        // Live-sequential: screens run one after another within minutes,
        // so the 5-minute cache (1.25× write) is enough; screens 2..n read.
        messages: buildMessages(record, screenInstruction, '5m'),
      })
      .finalMessage();

  const FALLBACK_ENGINE = process.env.ANALYSIS_FALLBACK_MODEL ?? (modelName.startsWith('claude-opus') ? '' : 'claude-opus-5');

  const liveInvoke = async (screenInstruction: string, record: string): Promise<string> => {
      let response = await streamOnce(modelName, screenInstruction, record);
      if (response.stop_reason === 'refusal' && FALLBACK_ENGINE) {
        console.warn(`[analysis] ${modelName} refused a screen (category: ${response.stop_details?.category ?? 'unknown'}) — retrying once on ${FALLBACK_ENGINE}`);
        response = await streamOnce(FALLBACK_ENGINE, screenInstruction, record);
      }
      if (response.stop_reason === 'refusal') {
        // Every engine declined — an empty screen for QA, never a crash.
        console.warn(`[analysis] refusal on screen (category: ${response.stop_details?.category ?? 'unknown'})`);
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
   * A thrown error inside ONE sample must never kill the run (the batch path
   * already holds this rule). Retry once — most live failures are transient
   * (disconnect mid-stream, 529) — then an empty sample with the STACK in the
   * log, so the next unknown failure names its line.
   */
  const liveInvokeResilient = async (screenInstruction: string, record: string): Promise<string> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await liveInvoke(screenInstruction, record);
      } catch (e) {
        const err = e as Error;
        console.error(`[analysis] live sample failed (attempt ${attempt}/2): ${String(err.message).slice(0, 300)}\n${String(err.stack ?? '').split('\n').slice(0, 6).join('\n')}`);
        if (attempt === 2) return '{"findings":[]}';
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    return '{"findings":[]}';
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
      // Cache pre-warm (PO 2026-09-11): one 1-token live request writes the
      // record to a 1-HOUR cache before the batch exists, so the parallel
      // items read it instead of racing to write it (measured: 7/10 items
      // re-wrote a 696k record; writes were 88% of the run's cost).
      if (prewarmEnabled()) {
        try {
          const u = await prewarmCache(client, modelName, record);
          console.log(`[analysis] cache pre-warm (1h) — cache_write:${u.cacheWriteTokens} cache_read:${u.cacheReadTokens} in:${u.inputTokens}`);
          void recordModelCost({
            caseId, tenantId, provider: `${modelName}#prewarm`,
            usage: { tokensIn: u.inputTokens, tokensOut: 1, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens },
            usdFactor: 1.6, // usage is ~all cache-write: the 1h write is 2× base vs the estimator's 1.25× default → ×1.6
          });
        } catch (e) {
          console.warn(`[analysis] cache pre-warm failed — batch proceeds unwarmed: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      const batch = await client.messages.batches.create({
        requests: requests.map((r) => ({
          custom_id: r.key,
          params: {
            model: modelName,
            max_tokens: 32000,
            system: FIXED_SYSTEM,
            messages: buildMessages(record, r.instruction, '1h'), // same 1h breakpoint as the pre-warm → reads
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
      if (out.has(r.key)) continue;
      try {
        out.set(r.key, await liveInvokeResilient(r.instruction, record));
      } catch (e) {
        // One filtered/failed SAMPLE must never kill the run (learned live:
        // a content-filtering rejection on one sentencing sample wedged a
        // whole case at ANALYZING). Empty screen-sample, loud log, QA and
        // the sibling sample carry the recall.
        console.warn(`[analysis] live fallback for ${r.key} failed — empty sample: ${(e as Error).message.slice(0, 160)}`);
        out.set(r.key, '{"findings":[]}');
      }
    }
    return out;
  };

  return {
    name: modelName,
    invoke: liveInvokeResilient,
    ...(process.env.ANALYSIS_BATCH === '1' ? { invokeMany: batchInvokeMany } : {}),
  };
}
