import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { createConnection } from '../lib/redis';
import { runAnalysis, type AnalysisModel } from '../services/analysis.service';

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

function buildModel(): AnalysisModel | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const modelName = process.env.ANALYSIS_MODEL ?? 'claude-opus-5';
  const client = new Anthropic(); // resolves credentials from the environment

  return {
    name: modelName,
    invoke: async (screenInstruction, record) => {
      const response = await client.beta.messages
        .stream({
          model: modelName,
          max_tokens: 16000,
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

      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    },
  };
}

export const analysisWorker = new Worker(
  'analysis',
  async (job: Job) => {
    const { caseId, tenantId } = job.data as { caseId: string; tenantId: string };
    const model = buildModel();
    if (!model) {
      console.error(
        `[analysis] No ANTHROPIC_API_KEY configured — case ${caseId} remains at DOCS_COMPLETE. ` +
          'This is a page-level condition in production (SRE-2).'
      );
      return { skipped: 'no model configured' };
    }
    const summary = await runAnalysis(caseId, tenantId, model);
    console.log(`[analysis] case ${caseId}:`, summary);
    return summary;
  },
  { connection: createConnection(), concurrency: 2 }
);
