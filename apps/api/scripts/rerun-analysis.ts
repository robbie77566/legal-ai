/**
 * QA-reject a case (reason: quality) and re-enqueue analysis — the re-run
 * loop for a run whose findings were voided or rejected. Usage:
 *   pnpm tsx scripts/rerun-analysis.ts <caseId>
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
let dir = process.cwd();
while (!fs.existsSync(path.join(dir, '.env')) && dir !== path.dirname(dir)) dir = path.dirname(dir);
dotenv.config({ path: path.join(dir, '.env') });

import { Queue } from 'bullmq';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { createConnection } from '../src/lib/redis';

(async () => {
  const caseId = process.argv[2];
  if (!caseId) throw new Error('usage: rerun-analysis.ts <caseId>');
  const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  console.log(`case ${caseId} status=${kase.status}`);

  if (kase.status === 'QA_REVIEW') {
    await withTenant(kase.tenantId, async (tx) => {
      await appendCaseEvent(tx, {
        caseId,
        tenantId: kase.tenantId,
        type: 'qa.rejected',
        payload: { reason: 'quality' },
        actor: 'system',
        transition: 'QA_REJECTED',
      });
    });
    console.log('QA-rejected (reason: quality) -> QA_REJECTED');
  } else if (!['QA_REJECTED', 'DOCS_COMPLETE', 'ANALYZING'].includes(kase.status)) {
    throw new Error(`cannot re-run from ${kase.status}`);
  }

  const queue = new Queue('analysis', { connection: createConnection() });
  const existing = await queue.getJob(`analysis-${caseId}`);
  if (existing) {
    await existing.remove();
    console.log(`removed prior job (state was ${await existing.getState().catch(() => 'unknown')})`);
  }
  await queue.add(
    'analyze',
    { caseId, tenantId: kase.tenantId },
    { jobId: `analysis-${caseId}`, attempts: 3, backoff: { type: 'exponential', delay: 30000 } }
  );
  console.log('analysis job enqueued');
  await queue.close();
  process.exit(0);
})();
