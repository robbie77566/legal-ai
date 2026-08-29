import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';

// Mock IORedis to avoid connecting to localhost:6379 during tests
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => ({
      on: vi.fn(),
      status: 'ready',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      quit: vi.fn()
    }))
  };
});

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    tenant: { findFirst: vi.fn() },
    case: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    caseAccess: { findUnique: vi.fn(), deleteMany: vi.fn() },
    document: { findMany: vi.fn(), deleteMany: vi.fn() },
    documentChunk: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() }
  };
  return { mockPrisma };
});

vi.mock('@hg/database', () => ({
  default: mockPrisma,
  withTenant: vi.fn(async (_tenantId: string, fn: any) => fn(mockPrisma))
}));

describe('Cases API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /cases', () => {
    it('should create a case and assign the creator an ADMIN role in CaseAccess ACL', async () => {
      (prisma.case.create as any).mockResolvedValue({ id: 'case_123', title: 'Test Case', tenantId: 'tenant_1' });

      const response = await fastify.inject({
        method: 'POST',
        url: '/cases',
        headers: {
          'x-tenant-id': 'tenant_1',
          'x-user-id': 'user_1'
        },
        payload: {
          title: 'Test Case',
          defendant: 'John Doe',
          jurisdiction: 'NY'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, caseId: 'case_123' });
      
      expect(prisma.case.create).toHaveBeenCalledWith({
        data: {
          title: 'Test Case',
          tenantId: 'tenant_1',
          accessList: {
            create: {
              userId: 'user_1',
              role: 'ADMIN'
            }
          }
        }
      });
    });

    it('should create a case without assigning ACL if x-user-id is missing (system creation)', async () => {
      (prisma.case.create as any).mockResolvedValue({ id: 'case_system', title: 'System Case', tenantId: 'tenant_1' });

      const response = await fastify.inject({
        method: 'POST',
        url: '/cases',
        headers: {
          'x-tenant-id': 'tenant_1'
          // Intentionally missing x-user-id
        },
        payload: {
          title: 'System Case'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.case.create).toHaveBeenCalledWith({
        data: {
          title: 'System Case',
          tenantId: 'tenant_1'
          // NO accessList creation should be here
        }
      });
    });

    it('should return 400 if x-tenant-id header is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/cases',
        headers: {
          'x-user-id': 'user_1'
        },
        payload: {
          title: 'Fallback Case'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'x-tenant-id header is required' });
    });
  });

  describe('GET /cases', () => {
    it('should return 400 if x-tenant-id is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/cases'
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return cases for a user', async () => {
      const mockCases = [{ id: 'case_1', title: 'Case 1' }];
      (prisma.case.findMany as any).mockResolvedValue(mockCases);

      const response = await fastify.inject({
        method: 'GET',
        url: '/cases',
        headers: {
          'x-tenant-id': 'tenant_1',
          'x-user-id': 'user_1'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockCases);
      expect(prisma.case.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant_1',
          accessList: { some: { userId: 'user_1' } }
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          accessList: {
            where: { userId: 'user_1' },
            select: { role: true }
          }
        }
      });
    });
  });

  describe('PATCH /cases/:id', () => {
    it('should return 401 if user id is missing', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        payload: { title: 'New Title' }
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 if user is not ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'VIEWER' });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        headers: { 'x-user-id': 'user_1' },
        payload: { title: 'New Title' }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should update the case if user is ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ADMIN' });
      (prisma.case.update as any).mockResolvedValue({ id: '123', title: 'New Title' });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        headers: { 'x-user-id': 'user_1' },
        payload: { title: 'New Title' }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.case.update).toHaveBeenCalledWith({
        where: { id: '123' },
        data: { title: 'New Title' }
      });
    });
  });

  describe('DELETE /cases/:id', () => {
    it('should return 400 if x-tenant-id is missing', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123'
      });
      expect(response.statusCode).toBe(400);
    });

    it('should return 401 if user id is missing', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123',
        headers: { 'x-tenant-id': 'tenant_1' }
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 403 if user is not ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ATTORNEY' });

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123',
        headers: { 'x-tenant-id': 'tenant_1', 'x-user-id': 'user_1' }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should atomically cascade delete inside a transaction if user is ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ADMIN' });
      (prisma.document.findMany as any).mockResolvedValue([{ id: 'doc_1' }]);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123',
        headers: { 'x-tenant-id': 'tenant_1', 'x-user-id': 'user_1' }
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.documentChunk.deleteMany).toHaveBeenCalled();
      expect(prisma.document.deleteMany).toHaveBeenCalled();
      expect(prisma.auditLog.deleteMany).toHaveBeenCalled();
      expect(prisma.caseAccess.deleteMany).toHaveBeenCalled();
      expect(prisma.case.delete).toHaveBeenCalledWith({ where: { id: '123' } });
    });
  });
});
