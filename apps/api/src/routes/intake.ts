import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, appendCaseEvent } from '@hg/database';
import { checklistTemplate, customerView, type CaseHold } from '@hg/case-lifecycle';

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

      const updated = await tx.case.findUniqueOrThrow({ where: { id } });
      return { status: updated.status, slaStartedAt: updated.slaStartedAt };
    });
  });
}
