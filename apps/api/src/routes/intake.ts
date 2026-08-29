import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, appendCaseEvent } from '@hg/database';
import { checklistTemplate, customerView, expectedReadyDate, type CaseHold } from '@hg/case-lifecycle';
import { verifyFindings } from '../services/analysis.service';

/**
 * S2 intake: interview → personalized checklist → the explicit, celebrated
 * "records complete" event that starts the SLA clock (US-2/US-3, workflow
 * §S2–S3). All tenant-scoped through withTenant; case access verified.
 */

const InterviewSchema = z.object({
  county: z.string().min(1).max(64),
  convictionYear: z.number().int().min(1950).max(2100),
  trialDays: z.number().int().min(0).max(365).optional(),
  hadAppeal: z.boolean(),
});

export default async function intakeRoutes(fastify: FastifyInstance) {
  const withCase = async (
    tx: Parameters<Parameters<typeof withTenant>[1]>[0],
    caseId: string,
    userId: string
  ) => {
    const access = await tx.caseAccess.findUnique({
      where: { caseId_userId: { caseId, userId } },
    });
    if (!access) return null;
    return tx.case.findUnique({ where: { id: caseId } });
  };

  // Interview answers seed the pipeline (county → local practice, year →
  // statute-at-date, FR-5) and generate the personal checklist.
  fastify.post('/:id/interview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const answers = InterviewSchema.parse(request.body);

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      if (kase.status !== 'AWAITING_DOCS') {
        return reply.status(409).send({ error: 'Interview is only available while awaiting documents' });
      }

      await tx.case.update({
        where: { id },
        data: { county: answers.county, convictionYear: answers.convictionYear },
      });

      // Idempotent re-run of the interview replaces un-started checklist state.
      await tx.checklistItem.deleteMany({ where: { caseId: id, state: 'NEEDED' } });
      const existing = await tx.checklistItem.findMany({ where: { caseId: id }, select: { kind: true } });
      const have = new Set(existing.map((i) => i.kind));

      const items = checklistTemplate({
        lane: (kase.lane ?? 'TRIAL') as 'TRIAL' | 'PLEA',
        subsequentWrit: kase.subsequentWrit,
        hadAppeal: answers.hadAppeal,
      }).filter((i) => !have.has(i.kind));

      await tx.checklistItem.createMany({
        data: items.map((i) => ({ caseId: id, kind: i.kind, label: i.label, howToKey: i.howToKey })),
      });

      const count = await tx.checklistItem.count({ where: { caseId: id } });
      await appendCaseEvent(tx, {
        caseId: id,
        tenantId,
        type: 'interview.completed',
        payload: { checklistItemCount: count },
        actor: userId,
      });

      return { checklistItemCount: count };
    });
  });

  // The checklist is the home screen of the case (UI spec §5.4).
  fastify.get('/:id/checklist', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });

      const items = await tx.checklistItem.findMany({
        where: { caseId: id },
        orderBy: { createdAt: 'asc' },
      });
      const documents = await tx.document.findMany({
        where: { caseId: id },
        select: { id: true, filename: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const holds: CaseHold[] = [];
      if (kase.ocrHalt) holds.push('OCR_HALT');
      if (kase.delayOurs) holds.push('DELAY_OURS');
      if (kase.subsequentWrit) holds.push('SUBSEQUENT_WRIT_MODE');

      return {
        status: kase.status,
        customer: customerView(kase.status as Parameters<typeof customerView>[0], holds),
        lane: kase.lane,
        slaStartedAt: kase.slaStartedAt,
        expectedReadyAt: kase.expectedReadyAt,
        items,
        documents,
      };
    });
  });

  // "Records complete" — explicit, celebrated, and it starts the clock
  // exactly once (US-3; the appendCaseEvent SLA stamp is once-only).
  fastify.post('/:id/records-complete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      if (kase.status !== 'AWAITING_DOCS') {
        return reply.status(409).send({ error: 'Records are already marked complete' });
      }

      const docCount = await tx.document.count({ where: { caseId: id } });
      if (docCount === 0) {
        return reply.status(400).send({ error: 'Upload at least one document first' });
      }

      // billablePages stays 0 until the M3 page ledger lands — the meter and
      // billing read DocumentPage, never this event.
      await appendCaseEvent(tx, {
        caseId: id,
        tenantId,
        type: 'docs.complete',
        payload: { billablePages: 0, duplicatesIgnored: 0 },
        actor: userId,
        transition: 'DOCS_COMPLETE',
      });

      // The 10-business-day promise (PO decision; ENG-9 shared calendar).
      const afterStamp = await tx.case.findUniqueOrThrow({ where: { id } });
      const readyBy = expectedReadyDate(afterStamp.slaStartedAt ?? new Date());
      await tx.case.update({
        where: { id },
        data: { expectedReadyAt: new Date(`${readyBy}T00:00:00Z`) },
      });

      const updated = await tx.case.findUniqueOrThrow({ where: { id } });

      // Kick the analysis pipeline (idempotent job id); Redis-down is
      // tolerated — reconciliation of stuck DOCS_COMPLETE cases is an Ops
      // queue view, never a customer-facing failure.
      try {
        const { enqueueAnalysis } = await import('../services/queue');
        await enqueueAnalysis(id, tenantId);
      } catch (e) {
        request.log.error({ err: e }, 'analysis enqueue failed — case parked at DOCS_COMPLETE');
      }

      return { status: updated.status, slaStartedAt: updated.slaStartedAt, expectedReadyAt: updated.expectedReadyAt };
    });
  });

  // The customer report (US-4), readable once QA has approved. FR-7 runs at
  // EVERY render: citations re-verify against live chunks; a mismatch drops
  // the finding from view and reports the drop.
  fastify.get('/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      if (kase.status !== 'READY' && kase.status !== 'DELIVERED') {
        return reply.status(404).send({ error: 'No report is ready yet' });
      }

      const report = await tx.report.findFirst({
        where: { caseId: id },
        orderBy: { versionNo: 'desc' },
      });
      if (!report) return reply.status(404).send({ error: 'No report is ready yet' });

      const snapshot = report.findingsSnapshot as {
        findings: {
          id: string;
          category: string;
          severity: string;
          partAText: string;
          partBText: string;
          citations: { volume: string | null; page: number | null; excerpt: string }[];
        }[];
      };

      const { verified, failed } = await verifyFindings(
        tx,
        snapshot.findings.map((f) => f.id)
      );
      const visible = snapshot.findings.filter((f) => verified.includes(f.id));

      return {
        templateVersion: report.templateVersion,
        renderedAt: report.renderedAt,
        subsequentWritMode: kase.subsequentWrit,
        strongSignals: visible.filter((f) => f.severity === 'dispositive'),
        possibleIssues: visible.filter((f) => f.severity !== 'dispositive'),
        droppedByReverification: failed.length,
      };
    });
  });
}
