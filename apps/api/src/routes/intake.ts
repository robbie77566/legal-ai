import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, appendCaseEvent } from '@hg/database';
import { computeDeadlinePosture, type DeadlineInputs } from '@hg/case-lifecycle';
import { checklistTemplate, customerView, expectedReadyDate, type CaseHold } from '@hg/case-lifecycle';
import { verifyFindings } from '../services/analysis.service';
import { pageMeter } from '../services/digitize.service';

/**
 * S2 intake: interview → personalized checklist → the explicit, celebrated
 * "records complete" event that starts the SLA clock (US-2/US-3, workflow
 * §S2–S3). All tenant-scoped through withTenant; case access verified.
 */

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const InterviewSchema = z.object({
  county: z.string().min(1).max(64),
  convictionYear: z.number().int().min(1950).max(2100),
  trialDays: z.number().int().min(0).max(365).optional(),
  hadAppeal: z.boolean(),
  // FR-5 deadline facts — all optional; families rarely know every date,
  // and a partial posture ("as of what we know") beats none.
  deadlineFacts: z
    .object({
      judgmentDate: civilDate,
      motionForNewTrialFiled: z.boolean().optional(),
      coaJudgmentDate: civilDate.optional(),
      pdrDisposedDate: civilDate.optional(),
      certDisposedDate: civilDate.optional(),
      stateWrits: z
        .array(z.object({ filedDate: civilDate, disposedDate: civilDate.optional() }).strict())
        .max(5)
        .optional(),
    })
    .strict()
    .optional(),
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
        data: {
          county: answers.county,
          convictionYear: answers.convictionYear,
          ...(answers.deadlineFacts ? { deadlineFacts: answers.deadlineFacts } : {}),
        },
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
        select: { id: true, filename: true, createdAt: true, suggestedChecklistItemId: true, classificationConfirmed: true, quarantined: true },
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

      // Real counts from the DocumentPage authority (ENG-3).
      const billablePages = await tx.documentPage.count({
        where: { document: { caseId: id } , billable: true },
      });
      const duplicatesIgnored = await tx.documentPage.count({
        where: { document: { caseId: id }, billable: false },
      });

      // Overage gate (ENG-3): the cap is 5,000 + 2,500 per purchased overage
      // block; a partial block is never charged for pages not received —
      // the customer buys the next block only when the count actually
      // crosses the line, in-flow, never a surprise.
      const overageBlocks = await tx.payment.count({
        where: { caseId: id, kind: 'OVERAGE', status: 'SUCCEEDED' },
      });
      const allowance = 5000 + overageBlocks * 2500;
      if (billablePages > allowance) {
        const blocksNeeded = Math.ceil((billablePages - allowance) / 2500);
        return reply.status(402).send({
          error: 'Page allowance exceeded',
          billablePages,
          allowance,
          blocksNeeded,
          blockPriceCents: 4900,
        });
      }

      await appendCaseEvent(tx, {
        caseId: id,
        tenantId,
        type: 'docs.complete',
        payload: { billablePages, duplicatesIgnored },
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

      const owner = await tx.user.findUnique({ where: { id: userId } });
      if (owner?.email) {
        const { capture } = await import('../services/analytics.service');
        capture('snl.records_complete', tenantId, { billablePages });
        const { sendRecordsComplete } = await import('@hg/email');
        void sendRecordsComplete(owner.email, {
          expectedReadyBy: updated.expectedReadyAt?.toISOString().slice(0, 10),
        });
      }

      return { status: updated.status, slaStartedAt: updated.slaStartedAt, expectedReadyAt: updated.expectedReadyAt };
    });
  });

  // Echo-back verdicts (US-2): confirm locks the classification; correct
  // reassigns and returns the wrong guess's item to NEEDED when orphaned.
  fastify.post('/:id/documents/:docId/confirm', async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const doc = await tx.document.findFirst({ where: { id: docId, caseId: id } });
      if (!doc) return reply.status(404).send({ error: 'Not found' });

      await tx.document.update({ where: { id: docId }, data: { classificationConfirmed: true } });
      if (doc.suggestedChecklistItemId) {
        await tx.checklistItem.update({
          where: { id: doc.suggestedChecklistItemId },
          data: { state: 'CONFIRMED' },
        });
      }
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'doc.confirmed',
        payload: { documentId: docId }, actor: userId,
      });
      return { ok: true };
    });
  });

  fastify.post('/:id/documents/:docId/correct', async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };
    const { checklistItemId } = z.object({ checklistItemId: z.string().max(64) }).parse(request.body);
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const doc = await tx.document.findFirst({ where: { id: docId, caseId: id } });
      const item = await tx.checklistItem.findFirst({ where: { id: checklistItemId, caseId: id } });
      if (!doc || !item) return reply.status(404).send({ error: 'Not found' });

      const old = doc.suggestedChecklistItemId;
      await tx.document.update({
        where: { id: docId },
        data: { suggestedChecklistItemId: checklistItemId, classificationConfirmed: true },
      });
      await tx.checklistItem.update({ where: { id: checklistItemId }, data: { state: 'CONFIRMED' } });
      if (old && old !== checklistItemId) {
        const others = await tx.document.count({
          where: { caseId: id, suggestedChecklistItemId: old, id: { not: docId } },
        });
        if (others === 0) {
          await tx.checklistItem.update({ where: { id: old }, data: { state: 'NEEDED' } });
        }
      }
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'doc.corrected',
        payload: { documentId: docId, checklistItemId }, actor: userId,
      });
      return { ok: true };
    });
  });

  // The live page meter (ENG-3): same authority as billing, plus the
  // shoebox-trust duplicates count (UI spec §5.5).
  fastify.get('/:id/pages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const allowed = await withTenant(tenantId, (tx) => withCase(tx, id, userId));
    if (!allowed) return reply.status(403).send({ error: 'Forbidden' });
    return pageMeter(id, tenantId);
  });

  // The customer report (US-4), readable once QA has approved. FR-7 runs at
  // EVERY render: citations re-verify against live chunks; a mismatch drops
  // the finding from view and reports the drop.
  interface SnapshotFinding {
    id: string;
    category: string;
    severity: string;
    partAText: string;
    partBText: string;
    citations: { volume: string | null; page: number | null; excerpt: string }[];
  }

  /**
   * Shared by the JSON report and the PDF: latest snapshot, FR-7
   * re-verified AT THIS RENDER — a tampered chunk drops its finding from
   * both surfaces identically. Returns null when no report is ready.
   */
  async function loadVerifiedReport(
    tx: Parameters<Parameters<typeof withTenant>[1]>[0],
    kase: { id: string; status: string; subsequentWrit: boolean; title: string },
    id: string
  ) {
    if (kase.status !== 'READY' && kase.status !== 'DELIVERED') return null;
    const report = await tx.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' } });
    if (!report) return null;

    const snapshot = report.findingsSnapshot as unknown as { findings: SnapshotFinding[] };
    const { verified, failed } = await verifyFindings(
      tx,
      snapshot.findings.map((f) => f.id)
    );
    const visible = snapshot.findings.filter((f) => verified.includes(f.id));

    // FR-5: deadline posture computed fresh at every render on the civil
    // "today" in America/Chicago — elapsed/remaining always current,
    // stamped "as of", never cached into the snapshot.
    let deadlinePosture: ReturnType<typeof computeDeadlinePosture> | null = null;
    const facts = (kase as { deadlineFacts?: unknown }).deadlineFacts as
      | (Omit<DeadlineInputs, 'asOf'> & { judgmentDate: string })
      | null
      | undefined;
    if (facts?.judgmentDate) {
      const asOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      try {
        deadlinePosture = computeDeadlinePosture({ ...facts, asOf });
      } catch {
        deadlinePosture = null; // malformed stored facts never break a report
      }
    }

    return {
      report,
      payload: {
        templateVersion: report.templateVersion,
        renderedAt: report.renderedAt,
        deadlinePosture,
        subsequentWritMode: kase.subsequentWrit,
        strongSignals: visible.filter((f) => f.severity === 'dispositive'),
        possibleIssues: visible.filter((f) => f.severity !== 'dispositive'),
        droppedByReverification: failed.length,
      },
    };
  }

  fastify.get('/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const loaded = await loadVerifiedReport(tx, kase, id);
      if (!loaded) return reply.status(404).send({ error: 'No report is ready yet' });
      const { capture } = await import('../services/analytics.service');
      capture('snl.report_viewed', tenantId, { dropped: loaded.payload.droppedByReverification });
      return loaded.payload;
    });
  });

  // ENG-11 (M5): the downloadable artifact — same verified payload, PDF.
  fastify.get('/:id/report/pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const loaded = await loadVerifiedReport(tx, kase, id);
      if (!loaded) return reply.status(404).send({ error: 'No report is ready yet' });

      const { palette } = request.query as { palette?: string };
      const { renderReportPdf } = await import('@hg/reports');
      const pdf = await renderReportPdf({
        palette: palette === 'harbor' ? 'harbor' : 'amber',
        caseTitle: kase.title,
        reportId: loaded.report.id,
        versionNo: loaded.report.versionNo,
        ...loaded.payload,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="family-case-review-${id}.pdf"`)
        .send(pdf);
    });
  });
}
