import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Matter } from '@prisma/client';
import { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import {
  MatterCreateSchema,
  MatterPatchSchema,
  MATTER_LOCKED_AFTER_DOCS_COMPLETE,
  matterFactsLocked,
  matterTitle,
  matterCaseShape,
  matterJudgmentDate,
  trapInputsForMatter,
  computeTrapClock,
  vehicleAcceptance,
  isVehicle,
  checklistReadiness,
  CaseFactsSchema,
  VEHICLES,
  RECORD_BUCKETS,
  normalizeCivilDate,
  CIVIL_DATE_MESSAGE,
  type CaseFacts,
  type CaseStatus,
  type CounselVehicle,
  type RecordBucket,
  type MatterSummary,
  type MatterView,
} from '@hg/case-lifecycle';
import { requireFlag } from '../plugins/flags';
import { requireAccountKind } from '../plugins/guards';
import { AuditService, LogAction } from '../services/audit.service';
import { seedChecklist } from '../services/case-setup.service';

/**
 * Matter intake for counsel (persona_rollout_plan.md §3 writ practitioner /
 * PD appellate attorney, §5 C). Mounted at /counsel/matters, dark behind the
 * `counsel_surfaces` flag (404 when off — the surface does not confirm it
 * exists) and PROFESSIONAL-only with a live seat (403 otherwise), exactly
 * like /counsel/me.
 *
 * A matter is the counsel-facing shape of a Case: the professional picks the
 * vehicle up front, gives the court-record identifiers and the dates, and
 * the existing family pipeline runs it — the checklist is seeded from the
 * matter (the form IS the interview), the deadline engine reads the
 * judgment date from Case.facts / deadlineFacts as it always has, the TRAP
 * clock reads the matter's own date columns, and the analysis run weights
 * its screens by the vehicle (analysis.service.ts planScreens).
 *
 * Scope: every read and write is organisation-scoped — through withTenant
 * (RLS, the organisation being 1:1 with the tenant) AND an explicit
 * organisationId test — so a professional from another organisation gets a
 * 404, never a hint. Client identity is initials only; nothing here accepts,
 * stores, logs or audits a client name or a date of birth.
 */

const CIVIL_RE = /^\d{4}-\d{2}-\d{2}$/;
const AsOfQuery = z.object({ asOf: z.preprocess(normalizeCivilDate, z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE).optional()) }).strict();

/** Civil date (YYYY-MM-DD) ⇄ the DATE column (a Date at UTC midnight). */
const toDate = (s: string | null | undefined): Date | null => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const toCivil = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const todayCivil = () => new Date().toISOString().slice(0, 10);

const vehicleLabel = (v: string) => (isVehicle(v) ? VEHICLES[v].label : v);
const isRecordBucket = (b: string | null): b is RecordBucket => b !== null && (RECORD_BUCKETS as readonly string[]).includes(b);

/** The recorded merits fact lives on Case.facts (no column): true / false, or null = not recorded. */
const decidedOnMeritsFrom = (facts: unknown): boolean | null => {
  const parsed = CaseFactsSchema.safeParse(facts ?? {});
  const v = parsed.success ? parsed.data.priorWritsDecidedOnMerits : undefined;
  return typeof v === 'boolean' ? v : null;
};

function matterView(m: Matter, caseFacts: unknown = null): MatterView {
  return {
    id: m.id,
    caseId: m.caseId,
    organisationId: m.organisationId,
    openedBy: m.openedBy,
    vehicle: m.vehicle as CounselVehicle,
    vehicleLabel: vehicleLabel(m.vehicle),
    lane: m.lane,
    county: m.county,
    court: m.court,
    causeNumber: m.causeNumber,
    clientInitials: m.clientInitials,
    offence: m.offence,
    sentence: m.sentence,
    judgmentSignedAt: toCivil(m.judgmentSignedAt),
    sentenceImposedAt: toCivil(m.sentenceImposedAt),
    noticeOfAppealFiledAt: toCivil(m.noticeOfAppealFiledAt),
    recordFiledAt: toCivil(m.recordFiledAt),
    priorWrits: m.priorWrits,
    subsequentWrit: m.subsequentWrit,
    priorWritsDecidedOnMerits: decidedOnMeritsFrom(caseFacts),
    outsideRecordNote: m.outsideRecordNote,
    capital: m.capital,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export default async function mattersRoutes(fastify: FastifyInstance) {
  // Order matters: the flag answers 404 before anything confirms the surface
  // exists; then the account kind (403); then the seat (403).
  fastify.addHook('preHandler', requireFlag('counsel_surfaces'));
  fastify.addHook('preHandler', requireAccountKind('PROFESSIONAL'));
  fastify.addHook('preHandler', async (request, reply) => {
    const { userId, tenantId } = request.auth;
    const seat = await withTenant(tenantId, (tx) =>
      tx.membership.findFirst({ where: { userId }, include: { organisation: true } })
    );
    if (!seat) return reply.status(403).send({ error: 'No active seat in an organisation' });
    request.counsel = seat;
  });

  fastify.post('/', async (request, reply) => {
    const input = MatterCreateSchema.parse(request.body);
    const { tenantId, userId } = request.auth;
    const seat = request.counsel!;

    // Intake gate (plan §5 C): capital work is refused on any vehicle, and
    // the capital vehicle itself is refused. Nothing is created.
    const acceptance = vehicleAcceptance(input.vehicle, { capital: input.capital });
    if (!acceptance.accepted) {
      return reply.status(422).send({ error: acceptance.reason, reason: 'CAPITAL_REFUSED' });
    }

    const shape = matterCaseShape(input);
    const title = matterTitle(input.clientInitials, input.vehicle);

    const { caseId, matterId } = await withTenant(tenantId, async (tx) => {
      const created = await tx.case.create({
        data: {
          title,
          tenantId,
          lane: shape.lane,
          vehicle: input.vehicle,
          subsequentWrit: shape.subsequentWrit,
          county: input.county,
          convictionYear: shape.convictionYear,
          facts: shape.facts as Prisma.InputJsonValue,
          ...(shape.deadlineFacts ? { deadlineFacts: shape.deadlineFacts as Prisma.InputJsonValue } : {}),
          accessList: { create: { userId, role: 'ADMIN' } },
        },
      });
      const matter = await tx.matter.create({
        data: {
          caseId: created.id,
          tenantId,
          organisationId: seat.organisationId,
          openedBy: userId,
          vehicle: input.vehicle,
          lane: input.lane,
          county: input.county,
          court: input.court,
          causeNumber: input.causeNumber,
          clientInitials: input.clientInitials,
          offence: input.offence,
          sentence: input.sentence,
          judgmentSignedAt: toDate(input.judgmentSignedAt),
          sentenceImposedAt: toDate(input.sentenceImposedAt),
          noticeOfAppealFiledAt: toDate(input.noticeOfAppealFiledAt),
          recordFiledAt: toDate(input.recordFiledAt),
          priorWrits: input.priorWrits,
          subsequentWrit: shape.subsequentWrit,
          outsideRecordNote: input.outsideRecordNote,
          capital: input.capital,
        },
      });

      // The same stream the family path writes (payments.service.ts), so
      // Ops, the tracker and the analysis worker see a matter as a case.
      // No payment here: workstream B's QUOTED state takes the card later;
      // the case goes straight to AWAITING_DOCS so counsel can upload.
      await appendCaseEvent(tx, {
        caseId: created.id,
        tenantId,
        type: 'case.created',
        version: 2,
        payload: { ...(shape.lane ? { lane: shape.lane } : {}), vehicle: input.vehicle, matterId: matter.id },
        actor: userId,
        transition: 'AWAITING_DOCS',
      });
      // The matter form is the interview: seed the checklist now. A direct
      // appeal in progress has no appellate opinion to ask for yet.
      const count = await seedChecklist(
        tx,
        { id: created.id, lane: shape.lane ?? null, subsequentWrit: shape.subsequentWrit },
        input.vehicle !== 'direct_appeal'
      );
      await appendCaseEvent(tx, {
        caseId: created.id,
        tenantId,
        type: 'interview.completed',
        payload: { checklistItemCount: count },
        actor: userId,
      });
      if (shape.subsequentWrit) {
        await appendCaseEvent(tx, {
          caseId: created.id,
          tenantId,
          type: 'hold.set',
          payload: { hold: 'SUBSEQUENT_WRIT_MODE' },
          actor: userId,
          setHold: 'SUBSEQUENT_WRIT_MODE',
        });
      }
      return { caseId: created.id, matterId: matter.id };
    });

    // Audited like every professional write; ids and the vehicle only.
    await AuditService.log({
      tenantId,
      caseId,
      action: LogAction.MATTER_OPENED,
      userId,
      details: { matterId, organisationId: seat.organisationId, vehicle: input.vehicle, lane: shape.lane ?? null, subsequentWrit: shape.subsequentWrit },
    });

    return reply.status(201).send({ caseId, matterId });
  });

  fastify.get('/', async (request) => {
    const { tenantId } = request.auth;
    const seat = request.counsel!;
    const rows = await withTenant(tenantId, (tx) =>
      tx.matter.findMany({
        where: { organisationId: seat.organisationId, case: { status: { not: 'DELETED' } } },
        orderBy: { createdAt: 'desc' },
        include: { case: { select: { title: true, status: true, recordBucket: true } } },
      })
    );
    const matters: MatterSummary[] = rows.map((m) => ({
      matterId: m.id,
      caseId: m.caseId,
      title: m.case.title,
      vehicle: m.vehicle as CounselVehicle,
      vehicleLabel: vehicleLabel(m.vehicle),
      clientInitials: m.clientInitials,
      county: m.county,
      causeNumber: m.causeNumber,
      status: m.case.status as CaseStatus,
      // Case.recordBucket (workstream D's meter projection); null until the inventory sets it.
      bucket: isRecordBucket(m.case.recordBucket) ? m.case.recordBucket : null,
      createdAt: m.createdAt.toISOString(),
    }));
    return { matters };
  });

  fastify.get('/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { asOf } = AsOfQuery.parse(request.query ?? {});
    const { tenantId } = request.auth;
    const seat = request.counsel!;

    return withTenant(tenantId, async (tx) => {
      const matter = await tx.matter.findUnique({ where: { caseId }, include: { case: true } });
      if (!matter || matter.organisationId !== seat.organisationId || matter.case.status === 'DELETED') {
        return reply.status(404).send({ error: 'Matter not found' });
      }
      const view = matterView(matter, matter.case.facts);
      const items = await tx.checklistItem.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
      const documents = await tx.document.count({ where: { caseId, quarantined: false } });
      // Every clock is replayable: `asOf` (tests, "what did it say on the
      // 30th") defaults to today. Estimates for counsel's verification —
      // the result carries the FR-5 disclaimer key and the unsigned count.
      const trapClock = computeTrapClock(trapInputsForMatter(view, asOf ?? todayCivil()));
      return {
        matter: view,
        case: {
          id: matter.case.id,
          title: matter.case.title,
          status: matter.case.status,
          lane: matter.case.lane,
          vehicle: matter.case.vehicle,
          subsequentWrit: matter.case.subsequentWrit,
          slaStartedAt: matter.case.slaStartedAt,
          expectedReadyAt: matter.case.expectedReadyAt,
        },
        trapClock,
        checklist: { items, readiness: checklistReadiness(items), documents },
        /** Fields a PATCH would refuse right now (the engine has consumed them). */
        locked: matterFactsLocked(matter.case.status as CaseStatus) ? [...MATTER_LOCKED_AFTER_DOCS_COMPLETE] : [],
      };
    });
  });

  fastify.patch('/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { tenantId, userId } = request.auth;
    const seat = request.counsel!;
    const body = MatterPatchSchema.parse(request.body);
    const keys = (Object.keys(body) as Array<keyof typeof body>).filter((k) => body[k] !== undefined);
    if (keys.length === 0) return reply.status(400).send({ error: 'Nothing to change' });

    const result = await withTenant(tenantId, async (tx) => {
      const matter = await tx.matter.findUnique({ where: { caseId }, include: { case: true } });
      if (!matter || matter.organisationId !== seat.organisationId || matter.case.status === 'DELETED') {
        return { status: 404 as const, body: { error: 'Matter not found' } };
      }
      const status = matter.case.status as CaseStatus;
      // Lock semantics (matters.ts MATTER_LOCKED_AFTER_DOCS_COMPLETE): once the
      // pipeline has started, the judgment / sentencing dates it consumed —
      // Case.facts.judgmentDate, deadlineFacts.judgmentDate, convictionYear,
      // read by the deadline posture and the report — are frozen. Appeal and
      // record dates (live TRAP clock only), the cause number, the court and
      // the note stay editable for the life of the matter.
      const locked = matterFactsLocked(status)
        ? keys.filter((k) => (MATTER_LOCKED_AFTER_DOCS_COMPLETE as readonly string[]).includes(k))
        : [];
      if (locked.length > 0) {
        return {
          status: 409 as const,
          body: {
            error: 'The judgment and sentencing dates are locked once the review has started — the engine has already read them.',
            reason: 'LOCKED',
            locked,
          },
        };
      }

      const updated = await tx.matter.update({
        where: { id: matter.id },
        data: {
          ...(body.judgmentSignedAt !== undefined ? { judgmentSignedAt: toDate(body.judgmentSignedAt) } : {}),
          ...(body.sentenceImposedAt !== undefined ? { sentenceImposedAt: toDate(body.sentenceImposedAt) } : {}),
          ...(body.noticeOfAppealFiledAt !== undefined ? { noticeOfAppealFiledAt: toDate(body.noticeOfAppealFiledAt) } : {}),
          ...(body.recordFiledAt !== undefined ? { recordFiledAt: toDate(body.recordFiledAt) } : {}),
          ...(body.causeNumber !== undefined ? { causeNumber: body.causeNumber } : {}),
          ...(body.court !== undefined ? { court: body.court } : {}),
          ...(body.outsideRecordNote !== undefined ? { outsideRecordNote: body.outsideRecordNote } : {}),
        },
      });

      // Case.facts is the home of two things a PATCH can move: the judgment
      // date the engine counts from (keep facts / deadlineFacts /
      // convictionYear in step, the way PATCH /cases/:id/facts does) and the
      // recorded merits fact for prior applications (no column; null clears it).
      const datesChanged = body.judgmentSignedAt !== undefined || body.sentenceImposedAt !== undefined;
      const meritsChanged = body.priorWritsDecidedOnMerits !== undefined;
      let caseFacts: unknown = matter.case.facts;
      if (datesChanged || meritsChanged) {
        const view = matterView(updated);
        const judgmentDate = matterJudgmentDate(view);
        const prior = (CaseFactsSchema.safeParse(matter.case.facts ?? {}).success ? (matter.case.facts as CaseFacts) : {}) ?? {};
        const facts: CaseFacts = { ...prior, source: { ...(prior.source ?? {}), editedAt: new Date().toISOString() } };
        if (datesChanged) {
          if (judgmentDate) {
            facts.judgmentDate = judgmentDate;
            facts.convictionYear = Number(judgmentDate.slice(0, 4));
          } else {
            delete facts.judgmentDate;
          }
        }
        if (meritsChanged) {
          if (typeof body.priorWritsDecidedOnMerits === 'boolean') facts.priorWritsDecidedOnMerits = body.priorWritsDecidedOnMerits;
          else delete facts.priorWritsDecidedOnMerits;
        }
        const priorDeadline = (matter.case.deadlineFacts as Record<string, unknown> | null) ?? {};
        const deadlineFacts = !datesChanged
          ? undefined
          : judgmentDate
            ? { ...priorDeadline, judgmentDate }
            : (() => { const d = { ...priorDeadline }; delete d.judgmentDate; return Object.keys(d).length ? d : null; })();
        await tx.case.update({
          where: { id: caseId },
          data: {
            ...(datesChanged ? { convictionYear: judgmentDate ? Number(judgmentDate.slice(0, 4)) : null } : {}),
            facts: facts as Prisma.InputJsonValue,
            ...(deadlineFacts === undefined ? {} : { deadlineFacts: deadlineFacts === null ? Prisma.DbNull : (deadlineFacts as Prisma.InputJsonValue) }),
          },
        });
        caseFacts = facts;
      }
      await appendCaseEvent(tx, { caseId, tenantId, type: 'facts.updated', version: 2, payload: { keys }, actor: userId });
      return { status: 200 as const, body: { matter: matterView(updated, caseFacts) } };
    });

    if (result.status === 200) {
      await AuditService.log({ tenantId, caseId, action: LogAction.MATTER_UPDATED, userId, details: { keys } });
    }
    return reply.status(result.status).send(result.body);
  });
}
