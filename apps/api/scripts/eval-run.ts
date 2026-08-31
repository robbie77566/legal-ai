/**
 * Eval harness CLI (launch gate): score a case's latest completed run
 * against its attorney ledger. Exits 1 below the recall gate.
 *
 *   pnpm tsx scripts/eval-run.ts <caseId> <ledgerPath> [--min-recall 1.0]
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
let dir = process.cwd();
while (!fs.existsSync(path.join(dir, '.env')) && dir !== path.dirname(dir)) dir = path.dirname(dir);
dotenv.config({ path: path.join(dir, '.env') });

import prisma from '@hg/database';
import { scoreRun, type EvalLedger, type ScorableFinding } from '../src/services/eval.service';

(async () => {
  const [caseId, ledgerPath] = process.argv.slice(2);
  if (!caseId || !ledgerPath) throw new Error('usage: eval-run.ts <caseId> <ledgerPath> [--min-recall X]');
  const minIdx = process.argv.indexOf('--min-recall');
  const minRecall = minIdx >= 0 ? Number(process.argv[minIdx + 1]) : 1.0;

  const ledger = JSON.parse(fs.readFileSync(path.resolve(dir, ledgerPath), 'utf8')) as EvalLedger;
  const run = await prisma.analysisRun.findFirstOrThrow({
    where: { caseId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
  });
  const rows = await prisma.finding.findMany({ where: { runId: run.id }, include: { citations: true } });
  const findings: ScorableFinding[] = rows.map((f) => ({
    id: f.id,
    category: f.category,
    severity: f.severity,
    confidence: f.confidence,
    partAText: f.partAText,
    partBText: f.partBText,
    pages: f.citations.map((c) => c.page).filter((p): p is number => p != null),
  }));

  const card = scoreRun(ledger, findings);
  console.log(`\n=== EVAL: ${ledger.caseTitle} — run ${run.id} (runNo ${run.runNo}, ${findings.length} findings) ===`);
  console.log(`ledger: ${ledger.provenance}`);
  for (const f of card.found) console.log(`  FOUND  ${f.id}  (findings ${f.by.join(', ')})`);
  for (const m of card.missed) console.log(`  MISSED ${m.id} — ${m.note}`);
  console.log(`recall: ${(card.recall * 100).toFixed(0)}% (${card.found.length}/${card.mustFindTotal}) | gate: ≥${(minRecall * 100).toFixed(0)}%`);
  if (card.precision != null) {
    console.log(`precision (attorney verdicts): ${(card.precision * 100).toFixed(0)}% | severity agreement: ${((card.severityAgreement ?? 0) * 100).toFixed(0)}%`);
  } else {
    console.log('precision: no attorney verdicts transcribed yet (canary-only ledger)');
  }
  const pass = card.recall >= minRecall;
  console.log(pass ? 'EVAL GREEN' : 'EVAL RED');
  process.exit(pass ? 0 : 1);
})();
