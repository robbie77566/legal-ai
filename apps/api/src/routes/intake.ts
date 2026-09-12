import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import { computeDeadlinePosture, checklistTemplate, checklistReadiness, customerView, expectedReadyDate, describeFacts, CaseFactsSchema, normalizeCivilDate, CIVIL_DATE_MESSAGE, type CaseFacts, type CaseHold, type CaseStatus, type DeadlineInputs } from '@hg/case-lifecycle';
import { verifyFindings } from '../services/analysis.service';
import { pageMeter } from '../services/digitize.service';

/**
 * S2 intake: interview → personalized checklist → the explicit, celebrated
 * "records complete" event that starts the SLA clock (US-2/US-3, workflow
 * §S2–S3). All tenant-scoped through withTenant; case access verified.
 */

// Accepts what people type (9/12/2019, Sept 12 2019, blank) and stores YYYY-MM-DD;
// an unreadable value gets a human message, not the regex's name (Sentry, 2026-09-12).
const CIVIL_RE = /^\d{4}-\d{2}-\d{2}$/;
const civilDate = z.preprocess((v) => normalizeCivilDate(v) ?? v, z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE));
// Optional flavour: blank / whitespace means "not given", not an error.
const civilDateOpt = z.preprocess(normalizeCivilDate, z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE).optional());
const InterviewSchema = z.object({
  county: z.string().min(1).max(64),
  convictionYear: z.number().int().min(1950).max(2100),
  trialDays: z.number().int().min(0).max(365).optional(),
  // Optional: the free check already recorded the appeal history for cases
  // bought since facts landed; the interview re-asks only when it is unknown.
  hadAppeal: z.boolean().optional(),
  // FR-5: the one date that unlocks the time-limits section. From the
  // judgment paper; skippable, addable later.
  judgmentDate: civilDateOpt,
  // FR-5 deadline facts — all optional; families rarely know every date,
  // and a partial posture ("as of what we know") beats none.
  deadlineFacts: z
    .object({
      judgmentDate: civilDate,
      motionForNewTrialFiled: z.boolean().optional(),
      coaJudgmentDate: civilDateOpt,
      pdrDisposedDate: civilDateOpt,
      certDisposedDate: civilDateOpt,
      stateWrits: z
        .array(z.object({ filedDate: civilDate, disposedDate: civilDateOpt }).strict())
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
  // US-11: "Your reviews" — every case this account can access, with the
  // customer-visible stage and enough to name the card. One account, any
  // number of reviews. (/summary: the bare GET /cases is the legacy
  // professional-dashboard shape; static segments outrank /:id.)
  fastify.get('/summary', async (request) => {
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findMany({ where: { userId }, select: { caseId: true } });
      const cases = await tx.case.findMany({
        where: { id: { in: access.map((a) => a.caseId) }, status: { not: 'DELETED' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, status: true, county: true, convictionYear: true,
          createdAt: true, expectedReadyAt: true, subsequentWrit: true,
          ocrHalt: true, delayOurs: true,
        },
      });
      return cases.map((c) => ({
        id: c.id,
        title: c.county && c.convictionYear ? `${c.county} County · ${c.convictionYear}` : `Review started ${c.createdAt.toISOString().slice(0, 10)}`,
        status: c.status,
        stage: customerView(c.status as CaseStatus, [
          ...(c.ocrHalt ? (['OCR_HALT'] as const) : []),
          ...(c.delayOurs ? (['DELAY_OURS'] as const) : []),
          ...(c.subsequentWrit ? (['SUBSEQUENT_WRIT_MODE'] as const) : []),
        ]),
        expectedReadyAt: c.expectedReadyAt,
        createdAt: c.createdAt,
      }));
    });
  });

  // US-11: return an uploaded document to its owner — short-TTL signed
  // link, access-checked, never for quarantined files.
  fastify.get('/:id/documents/:docId/download', async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const doc = await tx.document.findFirst({ where: { id: docId, caseId: id } });
      if (!doc || doc.quarantined || !doc.s3Key) {
        return reply.status(404).send({ error: 'Document not available for download' });
      }
      const { s3, bucket } = await import('../services/storage.service');
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const url = await getSignedUrl(
        s3(),
        new GetObjectCommand({
          Bucket: bucket(),
          Key: doc.s3Key,
          ResponseContentDisposition: `attachment; filename="${doc.filename.replace(/[^\w.\- ]/g, '_')}"`,
        }),
        { expiresIn: 300 }
      );
      return { url, filename: doc.filename };
    });
  });

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

      // Merge into the case facts (never re-ask).
      const prior = (CaseFactsSchema.safeParse(kase.facts ?? {}).success ? (kase.facts as CaseFacts) : {}) ?? {};
      const facts: CaseFacts = {
        ...prior,
        county: answers.county,
        convictionYear: answers.convictionYear,
        ...(answers.trialDays != null ? { trialDays: answers.trialDays } : {}),
        // An explicit answer wins (the page only asks when it is unknown); otherwise keep what the check said.
        ...(answers.hadAppeal != null ? { appeal: answers.hadAppeal ? 'decided' : 'none' } : {}),
        ...(answers.judgmentDate ? { judgmentDate: answers.judgmentDate } : {}),
        source: { ...(prior.source ?? {}), interviewAt: new Date().toISOString() },
      };
      const hadAppeal = facts.appeal ? facts.appeal !== 'none' : answers.hadAppeal ?? true;
      const priorDeadline = (kase.deadlineFacts as Record<string, unknown> | null) ?? null;
      const deadlineFacts =
        answers.deadlineFacts ??
        (answers.judgmentDate ? { ...(priorDeadline ?? {}), judgmentDate: answers.judgmentDate } : priorDeadline);

      await tx.case.update({
        where: { id },
        data: {
          county: answers.county,
          convictionYear: answers.convictionYear,
          facts: facts as Prisma.InputJsonValue,
          ...(deadlineFacts ? { deadlineFacts: deadlineFacts as Prisma.InputJsonValue } : {}),
        },
      });

      // Idempotent re-run of the interview replaces un-started checklist state.
      await tx.checklistItem.deleteMany({ where: { caseId: id, state: 'NEEDED' } });
      const { seedChecklist } = await import('../services/case-setup.service');
      const count = await seedChecklist(tx, kase, hadAppeal);
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

      // Latest bulk-ZIP unpack summary (bulk_zip_upload.md) so the page can
      // report "we found N usable files, skipped M" after an archive upload.
      const lastZipEvent = await tx.caseEvent.findFirst({
        where: { caseId: id, type: 'zip.ingested' },
        orderBy: { id: 'desc' },
        select: { payload: true, createdAt: true },
      });

      // High-level progress facts (upload_page_ux_review.md §2): the status
      // page must explain itself on a COLD load mid-run, not only from live
      // SSE events. Names/counts only — never finding counts pre-QA.
      const latestRun = await tx.analysisRun.findFirst({
        where: { caseId: id },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      });
      const screenEvents = latestRun
        ? await tx.caseEvent.findMany({
            where: { caseId: id, type: 'screen.completed', createdAt: { gte: latestRun.startedAt } },
            select: { payload: true },
          })
        : [];
      const checksDone = [
        ...new Set(
          screenEvents
            .map((e) => (e.payload as { screen?: string }).screen)
            .filter((s): s is string => typeof s === 'string')
        ),
      ];
      const pagesDigitized = await tx.documentPage.count({ where: { document: { caseId: id } } });
      const documentsTotal = await tx.document.count({ where: { caseId: id, quarantined: false } });
      const processedDocs = await tx.documentPage.groupBy({ by: ['documentId'], where: { document: { caseId: id } } });
      // "Is anything happening?" — the single most reassuring fact during a
      // long stage (2026-09-06: a 2 GB record looked locked up). The newest
      // pipeline event, so the page can say "last activity 3 minutes ago:
      // finished reading a document" even when the live stream is silent.
      const lastEvent = await tx.caseEvent.findFirst({
        where: { caseId: id },
        orderBy: { createdAt: 'desc' },
        select: { type: true, createdAt: true },
      });

      // What the family told us (customer_journey_ux_review §3) and whether
      // this is a paid re-run of a finished review (US-6).
      const factsRaw = CaseFactsSchema.safeParse(kase.facts ?? {});
      const facts: CaseFacts = factsRaw.success ? factsRaw.data : {};
      const reportCount = await tx.report.count({ where: { caseId: id } });
      const lastReport = reportCount
        ? await tx.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' }, select: { renderedAt: true } })
        : null;

      return {
        status: kase.status,
        facts,
        factLines: describeFacts(facts, kase),
        rerun: reportCount > 0 && kase.status === 'AWAITING_DOCS' ? { reportCount, lastReportAt: lastReport?.renderedAt ?? null } : null,
        customer: customerView(kase.status as Parameters<typeof customerView>[0], holds),
        lane: kase.lane,
        slaStartedAt: kase.slaStartedAt,
        expectedReadyAt: kase.expectedReadyAt,
        items,
        // Document priority (PO, 2026-09-12): is what is here enough to run?
        readiness: checklistReadiness(items),
        documents,
        lastZip: lastZipEvent ? { ...(lastZipEvent.payload as object), at: lastZipEvent.createdAt } : null,
        progressFacts: {
          pagesDigitized,
          documentsProcessed: processedDocs.length,
          documentsTotal,
          checksDone,
          analysisStartedAt: latestRun?.startedAt ?? null,
          lastActivityAt: lastEvent?.createdAt ?? null,
          lastActivityType: lastEvent?.type ?? null,
        },
      };
    });
  });

  // Lock semantics (customer_journey_ux_review §8 decision 1): facts that
  // shape the checklist or the analysis (trial/plea, appeal, prior writ)
  // freeze at records-complete and thaw only inside a paid re-run. The
  // contact-style facts below stay editable for the life of the case — they
  // re-title the case, unlock the time-limits section, never re-run anything.
  fastify.patch('/:id/facts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const body = z
      .object({
        county: z.string().min(1).max(64).optional(),
        convictionYear: z.number().int().min(1950).max(2100).optional(),
        trialDays: z.number().int().min(0).max(365).nullable().optional(),
        judgmentDate: z.preprocess((v) => (v === null ? null : normalizeCivilDate(v)), z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE).nullable().optional()),
        // Shaping facts (PO, 2026-09-12: "I need to change my answer regarding
        // the writ"): editable while the case is still AWAITING_DOCS — they
        // re-derive the lane / subsequent-writ mode and rebuild the un-started
        // checklist. After records-complete they stay locked (409).
        trialOrPlea: z.enum(['trial', 'plea']).optional(),
        appeal: z.enum(['decided', 'pending', 'none']).optional(),
        priorWrit: z.enum(['no', 'yes', 'unsure']).optional(),
      })
      .strict()
      .parse(request.body);
    const SHAPING = ['trialOrPlea', 'appeal', 'priorWrit'] as const;
    const shaping = SHAPING.filter((k) => body[k] !== undefined);
    const keys = (Object.keys(body) as Array<keyof typeof body>).filter((k) => body[k] !== undefined);
    if (keys.length === 0) return reply.status(400).send({ error: 'Nothing to change' });

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      if (kase.status === 'DELETED') return reply.status(409).send({ error: 'This case has been deleted' });
      if (shaping.length > 0 && kase.status !== 'AWAITING_DOCS') {
        return reply.status(409).send({ error: 'How it was decided, the appeal, and any prior writ are locked once the review starts — a re-run is where they can change.' });
      }

      const prior = (CaseFactsSchema.safeParse(kase.facts ?? {}).success ? (kase.facts as CaseFacts) : {}) ?? {};
      const facts: CaseFacts = { ...prior, source: { ...(prior.source ?? {}), editedAt: new Date().toISOString() } };
      if (body.trialOrPlea !== undefined) facts.trialOrPlea = body.trialOrPlea;
      if (body.appeal !== undefined) { facts.appeal = body.appeal; if (body.appeal !== 'none') delete facts.noAppealReason; }
      if (body.priorWrit !== undefined) facts.priorWrit = body.priorWrit;
      const lane = body.trialOrPlea ? (body.trialOrPlea === 'plea' ? 'PLEA' : 'TRIAL') : kase.lane;
      const subsequentWrit = body.priorWrit !== undefined ? body.priorWrit === 'yes' : kase.subsequentWrit;
      if (body.county !== undefined) facts.county = body.county;
      if (body.convictionYear !== undefined) facts.convictionYear = body.convictionYear;
      if (body.trialDays !== undefined) { if (body.trialDays === null) delete facts.trialDays; else facts.trialDays = body.trialDays; }
      if (body.judgmentDate !== undefined) { if (body.judgmentDate === null) delete facts.judgmentDate; else facts.judgmentDate = body.judgmentDate; }
      const priorDeadline = (kase.deadlineFacts as Record<string, unknown> | null) ?? {};
      const deadlineFacts =
        body.judgmentDate === undefined
          ? kase.deadlineFacts
          : body.judgmentDate === null
            ? (() => { const d = { ...priorDeadline }; delete d.judgmentDate; return Object.keys(d).length ? d : null; })()
            : { ...priorDeadline, judgmentDate: body.judgmentDate };

      await tx.case.update({
        where: { id },
        data: {
          ...(body.county !== undefined ? { county: body.county } : {}),
          ...(body.convictionYear !== undefined ? { convictionYear: body.convictionYear } : {}),
          ...(shaping.length > 0 ? { lane, subsequentWrit } : {}),
          facts: facts as Prisma.InputJsonValue,
          deadlineFacts: deadlineFacts === null ? Prisma.DbNull : (deadlineFacts as Prisma.InputJsonValue),
        },
      });
      let checklistItemCount: number | undefined;
      if (shaping.length > 0) {
        // The template changed: drop the un-started items and reseed; received
        // items keep their documents.
        await tx.checklistItem.deleteMany({ where: { caseId: id, state: 'NEEDED' } });
        const { seedChecklist } = await import('../services/case-setup.service');
        checklistItemCount = await seedChecklist(tx, { id, lane, subsequentWrit }, facts.appeal ? facts.appeal !== 'none' : true);
      }
      await appendCaseEvent(tx, { caseId: id, tenantId, type: 'facts.updated', payload: { keys }, actor: userId });
      const view = { ...kase, lane, subsequentWrit, county: facts.county ?? kase.county, convictionYear: facts.convictionYear ?? kase.convictionYear };
      return { facts, factLines: describeFacts(facts, view), ...(checklistItemCount !== undefined ? { checklistItemCount } : {}) };
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
      // Re-run with nothing new (customer_journey_ux_review §8 decision 3):
      // never charge a run to re-read the same record.
      const lastReport = await tx.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' }, select: { renderedAt: true } });
      if (lastReport) {
        const newDocs = await tx.document.count({ where: { caseId: id, createdAt: { gt: lastReport.renderedAt }, quarantined: false } });
        if (newDocs === 0) {
          return reply.status(409).send({
            error: 'Nothing new to run — your last report already covers these documents. Add a new document first, or ask us for a refund of the re-run.',
            code: 'nothing_new',
          });
        }
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
        const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
        void sendRecordsComplete(owner.email, {
          expectedReadyBy: updated.expectedReadyAt?.toISOString().slice(0, 10),
          statusUrl: `${origin}/case/${id}/status`,
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
    confidence?: number;
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
    id: string,
    versionNo?: number
  ) {
    // A Report row exists only after QA approval, so any version is safe to
    // serve — including v1 while a paid re-run has the case back in
    // AWAITING_DOCS (US-6: "your earlier report still stands").
    const report = await tx.report.findFirst({
      where: { caseId: id, ...(versionNo ? { versionNo } : {}) },
      orderBy: { versionNo: 'desc' },
    });
    if (!report) return null;

    const snapshot = report.findingsSnapshot as unknown as { findings: SnapshotFinding[] };
    const { verified, failed } = await verifyFindings(
      tx,
      snapshot.findings.map((f) => f.id)
    );
    const { attachConfidence } = await import('../services/finding-confidence.service');
    const visible = await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)));

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

    const { summaryRowsForReport, summaryGapForReport } = await import('../services/case-summary.service');
    const { PRICES_CENTS } = await import('../services/payments.service');
    const summaryRowsList = await summaryRowsForReport(report.runId, kase as { county?: string | null; convictionYear?: number | null; facts?: unknown; deadlineFacts?: unknown });
    return {
      report,
      payload: {
        bottomLine: (await import('../services/bottom-line.service')).bottomLineFor(visible, kase.subsequentWrit, deadlinePosture),
        caseSummary: summaryRowsList,
        summaryGap: await summaryGapForReport(kase.id, summaryRowsList),
        rerunPriceCents: PRICES_CENTS.rerun,
        versionNo: report.versionNo,
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

  // Customer feedback (customer_feedback_program.md): partial upsert across
  // touches; open text stays in the database only.
  fastify.get('/:id/feedback', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      return (await tx.caseFeedback.findUnique({ where: { caseId: id } })) ?? {};
    });
  });

  fastify.post('/:id/feedback', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const body = z
      .object({
        clarity: z.number().int().min(1).max(5).optional(),
        recommend: z.enum(['yes', 'not_sure', 'no']).optional(),
        decidedText: z.string().max(2000).optional(),
        sharedWithLawyer: z.enum(['yes', 'planning', 'no']).optional(),
        objectionText: z.string().max(2000).optional(),
      })
      .parse(request.body);
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const row = await tx.caseFeedback.upsert({
        where: { caseId: id },
        create: { caseId: id, tenantId, ...body },
        update: body,
      });
      const { capture } = await import('../services/analytics.service');
      capture('snl.survey_report', tenantId, {
        ...(body.clarity != null ? { clarity: body.clarity } : {}),
        ...(body.recommend ? { recommend: body.recommend } : {}),
        ...(body.sharedWithLawyer ? { shared: body.sharedWithLawyer } : {}),
        has_text: Boolean(body.decidedText || body.objectionText),
      });
      return row;
    });
  });

  fastify.get('/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const { version } = request.query as { version?: string };
      const loaded = await loadVerifiedReport(tx, kase, id, version ? Number(version) : undefined);
      if (!loaded) return reply.status(404).send({ error: 'No report is ready yet' });
      const { capture } = await import('../services/analytics.service');
      capture('snl.report_viewed', tenantId, { dropped: loaded.payload.droppedByReverification });
      return loaded.payload;
    });
  });

  // US-6: every released version, newest first — the report page's switcher.
  fastify.get('/:id/report/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const reports = await tx.report.findMany({
        where: { caseId: id }, orderBy: { versionNo: 'desc' }, select: { versionNo: true, renderedAt: true },
      });
      return reports;
    });
  });

  // US-6: what changed between the two newest released reports, in the
  // family's words (Part A only). Findings are matched by stableKey.
  fastify.get('/:id/report/changes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const reports = await tx.report.findMany({ where: { caseId: id }, orderBy: { versionNo: 'desc' }, take: 2 });
      if (reports.length < 2) return { fromVersion: null, toVersion: reports[0]?.versionNo ?? null, added: [], removed: [], keptCount: null, notes: [] };
      const [latest, prior] = reports;
      const pick = { stableKey: true, category: true, severity: true, partAText: true };
      const [latestF, priorF] = await Promise.all([
        tx.finding.findMany({ where: { runId: latest.runId }, select: pick }),
        tx.finding.findMany({ where: { runId: prior.runId }, select: pick }),
      ]);
      const priorKeys = new Set(priorF.map((f) => f.stableKey));
      const latestKeys = new Set(latestF.map((f) => f.stableKey));
      const shape = (f: { category: string; severity: string; partAText: string }) => ({ category: f.category, severity: f.severity, partAText: f.partAText });
      return {
        fromVersion: prior.versionNo,
        toVersion: latest.versionNo,
        added: latestF.filter((f) => !priorKeys.has(f.stableKey)).map(shape),
        removed: priorF.filter((f) => !latestKeys.has(f.stableKey)).map(shape),
        keptCount: latestF.filter((f) => priorKeys.has(f.stableKey)).length,
        // Republish: what is different in the presentation, in the family's words.
        notes: Array.isArray(latest.changeNotes) ? (latest.changeNotes as string[]) : [],
      };
    });
  });

  // ENG-11 (M5): the downloadable artifact — same verified payload, PDF.
  fastify.get('/:id/report/pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await withCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Forbidden' });
      const { palette, version } = request.query as { palette?: string; version?: string };
      const loaded = await loadVerifiedReport(tx, kase, id, version ? Number(version) : undefined);
      if (!loaded) return reply.status(404).send({ error: 'No report is ready yet' });

      const { renderReportPdf } = await import('@hg/reports');
      const pdf = await renderReportPdf({
        summary: loaded.payload.caseSummary,
        palette: palette === 'amber' ? 'amber' : 'harbor',
        caseTitle: kase.title,
        reportId: loaded.report.id,
        ...loaded.payload,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="family-case-review-${id}.pdf"`)
        .send(pdf);
    });
  });
}
