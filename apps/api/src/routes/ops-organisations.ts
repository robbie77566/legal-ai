import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Organisation } from '@prisma/client';
import prisma from '@hg/database';
import { pilotAllowance, publicInterestAllowance } from '@hg/case-lifecycle';
import { AuditService, LogAction } from '../services/audit.service';
import { allowanceSummary, organisationStaffView } from '../services/organisation.service';

/**
 * Staff grants on organisations (persona_rollout_plan.md §4 "PD pilot",
 * "Public-interest"; §5 I; staff_console.md §11). Mounted at
 * /ops/organisations inside the ops plugin, so Admin reaches everything and
 * Support reads only (every write here is a PATCH or a POST outside the
 * per-case allowlist, which the ops hook refuses for Support).
 *
 * This file GRANTS: it writes the pilot flag, the public-interest flag, the
 * allowance and its reset date on the organisation. Usage — the ledger rows
 * and the decrement at analysis start — is workstream B's and is only READ
 * here (metrics), from the tables that exist today.
 *
 * Cross-tenant by nature, so reads are on the owner connection; every write
 * is one ORGANISATION_CHANGE audit row under the organisation's tenant with
 * the fields before and after.
 */

const KINDS = ['FIRM', 'PD_OFFICE', 'CLINIC'] as const; // FAMILY organisations are never set by hand
const isoDate = z.string().datetime({ offset: true });

const PatchSchema = z
  .object({
    kind: z.enum(KINDS).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    billingEmail: z.string().trim().email().max(254).nullable().optional(),
    securityContact: z.string().trim().max(254).nullable().optional(),
    pilot: z.boolean().optional(),
    pilotEndsAt: isoDate.nullable().optional(),
    allowanceRecords: z.number().int().min(0).max(100_000).optional(),
    allowanceResetsAt: isoDate.nullable().optional(),
    publicInterest: z.boolean().optional(),
    isTest: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

type Patchable = keyof z.infer<typeof PatchSchema>;
const pick = (o: Organisation, keys: Patchable[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));

export async function opsOrganisationRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request) => {
    const { kind, q } = request.query as { kind?: string; q?: string };
    const rows = await prisma.organisation.findMany({
      where: {
        ...(kind && (KINDS as readonly string[]).includes(kind) ? { kind: kind as (typeof KINDS)[number] } : { kind: { not: 'FAMILY' } }),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { organisations: rows.map(organisationStaffView) };
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const org = await prisma.organisation.findUnique({ where: { id }, include: { _count: { select: { memberships: true } } } });
    if (!org) return reply.status(404).send({ error: 'No such organisation' });
    const [members, invitations] = await Promise.all([
      prisma.membership.findMany({
        where: { organisationId: id },
        include: { user: { select: { id: true, email: true, name: true, practiceType: true, barVerifiedAt: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invitation.findMany({ where: { organisationId: id, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      organisation: organisationStaffView(org),
      members: members.map((m) => ({
        userId: m.userId, role: m.role, email: m.user.email, name: m.user.name, practiceType: m.user.practiceType,
        barVerified: m.user.barVerifiedAt !== null, since: m.createdAt,
      })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    };
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = PatchSchema.parse(request.body);
    const before = await prisma.organisation.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'No such organisation' });

    const keys = Object.keys(body) as Patchable[];
    const data: Record<string, unknown> = {};
    for (const k of keys) {
      const v = body[k];
      data[k] = (k === 'pilotEndsAt' || k === 'allowanceResetsAt') && typeof v === 'string' ? new Date(v) : v;
    }
    const after = await prisma.organisation.update({ where: { id }, data });
    await AuditService.log({
      tenantId: before.tenantId, caseId: `organisation:${id}`, action: LogAction.ORGANISATION_CHANGE, userId: request.auth.userId,
      details: { op: 'organisation_updated', before: pick(before, keys), after: pick(after, keys) },
    });
    return { organisation: organisationStaffView(after) };
  });

  // The PD pilot (plan §4): free, 90 days, 15 records, from now.
  fastify.post('/:id/pilot', async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.organisation.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'No such organisation' });
    const ledger = pilotAllowance(new Date().toISOString());
    const after = await prisma.organisation.update({
      where: { id },
      data: { pilot: true, pilotEndsAt: new Date(ledger.resetsAt), allowanceRecords: ledger.granted, allowanceResetsAt: new Date(ledger.resetsAt) },
    });
    await AuditService.log({
      tenantId: before.tenantId, caseId: `organisation:${id}`, action: LogAction.ORGANISATION_CHANGE, userId: request.auth.userId,
      details: { op: 'pilot_started', before: allowanceSummary(before), after: allowanceSummary(after) },
    });
    return { organisation: organisationStaffView(after) };
  });

  // The public-interest allowance (plan §4): 25 records a year at $0, from now.
  fastify.post('/:id/public-interest', async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.organisation.findUnique({ where: { id } });
    if (!before) return reply.status(404).send({ error: 'No such organisation' });
    const ledger = publicInterestAllowance(new Date().toISOString());
    const after = await prisma.organisation.update({
      where: { id },
      data: { publicInterest: true, allowanceRecords: ledger.granted, allowanceResetsAt: new Date(ledger.resetsAt) },
    });
    await AuditService.log({
      tenantId: before.tenantId, caseId: `organisation:${id}`, action: LogAction.ORGANISATION_CHANGE, userId: request.auth.userId,
      details: { op: 'public_interest_granted', before: allowanceSummary(before), after: allowanceSummary(after) },
    });
    return { organisation: organisationStaffView(after) };
  });

  // Pilot metrics (plan §3 "pilot metrics"): counted from the tables that
  // exist today. "Used" is records that reached analysis — the moment the
  // allowance is decremented (plan §4) — until workstream B's ledger rows
  // replace the count.
  fastify.get('/:id/metrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const org = await prisma.organisation.findUnique({ where: { id } });
    if (!org) return reply.status(404).send({ error: 'No such organisation' });
    const tenantId = org.tenantId;
    const [recordsOpened, analysesRun, analysed, members, lastCase, lastRun, lastSeat] = await Promise.all([
      prisma.case.count({ where: { tenantId, status: { not: 'DELETED' } } }),
      prisma.analysisRun.count({ where: { tenantId } }),
      prisma.analysisRun.findMany({ where: { tenantId }, distinct: ['caseId'], select: { caseId: true } }),
      prisma.membership.count({ where: { organisationId: id } }),
      prisma.case.findFirst({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.analysisRun.findFirst({ where: { tenantId }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
      prisma.membership.findFirst({ where: { organisationId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const used = analysed.length;
    const stamps = [lastCase?.updatedAt, lastRun?.startedAt, lastSeat?.createdAt, org.updatedAt].filter((d): d is Date => !!d);
    const lastActivity = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null;
    return {
      organisationId: id,
      recordsOpened,
      analysesRun,
      allowance: {
        granted: org.allowanceRecords,
        used,
        remaining: Math.max(0, org.allowanceRecords - used),
        resetsAt: org.allowanceResetsAt,
        pilot: org.pilot,
        pilotEndsAt: org.pilotEndsAt,
        publicInterest: org.publicInterest,
      },
      members,
      lastActivity,
    };
  });
}
