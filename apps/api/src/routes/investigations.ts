import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvestigationRequest, InvestigationStatus } from '@prisma/client';
import prisma, { withTenant, Prisma } from '@hg/database';
import { caseLabel } from '@hg/case-lifecycle';
import { AuditService, LogAction } from '../services/audit.service';
import { requireFlag } from '../plugins/flags';
import { INVESTIGATION_FILER_ROLES } from '../services/organisation.service';
import { investigationSla } from './ops-professional';

/**
 * Record Desk requests (persona_rollout_plan.md §3 investigator, §5 I). In
 * January the Record Desk is sold and delivered BY HAND from the staff
 * console: a member files a request (a chronology, a records tracker, or
 * something else), staff move it through OPEN → IN_PROGRESS → DELIVERED (or
 * DECLINED) with a note. No file travels through the product yet; the
 * verification view and the exports are workstream H.
 *
 * Two halves: the ORGANISATION's (mounted at /counsel/investigations inside
 * the counsel plugin, seat on request.counsel, behind `record_desk` for the
 * organisation's tenant) and STAFF's (mounted at /ops/investigations inside
 * the ops plugin, whose hook admits Admin everywhere and Support on reads
 * plus the PATCH; the route itself keeps Support to the unblocking
 * transitions, staff_console_access_model §5).
 *
 * The chronology template (UPL review 2026-10-23, recommendation 9, P10):
 * what the Record Desk delivers is a STRUCTURED chronology —
 * `deliverable: { entries: [{ date, volume?, page?, event }], note? }` — a
 * description of the record, dated and cited, never an opinion about it.
 * The free-text `staffNote` remains as a PROCESS note (what was done, when
 * it was sent) and both notes are refused when they carry advice language
 * (lintProcessNote below): "should", "file", "grounds", "viable", "winnable".
 */

const KINDS = ['CHRONOLOGY', 'RECORDS_TRACKER', 'OTHER'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'DELIVERED', 'DECLINED'] as const;
/** What Support may set: moving work along and closing it as delivered. Declining or reopening is an Admin call. */
const SUPPORT_STATUSES: ReadonlySet<InvestigationStatus> = new Set<InvestigationStatus>(['IN_PROGRESS', 'DELIVERED']);

const FileSchema = z.object({
  kind: z.enum(KINDS),
  caseId: z.string().min(1).max(64).optional(),
  pages: z.number().int().positive().max(100_000).optional(),
  dueBy: z.string().date().optional(),
  note: z.string().trim().min(1).max(4000),
});

/** One line of a chronology: when, where in the record, what the record shows happened. */
export const ChronologyEntrySchema = z.object({
  date: z.string().trim().min(1).max(40),
  volume: z.string().trim().max(40).optional(),
  page: z.union([z.string().trim().max(20), z.number().int().positive().max(100_000)]).optional(),
  event: z.string().trim().min(1).max(1000),
});
export const DeliverableSchema = z.object({
  entries: z.array(ChronologyEntrySchema).max(500),
  note: z.string().trim().max(4000).optional(),
});
export type Deliverable = z.infer<typeof DeliverableSchema>;

/**
 * The family lint phrases, applied to the Record Desk's notes: a process
 * note says what was done with the record, never what someone should do
 * about it. Whole words, any case. Replace with `lintAdvice` from
 * services/advice-lint.ts once that lint lands on main (UPL review rec. 11).
 */
export const PROCESS_NOTE_PHRASES = ['should', 'file', 'grounds', 'viable', 'winnable'] as const;
export function lintProcessNote(text: string | null | undefined): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const phrase of PROCESS_NOTE_PHRASES) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(text)) hits.push(phrase);
  }
  return hits;
}

const StaffPatchSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    assignedTo: z.string().min(1).max(64).nullable().optional(),
    note: z.string().trim().max(4000).nullable().optional(),
    deliverable: DeliverableSchema.nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.assignedTo !== undefined || b.note !== undefined || b.deliverable !== undefined, { message: 'Nothing to change' });

const view = (r: InvestigationRequest) => ({
  id: r.id,
  organisationId: r.organisationId,
  caseId: r.caseId,
  requestedBy: r.requestedBy,
  kind: r.kind,
  pages: r.pages,
  dueBy: r.dueBy,
  note: r.note,
  status: r.status,
  assignedTo: r.assignedTo,
  staffNote: r.staffNote,
  deliverable: (r.deliverable as Deliverable | null) ?? null,
  deliveredAt: r.deliveredAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** The organisation's side. Mounted at /counsel/investigations inside the counsel plugin. */
export async function counselInvestigationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireFlag('record_desk'));

  fastify.post('/', async (request, reply) => {
    const seat = request.counsel!;
    if (!INVESTIGATION_FILER_ROLES.has(seat.role)) {
      return reply.status(403).send({ error: 'Requests to the Record Desk come from an investigator, an attorney or the owner' });
    }
    const body = FileSchema.parse(request.body);

    const created = await withTenant(seat.tenantId, async (tx) => {
      if (body.caseId) {
        // RLS hides another tenant's matter: it simply is not there.
        const kase = await tx.case.findUnique({ where: { id: body.caseId }, select: { id: true, status: true } });
        if (!kase || kase.status === 'DELETED') return null;
      }
      return tx.investigationRequest.create({
        data: {
          tenantId: seat.tenantId,
          organisationId: seat.organisationId,
          caseId: body.caseId ?? null,
          requestedBy: request.auth.userId,
          kind: body.kind,
          pages: body.pages ?? null,
          dueBy: body.dueBy ? new Date(`${body.dueBy}T00:00:00.000Z`) : null,
          note: body.note,
        },
      });
    });
    if (!created) return reply.status(404).send({ error: 'No such matter' });

    await AuditService.log({
      tenantId: seat.tenantId, caseId: `investigation:${created.id}`, action: LogAction.INVESTIGATION_REQUEST, userId: request.auth.userId,
      details: { op: 'request_filed', organisationId: seat.organisationId, kind: created.kind, caseId: created.caseId, pages: created.pages },
    });
    return { request: view(created) };
  });

  // Every seat may read the organisation's requests (a viewer included).
  fastify.get('/', async (request) => {
    const seat = request.counsel!;
    const rows = await withTenant(seat.tenantId, (tx) =>
      tx.investigationRequest.findMany({ where: { organisationId: seat.organisationId }, orderBy: { createdAt: 'desc' } })
    );
    return { requests: rows.map(view) };
  });
}

/** Staff's side. Mounted at /ops/investigations inside the ops plugin (its hook gates the roles). */
export async function opsInvestigationRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const { status } = request.query as { status?: string };
    const where = status && (STATUSES as readonly string[]).includes(status) ? { status: status as InvestigationStatus } : {};
    const rows = await prisma.investigationRequest.findMany({
      where,
      include: { organisation: { select: { id: true, name: true, kind: true, tenantId: true, isTest: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.requestedBy, r.assignedTo]).filter((x): x is string => !!x)));
    const caseIds = Array.from(new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x)));
    const [users, cases] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
      caseIds.length ? prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, title: true, county: true, convictionYear: true, createdAt: true } }) : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const caseById = new Map(cases.map((c) => [c.id, c]));
    return {
      requests: rows.map((r) => {
        const requester = userById.get(r.requestedBy);
        const assignee = r.assignedTo ? userById.get(r.assignedTo) : null;
        const kase = r.caseId ? caseById.get(r.caseId) : null;
        return {
          ...view(r),
          // The Record Desk SLA (workstream G): 10 business days from filing, on the family calendar.
          ...investigationSla(r.createdAt),
          organisation: { id: r.organisation.id, name: r.organisation.name, kind: r.organisation.kind, tenantId: r.organisation.tenantId, isTest: r.organisation.isTest },
          requester: requester ? { id: requester.id, name: requester.name, email: requester.email } : { id: r.requestedBy, name: null, email: null },
          assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
          caseLabel: kase ? caseLabel(kase) : null,
        };
      }),
    };
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = StaffPatchSchema.parse(request.body);
    const existing = await prisma.investigationRequest.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'No such request' });

    if (request.auth.role === 'SUPPORT' && body.status && !SUPPORT_STATUSES.has(body.status)) {
      return reply.status(403).send({ error: 'Support can take a request on and mark it delivered — declining or reopening one needs an Ops administrator' });
    }

    // Advice language is refused before anything is written (UPL review P10).
    const linted = [...lintProcessNote(body.note), ...lintProcessNote(body.deliverable?.note)];
    if (linted.length > 0) {
      const phrases = Array.from(new Set(linted));
      return reply.status(422).send({
        error: `A Record Desk note describes what was done with the record, never what anyone should do about it — remove: ${phrases.map((p) => `"${p}"`).join(', ')}`,
        reason: 'ADVICE_LANGUAGE',
        phrases,
      });
    }

    const data: Partial<Pick<InvestigationRequest, 'status' | 'assignedTo' | 'staffNote' | 'deliveredAt'>> & { deliverable?: Prisma.InputJsonValue | typeof Prisma.DbNull } = {};
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'DELIVERED' && !existing.deliveredAt) data.deliveredAt = new Date();
    }
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
    if (body.note !== undefined) data.staffNote = body.note;
    if (body.deliverable !== undefined) data.deliverable = body.deliverable === null ? Prisma.DbNull : (body.deliverable as Prisma.InputJsonValue);

    const updated = await withTenant(existing.tenantId, (tx) => tx.investigationRequest.update({ where: { id }, data }));
    await AuditService.log({
      tenantId: existing.tenantId, caseId: `investigation:${id}`, action: LogAction.INVESTIGATION_REQUEST, userId: request.auth.userId,
      details: {
        op: 'status_changed',
        organisationId: existing.organisationId,
        before: existing.status,
        after: updated.status,
        assignedTo: updated.assignedTo,
        noteChanged: body.note !== undefined,
        // The chronology's shape, never its text: how many entries were delivered.
        ...(body.deliverable !== undefined ? { deliverableEntries: body.deliverable?.entries.length ?? 0 } : {}),
      },
    });
    return { request: view(updated) };
  });
}
