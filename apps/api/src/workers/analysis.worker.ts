import { Worker, Job } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createConnection } from '../lib/redis';
import { runAnalysis, type AnalysisModel } from '../services/analysis.service';

/**
 * Analysis worker (M4). Honest failure mode: with no model configured the
 * case STAYS at DOCS_COMPLETE and this logs loudly — never fake findings,
 * never fake progress (SRE-4). BullMQ retries cover transient model errors.
 */
function buildModel(): AnalysisModel | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!key) return null;
  const modelName = process.env.ANALYSIS_MODEL ?? 'gemini-1.5-pro';
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName });
  return {
    name: modelName,
    invoke: async (system, user) => {
      const res = await model.generateContent(`${system}\n\n${user}`);
      return res.response.text();
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
        `[analysis] No model API key configured — case ${caseId} remains at DOCS_COMPLETE. ` +
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
