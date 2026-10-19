import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@hg/database';
import { businessDaysBetween, LAUNCH_SLA_BUSINESS_DAYS } from '@hg/case-lifecycle';
import { AuditService, LogAction } from '../services/audit.service';

/**
 * Staff console, professional era (persona_rollout_plan.md §5 G,
 * staff_console.md §12). Registered from ops.ts INSIDE its role hook, so
 * Admin reaches everything, Support reads (the hook refuses every POST here)
 * and `/ops/credits` is money, denied to Support like `/ops/payments`.
 *
 * Bar verification is a HUMAN act: a staff member looks the number up in the
 * State Bar directory themselves and presses one of two buttons. Nothing
 * here calls the State Bar; nothing here stores a reason outside the audit
 * row; the bar number never enters an audit row or an email.
 */

const WEB_ORIGIN = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
const COUNSEL_URL = () => `${WEB_ORIGIN()}/counsel`;

/** Today's civil date in America/Chicago — the calendar every date on the staff side is counted on. */
export const todayCivil = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const civilOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/** Record Desk SLA: 10 business days from the request (plan §7 "Observability"). */
export function investigationSla(createdAt: Date, now = new Date()) {
  const businessDaysOpen = businessDaysBetween(civilOf(createdAt), todayCivil(now));
  return { businessDaysOpen, pastSla: businessDaysOpen > LAUNCH_SLA_BUSINESS_DAYS };
}

/** "Near zero" for an organisation allowance: this many records or fewer left of a grant. */
const ALLOWANCE_NEAR_ZERO = 2;

/** Users rejected from the queue: the decision lives only in the audit row, so the queue reads it from there. */
async function rejectedUserIds(): Promise<Set<string>> {
  const rows = await prisma.auditLog.findMany({
    where: { action: LogAction.BAR_VERIFICATION, caseId: { startsWith: 'verification:' } },
    select: { caseId: true, details: true },
  });
  return new Set(rows.filter((r) => (r.details as { op?: string }).op === 'rejected').map((r) => r.caseId.slice('verification:'.length)));
}

/** Monday 00:00 (America/Chicago civil week) as a UTC instant for "this week" counts. */
function weekStart(now = new Date()): Date {
  const civil = todayCivil(now);
  const midnight = new Date(`${civil}T00:00:00Z`);
  midnight.setUTCDate(midnight.getUTCDate() - ((midnight.getUTCDay() + 6) % 7));
  // Chicago midnight is 05:00/06:00 UTC; being an hour or so generous at the
  // boundary beats a wrong-timezone week.
  return midnight;
}

/** The Today page's professional group (plan §7 "Observability"): five numbers, each a door. */
export async function professionalOverview(now = new Date()) {
  const [pending, rejected, quoteRequestsOpen, pilotEntries, testOrgs, orgs, entries, open] = await Promise.all([
    prisma.user.findMany({ where: { accountKind: 'PROFESSIONAL', barNumber: { not: null }, barVerifiedAt: null, deletedAt: null }, select: { id: true } }),
    rejectedUserIds(),
    prisma.quoteRequest.count({ where: { status: 'OPEN' } }),
    prisma.allowanceEntry.findMany({ where: { kind: 'PILOT', consumedAt: { gte: weekStart(now) } }, select: { organisationId: true } }),
    prisma.organisation.findMany({ where: { isTest: true }, select: { id: true } }),
    prisma.organisation.findMany({ where: { kind: { not: 'FAMILY' }, isTest: false, allowanceRecords: { gt: 0 } }, select: { id: true, name: true, kind: true, allowanceRecords: true, pilot: true, publicInterest: true } }),
    prisma.allowanceEntry.groupBy({ by: ['organisationId'], _count: { _all: true } }),
    prisma.investigationRequest.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      include: { organisation: { select: { id: true, name: true, kind: true, isTest: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const usedOf = new Map(entries.map((e) => [e.organisationId, e._count._all]));
  const testOrgIds = new Set(testOrgs.map((o) => o.id));
  const allowancesNearZero = orgs
    .map((o) => ({ organisationId: o.id, organisation: o.name, kind: o.kind, granted: o.allowanceRecords, remaining: Math.max(0, o.allowanceRecords - (usedOf.get(o.id) ?? 0)), pilot: o.pilot, publicInterest: o.publicInterest }))
    .filter((o) => o.remaining <= ALLOWANCE_NEAR_ZERO)
    .sort((a, b) => a.remaining - b.remaining);
  const investigationsPastSla = open
    .map((r) => ({ ...investigationSla(r.createdAt, now), id: r.id, organisationId: r.organisation.id, organisation: r.organisation.name, kind: r.kind, status: r.status, createdAt: r.createdAt, dueBy: r.dueBy, assignedTo: r.assignedTo }))
    .filter((r) => r.pastSla && !testOrgIds.has(r.organisationId))
    .sort((a, b) => b.businessDaysOpen - a.businessDaysOpen);
  return {
    verificationsPending: pending.filter((u) => !rejected.has(u.id)).length,
    quoteRequestsOpen,
    pilotRecordsThisWeek: pilotEntries.filter((e) => !testOrgIds.has(e.organisationId)).length,
    allowancesNearZero,
    investigationsPastSla,
  };
}

export async function opsProfessionalRoutes(fastify: FastifyInstance) {
  // ── Bar verification queue ────────────────────────────────────────────
  fastify.get('/verifications', async () => {
    const [users, rejected] = await Promise.all([
      prisma.user.findMany({
        where: { accountKind: 'PROFESSIONAL', barNumber: { not: null }, barVerifiedAt: null, deletedAt: null },
        select: {
          id: true, name: true, email: true, barNumber: true, barState: true, practiceType: true, createdAt: true,
          memberships: { select: { role: true, organisation: { select: { id: true, name: true, kind: true, isTest: true } } }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
        orderBy: { createdAt: 'asc' },
      }),
      rejectedUserIds(),
    ]);
    return {
      verifications: users
        .filter((u) => !rejected.has(u.id))
        .map((u) => ({
          id: u.id, name: u.name, email: u.email, barNumber: u.barNumber, barState: u.barState, practiceType: u.practiceType, signedUpAt: u.createdAt,
          organisation: u.memberships[0]?.organisation ?? null,
          seat: u.memberships[0]?.role ?? null,
        })),
    };
  });

  const pendingProfessional = async (userId: string) => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, tenantId: true, accountKind: true, barNumber: true, barVerifiedAt: true, barVerifiedBy: true, deletedAt: true } });
    if (!u || u.accountKind !== 'PROFESSIONAL' || !u.barNumber || u.deletedAt) return null;
    return u;
  };

  fastify.post('/verifications/:userId/verify', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const u = await pendingProfessional(userId);
    if (!u) return reply.status(404).send({ error: 'No professional account with a bar number to verify' });
    if (u.barVerifiedAt) return reply.status(409).send({ error: 'Already verified' });
    const now = new Date();
    await prisma.user.update({ where: { id: u.id }, data: { barVerifiedAt: now, barVerifiedBy: request.auth.userId } });
    await AuditService.log({
      tenantId: u.tenantId, caseId: `verification:${u.id}`, action: LogAction.BAR_VERIFICATION, userId: request.auth.userId,
      details: { op: 'verified', userId: u.id, before: { barVerifiedAt: null, barVerifiedBy: null }, after: { barVerifiedAt: now.toISOString(), barVerifiedBy: request.auth.userId } },
    });
    const { sendBarVerified } = await import('@hg/email');
    const mail = await sendBarVerified(u.email, { counselUrl: COUNSEL_URL() });
    return { ok: true, userId: u.id, barVerifiedAt: now, barVerifiedBy: request.auth.userId, emailed: mail.delivered };
  });

  fastify.post('/verifications/:userId/reject', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { note } = z.object({ note: z.string().trim().min(1).max(2000) }).parse(request.body ?? {});
    const u = await pendingProfessional(userId);
    if (!u) return reply.status(404).send({ error: 'No professional account with a bar number to verify' });
    if (u.barVerifiedAt) return reply.status(409).send({ error: 'Already verified' });
    // The account is untouched: the decision and its reason live in the audit row alone.
    await AuditService.log({
      tenantId: u.tenantId, caseId: `verification:${u.id}`, action: LogAction.BAR_VERIFICATION, userId: request.auth.userId,
      details: { op: 'rejected', userId: u.id, note },
    });
    const { sendBarNotVerified } = await import('@hg/email');
    const mail = await sendBarNotVerified(u.email, { counselUrl: COUNSEL_URL() });
    return { ok: true, userId: u.id, emailed: mail.delivered };
  });

  // ── Credits (money; the hook keeps Support off it) ───────────────────
  fastify.get('/credits', async (request) => {
    const { organisationId } = z.object({ organisationId: z.string().max(64).optional() }).parse(request.query ?? {});
    const rows = await prisma.credit.findMany({
      where: organisationId ? { organisationId } : {},
      orderBy: [{ issuedAt: 'desc' }],
      take: 500,
    });
    const now = Date.now();
    const state = (c: (typeof rows)[number]) => (c.consumedAt ? 'CONSUMED' : c.expiresAt.getTime() < now ? 'EXPIRED' : 'LIVE');
    const orgIds = [...new Set(rows.map((r) => r.organisationId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [orgs, users] = await Promise.all([
      orgIds.length ? prisma.organisation.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, kind: true, isTest: true } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }) : [],
    ]);
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const shaped = rows.map((c) => ({
      id: c.id, packId: c.packId, rung: c.rung, state: state(c), issuedAt: c.issuedAt, expiresAt: c.expiresAt, consumedAt: c.consumedAt, consumedCaseId: c.consumedCaseId, paymentId: c.paymentId,
      organisation: c.organisationId ? orgById.get(c.organisationId) ?? null : null,
      buyer: userById.get(c.userId) ?? null,
    }));
    return {
      issued: shaped.length,
      consumed: shaped.filter((c) => c.state === 'CONSUMED').length,
      expired: shaped.filter((c) => c.state === 'EXPIRED').length,
      live: shaped.filter((c) => c.state === 'LIVE').length,
      rows: shaped,
    };
  });

  // ── Staff accounts, for the Record Desk reviewer picker ───────────────
  fastify.get('/staff', async () => {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPPORT', 'ATTORNEY'] }, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return { staff };
  });
}
