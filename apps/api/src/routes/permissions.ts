import { FastifyInstance } from 'fastify';
import prisma, { withTenant } from '@hg/database';
import { z } from 'zod';
import { AuditService, LogAction } from '../services/audit.service';

const GrantAccessSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER']).default('VIEWER')
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER']).default('ATTORNEY')
});

const UpdateUserSchema = z.object({
  role: z.enum(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER'])
});

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
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: 'desc' }
    });
    return users;
  });

  // Create a new user in the tenant
  fastify.post('/users', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;

    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { email, name, role } = CreateUserSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(400).send({ error: 'Email already exists' });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || '',
        role: role as any,
        tenantId
      }
    });

    return { success: true, user };
  });

  // Update a user's system role
  fastify.patch('/users/:userId', async (request, reply) => {
    const { tenantId, userId: callerId } = request.auth;
    const { userId } = request.params as { userId: string };

    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { role } = UpdateUserSchema.parse(request.body);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: role as any }
    });

    return { success: true, user: updatedUser };
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
