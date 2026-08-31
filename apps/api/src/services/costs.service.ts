import { withTenant } from '@hg/database';

/**
 * NFR-4 cost telemetry: every model/OCR call writes a CostRecord, so
 * per-case COGS is one query. Tokens/pages are ground truth; dollars are
 * an ESTIMATE from env-configured rates — set these from the current
 * price sheet at deploy:
 *   MODEL_USD_PER_MTOK_IN   (default 5)    MODEL_USD_PER_MTOK_OUT (default 25)
 *   MODEL_CACHE_READ_MULT   (default 0.1)  MODEL_CACHE_WRITE_MULT (default 1.25)
 *   TEXTRACT_USD_PER_1K_PAGES (default 1.5)
 *
 * Failures are logged, never thrown: telemetry must not kill a paid run.
 */

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export interface ModelUsage {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function estimateModelUsd(u: ModelUsage): number {
  const inRate = num(process.env.MODEL_USD_PER_MTOK_IN, 5) / 1_000_000;
  const outRate = num(process.env.MODEL_USD_PER_MTOK_OUT, 25) / 1_000_000;
  const readMult = num(process.env.MODEL_CACHE_READ_MULT, 0.1);
  const writeMult = num(process.env.MODEL_CACHE_WRITE_MULT, 1.25);
  return (
    u.tokensIn * inRate +
    u.cacheReadTokens * inRate * readMult +
    u.cacheWriteTokens * inRate * writeMult +
    u.tokensOut * outRate
  );
}

export async function recordModelCost(args: {
  caseId: string;
  tenantId: string;
  provider: string;
  detail?: string;
  usage: ModelUsage;
  /** Price multiplier vs. the live rates (Message Batches: 0.5). */
  usdFactor?: number;
}): Promise<void> {
  try {
    await withTenant(args.tenantId, async (tx) => {
      await tx.costRecord.create({
        data: {
          caseId: args.caseId,
          tenantId: args.tenantId,
          source: 'model',
          provider: args.provider,
          detail: args.detail,
          tokensIn: args.usage.tokensIn,
          tokensOut: args.usage.tokensOut,
          cacheReadTokens: args.usage.cacheReadTokens,
          cacheWriteTokens: args.usage.cacheWriteTokens,
          amountUsd: estimateModelUsd(args.usage) * (args.usdFactor ?? 1),
        },
      });
    });
  } catch (e) {
    console.warn(`[costs] model cost record failed for case ${args.caseId}: ${(e as Error).message}`);
  }
}

export async function recordOcrCost(args: {
  caseId: string;
  tenantId: string;
  pages: number;
  detail?: string;
}): Promise<void> {
  if (args.pages <= 0) return;
  try {
    const rate = num(process.env.TEXTRACT_USD_PER_1K_PAGES, 1.5) / 1000;
    await withTenant(args.tenantId, async (tx) => {
      await tx.costRecord.create({
        data: {
          caseId: args.caseId,
          tenantId: args.tenantId,
          source: 'ocr',
          provider: 'textract',
          detail: args.detail,
          pages: args.pages,
          amountUsd: args.pages * rate,
        },
      });
    });
  } catch (e) {
    console.warn(`[costs] ocr cost record failed for case ${args.caseId}: ${(e as Error).message}`);
  }
}

/** COGS is a query (NFR-4): totals per source plus the overall estimate. */
export async function caseCogs(caseId: string, tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.costRecord.findMany({ where: { caseId } });
    const by = (source: string) => rows.filter((r) => r.source === source);
    const sum = (rs: typeof rows) => rs.reduce((a, r) => a + r.amountUsd, 0);
    return {
      records: rows.length,
      model: {
        calls: by('model').length,
        tokensIn: by('model').reduce((a, r) => a + (r.tokensIn ?? 0), 0),
        tokensOut: by('model').reduce((a, r) => a + (r.tokensOut ?? 0), 0),
        cacheReadTokens: by('model').reduce((a, r) => a + (r.cacheReadTokens ?? 0), 0),
        cacheWriteTokens: by('model').reduce((a, r) => a + (r.cacheWriteTokens ?? 0), 0),
        usd: sum(by('model')),
      },
      ocr: { pages: by('ocr').reduce((a, r) => a + (r.pages ?? 0), 0), usd: sum(by('ocr')) },
      totalUsd: sum(rows),
    };
  });
}
