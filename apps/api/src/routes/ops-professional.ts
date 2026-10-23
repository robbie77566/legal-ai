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
 * here calls the State Bar; the bar number never enters an audit row or an
 * email.
 *
 * UPL review 2026-10-23 (P1): the decision now lives on the account —
 * User.barVerificationStatus PENDING | VERIFIED | REJECTED, plus
 * barRejectedAt and the internal barRejectionNote — because the lawyer gate
 * (guards.ts requireLawyerSeat) reads it on every request. Verify sets
 * VERIFIED and opens matters, quotes and the packet; reject sets REJECTED
 * and closes them on the next request (a verified number can be rejected
 * later — that revokes it); verify after a rejection reopens. Practice types
 * `investigator` and `other` cannot be verified as a lawyer: staff decline
 * them and the owner invites the investigator to a seat instead.
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

/** Practice types that describe a non-lawyer: the account may exist, but it is never verified as a lawyer. */
export const NON_LAWYER_PRACTICE_TYPES: ReadonlySet<string> = new Set(['investigator', 'other']);

/** The verification queue's filter: a professional with a bar number, undecided. */
const PENDING_WHERE = { accountKind: 'PROFESSIONAL' as const, barNumber: { not: null }, barVerifiedAt: null, barVerificationStatus: 'PENDING' as const, deletedAt: null };

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
  const [pending, quoteRequestsOpen, pilotEntries, testOrgs, orgs, entries, open] = await Promise.all([
    prisma.user.count({ where: PENDING_WHERE }),
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
    verificationsPending: pending,
    quoteRequestsOpen,
    pilotRecordsThisWeek: pilotEntries.filter((e) => !testOrgIds.has(e.organisationId)).length,
    allowancesNearZero,
    investigationsPastSla,
  };
}

export async function opsProfessionalRoutes(fastify: FastifyInstance) {
  // ── Bar verification queue ────────────────────────────────────────────
  fastify.get('/verifications', async () => {
    const users = await prisma.user.findMany({
      where: PENDING_WHERE,
      select: {
        id: true, name: true, email: true, barNumber: true, barState: true, practiceType: true, barVerificationStatus: true, createdAt: true,
        memberships: { select: { role: true, organisation: { select: { id: true, name: true, kind: true, isTest: true } } }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      verifications: users.map((u) => ({
        id: u.id, name: u.name, email: u.email, barNumber: u.barNumber, barState: u.barState, practiceType: u.practiceType, signedUpAt: u.createdAt,
        barVerificationStatus: u.barVerificationStatus,
        // The page shows this so staff decline a non-lawyer practice type rather than verify it.
        lawyerPracticeType: !NON_LAWYER_PRACTICE_TYPES.has(u.practiceType ?? ''),
        organisation: u.memberships[0]?.organisation ?? null,
        seat: u.memberships[0]?.role ?? null,
      })),
    };
  });

  const professionalWithBar = async (userId: string) => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, tenantId: true, accountKind: true, barNumber: true, barVerifiedAt: true, barVerifiedBy: true, barVerificationStatus: true, practiceType: true, deletedAt: true },
    });
    if (!u || u.accountKind !== 'PROFESSIONAL' || !u.barNumber || u.deletedAt) return null;
    return u;
  };

  fastify.post('/verifications/:userId/verify', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const u = await professionalWithBar(userId);
    if (!u) return reply.status(404).send({ error: 'No professional account with a bar number to verify' });
    if (u.barVerifiedAt && u.barVerificationStatus === 'VERIFIED') return reply.status(409).send({ error: 'Already verified' });
    if (NON_LAWYER_PRACTICE_TYPES.has(u.practiceType ?? '')) {
      return reply.status(409).send({
        error: 'An investigator or other non-lawyer practice type cannot be verified as a lawyer — record it as not verified; investigators take a seat by invitation from an organisation owner',
        reason: 'NOT_A_LAWYER_PRACTICE',
      });
    }
    const now = new Date();
    const before = { barVerifiedAt: u.barVerifiedAt?.toISOString() ?? null, barVerifiedBy: u.barVerifiedBy, barVerificationStatus: u.barVerificationStatus };
    await prisma.user.update({
      where: { id: u.id },
      data: { barVerifiedAt: now, barVerifiedBy: request.auth.userId, barVerificationStatus: 'VERIFIED', barRejectedAt: null, barRejectionNote: null },
    });
    await AuditService.log({
      tenantId: u.tenantId, caseId: `verification:${u.id}`, action: LogAction.BAR_VERIFICATION, userId: request.auth.userId,
      details: { op: 'verified', userId: u.id, before, after: { barVerifiedAt: now.toISOString(), barVerifiedBy: request.auth.userId, barVerificationStatus: 'VERIFIED' } },
    });
    const { sendBarVerified } = await import('@hg/email');
    const mail = await sendBarVerified(u.email, { counselUrl: COUNSEL_URL() });
    return { ok: true, userId: u.id, barVerifiedAt: now, barVerifiedBy: request.auth.userId, barVerificationStatus: 'VERIFIED', emailed: mail.delivered };
  });

  fastify.post('/verifications/:userId/reject', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { note } = z.object({ note: z.string().trim().min(1).max(2000) }).parse(request.body ?? {});
    const u = await professionalWithBar(userId);
    if (!u) return reply.status(404).send({ error: 'No professional account with a bar number to verify' });
    if (u.barVerificationStatus === 'REJECTED') return reply.status(409).send({ error: 'Already recorded as not verified' });
    // The account stays and the number stays; the decision closes counsel
    // review (guards.ts) and the reason is internal — the audit row and the
    // staff-only note column, never the email.
    const now = new Date();
    const revoked = u.barVerifiedAt !== null;
    await prisma.user.update({
      where: { id: u.id },
      data: { barVerificationStatus: 'REJECTED', barRejectedAt: now, barRejectionNote: note, barVerifiedAt: null, barVerifiedBy: null },
    });
    await AuditService.log({
      tenantId: u.tenantId, caseId: `verification:${u.id}`, action: LogAction.BAR_VERIFICATION, userId: request.auth.userId,
      details: { op: 'rejected', userId: u.id, note, revoked, before: { barVerificationStatus: u.barVerificationStatus }, after: { barVerificationStatus: 'REJECTED', barRejectedAt: now.toISOString() } },
    });
    const { sendBarNotVerified } = await import('@hg/email');
    const mail = await sendBarNotVerified(u.email, { counselUrl: COUNSEL_URL() });
    return { ok: true, userId: u.id, barVerificationStatus: 'REJECTED', revoked, emailed: mail.delivered };
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
