/**
 * Model comparison on the executeScreen seam (model_evaluation.md §4.1):
 * everything held constant — frozen chunks, record build, screen prompts,
 * grounding filter — only the model swaps. Compares a challenger's live
 * output against the champion's PERSISTED findings from the latest run.
 *
 * Usage: pnpm tsx scripts/compare-models.ts <caseId> [challengerModel]
 *
 * Calibration caveat: differences are differences, not correctness — that
 * needs the attorney-adjudicated eval ledger (M4 remainder).
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
let dir = process.cwd();
while (!fs.existsSync(path.join(dir, '.env')) && dir !== path.dirname(dir)) dir = path.dirname(dir);
dotenv.config({ path: path.join(dir, '.env') });

import Anthropic from '@anthropic-ai/sdk';
import prisma from '@hg/database';
import {
  buildRecord,
  executeScreen,
  SCREENS_BY_LANE,
  type AnalysisChunk,
  type AnalysisModel,
  type ScreenFinding,
} from '../src/services/analysis.service';

const FIXED_SYSTEM =
  'You are a meticulous post-conviction record examiner. You analyze Texas criminal court records exactly as instructed in the final message of each request, and you respond with ONLY the JSON object that instruction specifies.';

function buildChallenger(modelName: string): AnalysisModel {
  const client = new Anthropic();
  return {
    name: modelName,
    invoke: async (screenInstruction, record) => {
      const response = await client.beta.messages
        .stream({
          model: modelName,
          max_tokens: 32000  // Fable comparison hit 16k mid-array; verbose models need headroom,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: FIXED_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: record, cache_control: { type: 'ephemeral' } },
                { type: 'text', text: screenInstruction },
              ],
            },
          ],
        })
        .finalMessage();
      if (response.stop_reason === 'refusal') return '{"findings":[]}';
      console.log(
        `  [${modelName}] usage — in:${response.usage.input_tokens}` +
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

const norm = (q: string) => q.replace(/\s+/g, ' ').trim().toLowerCase();

(async () => {
  const caseId = process.argv[2];
  const challengerName = process.argv[3] ?? 'claude-fable-5';
  if (!caseId) throw new Error('usage: compare-models.ts <caseId> [challengerModel]');

  const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  const lane = (kase.lane === 'PLEA' ? 'PLEA' : 'TRIAL') as 'TRIAL' | 'PLEA';

  const champRun = await prisma.analysisRun.findFirstOrThrow({
    where: { caseId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
  });
  const champFindings = await prisma.finding.findMany({
    where: { caseId, runId: champRun.id },
    include: { citations: true },
  });
  const champModel = ((champRun.modelConfig as { model?: string })?.model) ?? 'unknown';
  console.log(`champion: run ${champRun.id} (${champModel}) — ${champFindings.length} persisted findings`);

  const docs = await prisma.document.findMany({
    where: { caseId },
    include: { chunks: true },
    orderBy: { createdAt: 'asc' },
  });
  const chunks: AnalysisChunk[] = docs.flatMap((d) => d.chunks);
  const record = buildRecord(chunks);
  console.log(`record: ${chunks.length} chunks | challenger: ${challengerName} | screens: ${SCREENS_BY_LANE[lane].join(', ')}`);

  const challenger = buildChallenger(challengerName);
  const challengerResults: Record<string, { grounded: ScreenFinding[]; dropped: number }> = {};
  for (const screenId of SCREENS_BY_LANE[lane]) {
    console.log(`\n=== screen: ${screenId} ===`);
    const started = Date.now();
    const res = await executeScreen(challenger, screenId, record, chunks);
    challengerResults[screenId] = res;
    console.log(
      `  grounded: ${res.grounded.length} | dropped ungrounded: ${res.dropped} | ${Math.round((Date.now() - started) / 1000)}s`
    );
    for (const f of res.grounded) {
      console.log(`  - [${f.severity} ${f.confidence.toFixed(2)}] ${f.category}`);
    }
  }

  // ---- diff ----
  const champQuotes = new Set(
    champFindings.flatMap((f) => f.citations.map((c) => norm(c.excerpt)).filter(Boolean))
  );
  const challFlat = Object.entries(challengerResults).flatMap(([screen, r]) =>
    r.grounded.map((f) => ({ screen, ...f }))
  );
  const overlap = challFlat.filter((f) => champQuotes.has(norm(f.quote)));

  const bySev = (fs2: { severity: string }[]) =>
    ['dispositive', 'supportive', 'background']
      .map((s) => `${s}:${fs2.filter((f) => f.severity === s).length}`)
      .join(' ');

  console.log('\n================ COMPARISON ================');
  console.log(`champion   (${champModel}): ${champFindings.length} findings — ${bySev(champFindings)}`);
  console.log(`challenger (${challengerName}): ${challFlat.length} findings — ${bySev(challFlat)}`);
  console.log(`quote-level overlap (same verbatim citation): ${overlap.length}`);
  console.log(
    `dropped ungrounded — challenger: ${Object.values(challengerResults).reduce((a, r) => a + r.dropped, 0)}`
  );

  const outPath = path.join(dir, `docs/evaluation/compare_${challengerName}_${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        caseId,
        championRunId: champRun.id,
        championModel: champModel,
        challengerModel: challengerName,
        champion: champFindings.map((f) => ({
          category: f.category, severity: f.severity, confidence: f.confidence,
          partB: f.partBText, quotes: f.citations.map((c) => c.excerpt),
        })),
        challenger: challFlat.map(({ chunk, ...f }) => ({ ...f, chunkId: chunk.id })),
        overlapCount: overlap.length,
      },
      null,
      2
    )
  );
  console.log(`full diff written: ${outPath}`);
  process.exit(0);
})();
