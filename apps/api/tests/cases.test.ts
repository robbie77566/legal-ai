process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

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
    user: { findUnique: vi.fn() },
    case: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    caseAccess: { findUnique: vi.fn(), deleteMany: vi.fn() },
    document: { findMany: vi.fn(), deleteMany: vi.fn() },
    documentChunk: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn(), create: vi.fn() }
  };
  return { mockPrisma };
});

vi.mock('@hg/database', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
  withTenant: vi.fn(async (_tenantId: string, fn: any) => fn(mockPrisma))
}));

// Auth: requests carry a real, signed NextAuth session token in the cookie —
// identity comes ONLY from the verified token (the legacy x-tenant-id /
// x-user-id headers are dead and must be ignored).
let authCookie: string;

beforeAll(async () => {
  const token = await encodeSessionToken({
    userId: 'user_1',
    tenantId: 'tenant_1',
    role: 'ATTORNEY'
  });
  authCookie = `next-auth.session-token=${token}`;
});

const authed = (extra: Record<string, string> = {}) => ({
  cookie: authCookie,
  ...extra
});

describe('Cases API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('rejects requests without a session token', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/cases' });
      expect(response.statusCode).toBe(401);
    });

    it('rejects garbage tokens', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/cases',
        headers: { cookie: 'next-auth.session-token=not-a-real-token' }
      });
      expect(response.statusCode).toBe(401);
    });

    it('ignores forged x-tenant-id / x-user-id headers — identity comes from the token', async () => {
      (prisma.case.findMany as any).mockResolvedValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/cases',
        headers: authed({ 'x-tenant-id': 'attacker_tenant', 'x-user-id': 'attacker' })
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant_1' })
        })
      );
    });
  });

  describe('POST /cases', () => {
    it('creates a case and always assigns the creator an ADMIN role in CaseAccess', async () => {
      (prisma.case.create as any).mockResolvedValue({ id: 'case_123', title: 'Test Case', tenantId: 'tenant_1' });

      const response = await fastify.inject({
        method: 'POST',
        url: '/cases',
        headers: authed(),
        payload: { title: 'Test Case', defendant: 'John Doe', jurisdiction: 'NY' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, caseId: 'case_123' });
      expect(prisma.case.create).toHaveBeenCalledWith({
        data: {
          title: 'Test Case',
          tenantId: 'tenant_1',
          accessList: {
            create: { userId: 'user_1', role: 'ADMIN' }
          }
        }
      });
    });
  });

  describe('GET /cases', () => {
    it('returns cases scoped to the token tenant and user', async () => {
      const mockCases = [{ id: 'case_1', title: 'Case 1' }];
      (prisma.case.findMany as any).mockResolvedValue(mockCases);

      const response = await fastify.inject({
        method: 'GET',
        url: '/cases',
        headers: authed()
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
    it('returns 401 without a session', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        payload: { title: 'New Title' }
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 if the user lacks case ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'VIEWER' });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        headers: authed(),
        payload: { title: 'New Title' }
      });

      expect(response.statusCode).toBe(403);
    });

    it('updates the case if the user is case ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ADMIN' });
      (prisma.case.update as any).mockResolvedValue({ id: '123', title: 'New Title' });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/cases/123',
        headers: authed(),
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
    it('returns 401 without a session', async () => {
      const response = await fastify.inject({ method: 'DELETE', url: '/cases/123' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 if the user lacks case ADMIN', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ATTORNEY' });

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123',
        headers: authed()
      });

      expect(response.statusCode).toBe(403);
    });

    it('cascade deletes case content but NEVER audit rows (append-only, retention §11a.2)', async () => {
      (prisma.caseAccess.findUnique as any).mockResolvedValue({ role: 'ADMIN' });
      (prisma.document.findMany as any).mockResolvedValue([{ id: 'doc_1' }]);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/cases/123',
        headers: authed()
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.documentChunk.deleteMany).toHaveBeenCalled();
      expect(prisma.document.deleteMany).toHaveBeenCalled();
      expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
      expect(prisma.caseAccess.deleteMany).toHaveBeenCalled();
      expect(prisma.case.delete).toHaveBeenCalledWith({ where: { id: '123' } });
    });
  });
});
