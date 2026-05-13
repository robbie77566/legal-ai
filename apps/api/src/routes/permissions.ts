import { FastifyInstance } from 'fastify';
import prisma from '@hg/database';
import { z } from 'zod';

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
  // Middleware/helper to ensure caller is ADMIN
  const ensureAdmin = async (userId: string, tenantId: string) => {
    if (!userId || !tenantId) return false;
    const caller = await prisma.user.findUnique({ where: { id: userId }});
    return caller?.tenantId === tenantId && caller?.role === 'ADMIN';
  };

  // Get all users in the system (for assigning to a case)
  fastify.get('/users', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    if (!tenantId) return reply.status(400).send({ error: 'x-tenant-id required' });

    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: 'desc' }
    });
    return users;
  });

  // Create a new user in the tenant
  fastify.post('/users', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    const callerId = request.headers['x-user-id'] as string;
    
    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { email, name, role } = CreateUserSchema.parse(request.body);

    // Check if email already exists
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
    const tenantId = request.headers['x-tenant-id'] as string;
    const callerId = request.headers['x-user-id'] as string;
    const { userId } = request.params as { userId: string };
    
    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    const { role } = UpdateUserSchema.parse(request.body);

    // Ensure user belongs to this tenant
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    // Prevent removing the last admin? (Optional safety net, skipped for now)

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: role as any }
    });

    return { success: true, user: updatedUser };
  });

  // Delete a user from the tenant
  fastify.delete('/users/:userId', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    const callerId = request.headers['x-user-id'] as string;
    const { userId } = request.params as { userId: string };
    
    if (!(await ensureAdmin(callerId, tenantId))) {
      return reply.status(403).send({ error: 'Requires ADMIN privileges' });
    }

    // Ensure user belongs to this tenant
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found in this tenant' });
    }

    if (callerId === userId) {
      return reply.status(400).send({ error: 'Cannot delete yourself' });
    }

    // Delete associated CaseAccess records first (Cascade)
    await prisma.caseAccess.deleteMany({ where: { userId } });
    
    // Delete the user
    await prisma.user.delete({ where: { id: userId } });

    return { success: true };
  });

  // Get users who have access to a specific case
  fastify.get('/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const accessList = await prisma.caseAccess.findMany({
      where: { caseId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    return accessList;
  });

  // Grant access to a case
  fastify.post('/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { userId, role } = GrantAccessSchema.parse(request.body);

    const access = await prisma.caseAccess.upsert({
      where: {
        caseId_userId: { caseId, userId }
      },
      update: { role: role as any },
      create: { caseId, userId, role: role as any }
    });

    return access;
  });

  // Revoke access from a case
  fastify.delete('/cases/:caseId/:userId', async (request, reply) => {
    const { caseId, userId } = request.params as { caseId: string, userId: string };
    await prisma.caseAccess.delete({
      where: {
        caseId_userId: { caseId, userId }
      }
    });
    return { success: true };
  });
}
