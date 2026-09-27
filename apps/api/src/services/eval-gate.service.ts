import fs from 'fs';
import path from 'path';
import prisma from '@hg/database';
import { scoreRun, type EvalLedger, type EvalScorecard, type ScorableFinding } from './eval.service';

/**
 * The eval gate from the ops console (2026-09-27): no developer box needed.
 * Ledgers are the attorney-signed JSON files committed under
 * docs/evaluation/ledgers; a run is scored the way scripts/eval-run.ts
 * scores it — same scorer, same ledger, same pass rule (every canary found).
 */

const LEDGER_NAME = /^[a-z0-9_-]{1,40}$/;

/** The repo's ledger directory, wherever this process runs from (src, dist, or a Render checkout). */
export function ledgerDir(): string | null {
  const starts = [process.cwd(), __dirname];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, 'docs', 'evaluation', 'ledgers');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export interface LedgerSummary {
  name: string;
  caseTitle: string;
  provenance: string;
  mustFind: number;
  verdicts: number;
}

export function listLedgers(): LedgerSummary[] {
  const dir = ledgerDir();
  if (!dir) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((name) => LEDGER_NAME.test(name))
    .sort()
    .flatMap((name) => {
      const ledger = loadLedger(name);
      return ledger ? [{ name, caseTitle: ledger.caseTitle, provenance: ledger.provenance, mustFind: ledger.mustFind.length, verdicts: ledger.verdicts?.length ?? 0 }] : [];
    });
}

export function loadLedger(name: string): EvalLedger | null {
  if (!LEDGER_NAME.test(name)) return null;
  const dir = ledgerDir();
  if (!dir) return null;
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as EvalLedger;
    if (!Array.isArray(parsed.mustFind)) return null;
    return { ...parsed, verdicts: Array.isArray(parsed.verdicts) ? parsed.verdicts : [] };
  } catch {
    return null;
  }
}

export interface EvalGateResult {
  ledger: { name: string; caseTitle: string; provenance: string };
  run: { id: string; runNo: number; startedAt: Date; completedAt: Date | null; model: string | null; promptSet: string | null; promptHash: string | null; findings: number };
  card: EvalScorecard;
  /** The launch rule: every canary found. */
  pass: boolean;
}

/** Score a case's latest completed run (or a named run) against a ledger. */
export async function scoreCaseRun(caseId: string, ledgerName: string, runId?: string): Promise<EvalGateResult | { error: 'no_ledger' | 'no_run' }> {
  const ledger = loadLedger(ledgerName);
  if (!ledger) return { error: 'no_ledger' };
  const run = await prisma.analysisRun.findFirst({
    where: runId ? { id: runId, caseId } : { caseId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
  });
  if (!run) return { error: 'no_run' };
  const rows = await prisma.finding.findMany({ where: { runId: run.id }, include: { citations: true } });
  const findings: ScorableFinding[] = rows.map((f) => ({
    id: f.id,
    category: f.category,
    severity: f.severity,
    confidence: f.confidence,
    partAText: f.partAText,
    partBText: f.partBText,
    pages: f.citations.map((c) => c.page).filter((p): p is number => p != null),
    preserved: f.preserved ?? undefined,
  }));
  const card = scoreRun(ledger, findings);
  const cfg = (run.modelConfig ?? {}) as { model?: string; screens?: string; promptHash?: string };
  return {
    ledger: { name: ledgerName, caseTitle: ledger.caseTitle, provenance: ledger.provenance },
    run: {
      id: run.id, runNo: run.runNo, startedAt: run.startedAt, completedAt: run.completedAt,
      model: cfg.model ?? null, promptSet: cfg.screens ?? null, promptHash: cfg.promptHash ?? null, findings: findings.length,
    },
    card,
    pass: card.missed.length === 0 && card.mustFindTotal > 0,
  };
}
