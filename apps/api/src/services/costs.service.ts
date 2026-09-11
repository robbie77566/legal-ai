import prisma, { withTenant } from '@hg/database';

/**
 * NFR-4 cost telemetry: every model/OCR call writes a CostRecord, so
 * per-case COGS is one query. Tokens/pages are ground truth; dollars are
 * an ESTIMATE from env-configured rates — set these from the current
 * price sheet at deploy:
 *   MODEL_USD_PER_MTOK_IN   (default 5)    MODEL_USD_PER_MTOK_OUT (default 25)   — Opus 5 (dev/test); production sets Fable's 10/50
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

/**
 * Running costs by the week they were INCURRED (ops Money page, 2026-09-11).
 * Distinct from paymentsSummary's cohort view, which charges a case's cost
 * to the week it was SOLD. This answers "what did we spend this week and on
 * what" — model vs OCR vs other, how many cases were worked, cost per case.
 * Owner connection: a cross-tenant system surface (ADMIN only at the route).
 */
export async function spendByWeek(weeks = 12) {
  const { weekOf } = await import('./refunds.service');
  const n = Math.min(52, Math.max(1, Math.floor(weeks) || 12));
  const from = new Date(Date.now() - n * 7 * 86_400_000);
  const rows = await prisma.costRecord.findMany({
    where: { createdAt: { gte: from } },
    select: { caseId: true, source: true, provider: true, amountUsd: true, createdAt: true },
  });
  type Week = { weekOf: string; cases: number; modelUsd: number; ocrUsd: number; otherUsd: number; totalUsd: number; perCaseUsd: number | null; byProvider: Record<string, number> };
  const weeksMap = new Map<string, Week & { caseIds: Set<string> }>();
  for (const r of rows) {
    const key = weekOf(r.createdAt);
    let w = weeksMap.get(key);
    if (!w) { w = { weekOf: key, cases: 0, modelUsd: 0, ocrUsd: 0, otherUsd: 0, totalUsd: 0, perCaseUsd: null, byProvider: {}, caseIds: new Set() }; weeksMap.set(key, w); }
    w.caseIds.add(r.caseId);
    if (r.source === 'model') w.modelUsd += r.amountUsd; else if (r.source === 'ocr') w.ocrUsd += r.amountUsd; else w.otherUsd += r.amountUsd;
    w.totalUsd += r.amountUsd;
    const prov = r.provider.replace(/#.*$/, '');
    w.byProvider[prov] = (w.byProvider[prov] ?? 0) + r.amountUsd;
  }
  const out = [...weeksMap.values()]
    .map(({ caseIds, ...w }) => ({ ...w, cases: caseIds.size, perCaseUsd: caseIds.size ? w.totalUsd / caseIds.size : null }))
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
  const totalUsd = out.reduce((a, w) => a + w.totalUsd, 0);
  const allCases = new Set(rows.map((r) => r.caseId)).size;
  return { weeks: n, from: from.toISOString(), totalUsd, cases: allCases, perCaseUsd: allCases ? totalUsd / allCases : null, rows: out };
}

/** Total recorded cost per case, for the cases list (ADMIN). */
export async function cogsByCase(): Promise<Record<string, number>> {
  const g = await prisma.costRecord.groupBy({ by: ['caseId'], _sum: { amountUsd: true } });
  return Object.fromEntries(g.map((x) => [x.caseId, x._sum.amountUsd ?? 0]));
}
