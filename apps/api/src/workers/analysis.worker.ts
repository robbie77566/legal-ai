import { Worker, Job } from 'bullmq';
import { createConnection } from '../lib/redis';
import { concurrencyFromEnv } from '../lib/concurrency';
import { runAnalysis, type AnalysisModel } from '../services/analysis.service';
import { buildModel } from '../services/analysis-model';

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
 * thinking (Opus 5 default — no `thinking` param needed). Refusals are handled
 * client-side (see streamOnce) — server-side fallbacks + the stream helper
 * crashed with "reading 'signal'" (2026-09-11).
 *
 * Honest failure mode unchanged: with no Anthropic credential the case STAYS
 * at DOCS_COMPLETE and this logs loudly — never fake findings, never fake
 * progress (SRE-4). BullMQ retries cover transient API errors.
 */


export const analysisWorker = new Worker(
  'analysis',
  async (job: Job) => {
    const { caseId, tenantId } = job.data as { caseId: string; tenantId: string };
    // Multi-engine union (Advanced tier): ANALYSIS_ENGINES is a comma list;
    // single-engine default preserves the launch posture.
    const engines = (process.env.ANALYSIS_ENGINES ?? process.env.ANALYSIS_MODEL ?? 'claude-opus-5') // unset env = dev/test → Opus 5; production sets Fable 5.1 in render.yaml
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

    // PO decision (2026-09-01): auto-delivery so a human is never the
    // turnaround bottleneck; quality gates + spot-checks in auto-qa.
    // OFF unless AUTO_APPROVE=1 (go-live gated on validation + counsel).
    try {
      const { autoApproveCase, autoApproveEnabled } = await import('../services/auto-qa.service');
      if (autoApproveEnabled()) {
        const { SCREENS_BY_LANE } = await import('../services/analysis.service');
        const kase = await (await import('@hg/database')).default.case.findUniqueOrThrow({ where: { id: caseId } });
        const lane = (kase.lane === 'PLEA' ? 'PLEA' : 'TRIAL') as 'TRIAL' | 'PLEA';
        await autoApproveCase(caseId, tenantId, { ...summary, screensExpected: SCREENS_BY_LANE[lane].length });
      }
    } catch (e) {
      // Auto-QA failure leaves the case safely in QA_REVIEW for a human.
      console.warn(`[auto-qa] case ${caseId}: ${(e as Error).message.slice(0, 160)}`);
    }
    return summary;
  },
  { connection: createConnection(), concurrency: concurrencyFromEnv('ANALYSIS_CONCURRENCY', 2) }
);

// A dead analysis job left NO trace in the logs (nine silent deaths on one
// case, 2026-09-11) — BullMQ records failedReason in Redis, the api's
// request-scoped error hook never sees worker errors, and Sentry was not
// told. Say it loudly, with the attempt count, and capture it.
analysisWorker.on('failed', (job, err) => {
  const { caseId } = (job?.data ?? {}) as { caseId?: string };
  console.error(`[analysis] JOB FAILED case ${caseId ?? '?'} attempt ${job?.attemptsMade ?? '?'}/${job?.opts.attempts ?? '?'}: ${String(err?.message ?? err).slice(0, 600)}`);
  if (process.env.SENTRY_DSN) void import('@sentry/node').then((S) => S.captureException(err, { tags: { worker: 'analysis', caseId: caseId ?? '' } }));
});
analysisWorker.on('error', (err) => console.error(`[analysis] worker error: ${String(err?.message ?? err).slice(0, 300)}`));
