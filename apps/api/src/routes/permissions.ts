import { FastifyInstance } from 'fastify';
import prisma, { withTenant, grantKindForRole } from '@hg/database';
import { z } from 'zod';
import { AuditService, LogAction } from '../services/audit.service';
import { generateToken } from '@hg/auth';

const INVITE_HOURS = 24;
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'an Ops administrator',
  ATTORNEY: 'a quality reviewer',
  SUPPORT: 'a support team member',
  INVESTIGATOR: 'an investigator',
  VIEWER: 'a viewer',
};
const WHAT_YOU_SEE: Record<string, string> = {
  ADMIN: 'the whole operations console — cases, customers, money, holds, and system health.',
  ATTORNEY: 'the quality-review queue, where reports are checked against the record and released to families.',
  SUPPORT: 'every case file (uploads, analysis, what the family received), customer accounts, and feedback. Refunds and deletions go to an admin as requests.',
  INVESTIGATOR: 'the case workspaces you are given access to.',
  VIEWER: 'the case workspaces you are given access to, read-only.',
};

/**
 * Issue (or re-issue) the invite: a fresh 24-hour token and the email that
 * explains how to get in. Returns the setup link only when the email could
 * not be delivered, so an admin can hand it over another way.
 */
async function sendInviteFor(user: { id: string; email: string; name: string | null; role: string }, invitedById: string) {
  const { raw, hash } = generateToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { inviteToken: hash, inviteExpires: new Date(Date.now() + INVITE_HOURS * 3_600_000) },
  });
  const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
  const setupUrl = `${origin}/auth/setup-password?token=${raw}&id=${user.id}`;
  const inviter = await prisma.user.findUnique({ where: { id: invitedById }, select: { name: true, email: true } });
  const { sendInvite } = await import('@hg/email');
  const result = await sendInvite(user.email, {
    name: user.name,
    roleLabel: ROLE_LABEL[user.role] ?? user.role.toLowerCase(),
    whatYouSee: WHAT_YOU_SEE[user.role] ?? 'the pages your role allows.',
    setupUrl,
    signInUrl: `${origin}/auth/signin`,
    invitedBy: inviter?.name || inviter?.email || 'An administrator',
    hours: INVITE_HOURS,
  });
  return { delivered: result.delivered, error: result.error, ...(result.delivered ? {} : { setupUrl }) };
}

const GrantAccessSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER', 'SUPPORT']).default('VIEWER')
});

/**
 * The licence of a staff member (UPL review 2026-10-23, recommendation 9,
 * P10). Optional on create and on patch: an Admin who records a bar number
 * for a colleague has looked it up in the State Bar directory themselves,
 * the same human act as the attorney queue, so the number is stored
 * VERIFIED under the Admin's name. `null` clears it. `PATCH /qa/findings`
 * refuses edits to the legal text unless the editor has one.
 */
const BarNumber = z.string().trim().min(1).max(32);
const BarState = z.string().trim().regex(/^[A-Za-z]{2}$/).transform((v) => v.toUpperCase());

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER', 'SUPPORT']).default('ATTORNEY'),
  barNumber: BarNumber.optional(),
  barState: BarState.optional(),
});

const UpdateUserSchema = z
  .object({
    role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER', 'SUPPORT']).optional(),
    barNumber: BarNumber.nullable().optional(),
    barState: BarState.optional(),
  })
  .refine((b) => b.role !== undefined || b.barNumber !== undefined, { message: 'Nothing to change' });

/** The licence columns for a staff account: recorded as verified by the Admin, or cleared. */
const licenceData = (barNumber: string | null, barState: string | undefined, by: string) =>
  barNumber
    ? { barNumber, barState: barState ?? 'TX', barVerifiedAt: new Date(), barVerifiedBy: by, barVerificationStatus: 'VERIFIED' as const, barRejectedAt: null, barRejectionNote: null }
    : { barNumber: null, barState: null, barVerifiedAt: null, barVerifiedBy: null, barVerificationStatus: 'PENDING' as const };

export default async function permissionsRoutes(fastify: FastifyInstance) {
  // The caller's role comes from the verified token, but the DB stays
  // authoritative: a role change takes effect on next check, not next sign-in.
  const ensureAdmin = async (userId: string, tenantId: string) => {
    const caller = await prisma.user.findUnique({ where: { id: userId } });
    return caller?.tenantId === tenantId && caller?.role === 'ADMIN';
  };

  // The caller must hold case-level ADMIN on the case (and the case must be in
  // the caller's tenant) to manage its access list.
  const ensureCaseAdmin = async (tenantId: string, callerId: string, caseId: string) => {
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId, userId: callerId } }
      });
      return access?.role === 'ADMIN';
    });
  };

  // Get all users in the tenant (for assigning to a case)
  fastify.get('/users', async (request) => {
    const { tenantId } = request.auth;

    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true, passwordHash: true, inviteExpires: true, barNumber: true, barState: true, barVerifiedAt: true },
      orderBy: { createdAt: 'desc' }
    });
    return users.map(({ passwordHash, inviteExpires, barVerifiedAt, ...u }) => ({
      ...u,
      // The licence on file (UPL review rec. 9): who may edit legal text in QA.
      barVerified: barVerifiedAt !== null,
      // Invite state for the team list: nothing is active until a password is set.
      active: !!passwordHash,
      invitePending: !passwordHash && !!inviteExpires && inviteExpires > new Date(),
      inviteExpired: !passwordHash && !!inviteExpires && inviteExpires <= new Date(),
    }));
  });

  // Create a new user in the tenant
  fastify.post('/users', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;

    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { email, name, role, barNumber, barState } = CreateUserSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(400).send({ error: 'Email already exists' });
    }

    // Staff from the first write: accountKind STAFF plus the grant the role
    // maps to (identity expand step), so the swap to grant-based gates finds
    // every invited account already in the new shape.
    const grantKind = grantKindForRole(role);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || '',
        role: role as any,
        accountKind: 'STAFF',
        tenantId,
        ...(barNumber ? licenceData(barNumber, barState, callerId) : {}),
        ...(grantKind ? { grants: { create: { kind: grantKind, grantedBy: callerId } } } : {}),
      }
    });

    // The account exists but cannot sign in until its owner sets a password
    // from the invite email (auth design §4.6).
    const invite = await sendInviteFor(user, callerId);
    await AuditService.log({
      tenantId, caseId: `user:${user.id}`, action: LogAction.CASE_ACCESS, userId: callerId,
      details: { op: 'staff_invited', targetUserId: user.id, role, delivered: invite.delivered, licenceRecorded: !!barNumber },
    });
    return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, barVerified: user.barVerifiedAt !== null }, invite };
  });

  // Resend the invite (rotates the token). Accounts that already have a
  // password use the normal "forgot password" flow instead.
  fastify.post('/users/:userId/invite', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }
    const { userId } = request.params as { userId: string };
    const target = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.passwordHash) {
      return reply.status(409).send({ error: 'This account already has a password — they can use "Forgot password" to reset it' });
    }
    const invite = await sendInviteFor(target, callerId);
    await AuditService.log({
      tenantId, caseId: `user:${target.id}`, action: LogAction.CASE_ACCESS, userId: callerId,
      details: { op: 'staff_invite_resent', targetUserId: target.id, delivered: invite.delivered },
    });
    return { success: true, invite };
  });

  // Update a user's system role
  fastify.patch('/users/:userId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { userId } = request.params as { userId: string };

    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { role, barNumber, barState } = UpdateUserSchema.parse(request.body);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }
    if (target.accountKind === 'PROFESSIONAL') {
      // A professional's bar number is verified from /ops/verifications, never here.
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    // The licence (UPL review rec. 9): recorded or cleared beside the role.
    const licence = barNumber !== undefined ? licenceData(barNumber, barState, callerId) : {};

    // Role and grants move together: the old grant is revoked (timestamp,
    // never a delete), the new one granted or re-activated.
    const grantKind = role !== undefined ? grantKindForRole(role) : null;
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { ...(role !== undefined ? { role: role as any, accountKind: 'STAFF' as const } : {}), ...licence }
      }),
      ...(role !== undefined
        ? [prisma.staffGrant.updateMany({
            where: { userId, revokedAt: null, ...(grantKind ? { kind: { not: grantKind } } : {}) },
            data: { revokedAt: new Date() },
          })]
        : []),
      ...(grantKind
        ? [prisma.staffGrant.upsert({
            where: { userId_kind: { userId, kind: grantKind } },
            update: { revokedAt: null, grantedBy: callerId, grantedAt: new Date() },
            create: { userId, kind: grantKind, grantedBy: callerId },
          })]
        : []),
    ]);

    if (barNumber !== undefined) {
      // Audited like the attorney queue; the number itself never enters the row.
      await AuditService.log({
        tenantId, caseId: `verification:${userId}`, action: LogAction.BAR_VERIFICATION, userId: callerId,
        details: {
          op: barNumber ? 'staff_licence_recorded' : 'staff_licence_cleared',
          userId,
          before: { barVerifiedAt: target.barVerifiedAt?.toISOString() ?? null },
          after: { barVerifiedAt: updatedUser.barVerifiedAt?.toISOString() ?? null, barVerifiedBy: updatedUser.barVerifiedBy },
        },
      });
    }

    const { passwordHash: _p, inviteToken: _i, resetToken: _r, emailChangeToken: _e, ...safe } = updatedUser;
    return { success: true, user: { ...safe, barVerified: updatedUser.barVerifiedAt !== null } };
  });

  // Delete a user from the tenant
  fastify.delete('/users/:userId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { userId } = request.params as { userId: string };

    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    if (callerId === userId) {
      return reply.status(400).send({ error: 'Cannot delete yourself' });
    }

    await prisma.caseAccess.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    return { success: true };
  });

  // Get users who have access to a specific case
  fastify.get('/cases/:caseId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { caseId } = request.params as { caseId: string };

    return withTenant(tenantId, async (tx) => {
      const callerAccess = await tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId, userId: callerId } }
      });
      if (!callerAccess) return reply.status(403).send({ error: 'Forbidden' });

      return tx.caseAccess.findMany({
        where: { caseId },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });
    });
  });

  // Grant access to a case (case-ADMIN only; previously unauthenticated!)
  fastify.post('/cases/:caseId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { caseId } = request.params as { caseId: string };
    const { userId, role } = GrantAccessSchema.parse(request.body);

    if (!(await ensureCaseAdmin(tenantId, callerId, caseId))) {
      return reply.status(403).send({ error: 'Requires case ADMIN access' });
    }

    // The grantee must belong to the same tenant — never cross-tenant grants.
    const grantee = await prisma.user.findUnique({ where: { id: userId } });
    if (!grantee || grantee.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    const access = await withTenant(tenantId, (tx) =>
      tx.caseAccess.upsert({
        where: { caseId_userId: { caseId, userId } },
        update: { role: role as any },
        create: { caseId, userId, role: role as any }
      })
    );

    await AuditService.log({
      tenantId,
      caseId,
      action: LogAction.CASE_ACCESS,
      userId: callerId,
      details: { op: 'grant', targetUserId: userId, role }
    });

    return access;
  });

  // Revoke access from a case (case-ADMIN only; previously unauthenticated!)
  fastify.delete('/cases/:caseId/:userId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { caseId, userId } = request.params as { caseId: string; userId: string };

    if (!(await ensureCaseAdmin(tenantId, callerId, caseId))) {
      return reply.status(403).send({ error: 'Requires case ADMIN access' });
    }

    await withTenant(tenantId, (tx) =>
      tx.caseAccess.delete({
        where: { caseId_userId: { caseId, userId } }
      })
    );

    await AuditService.log({
      tenantId,
      caseId,
      action: LogAction.CASE_ACCESS,
      userId: callerId,
      details: { op: 'revoke', targetUserId: userId }
    });

    return { success: true };
  });
}
