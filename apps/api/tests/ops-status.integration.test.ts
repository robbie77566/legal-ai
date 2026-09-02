/**
 * GET /ops/status (ops_console_redesign.md J2): presence-only system health
 * for the ops overview — never a secret value, Stripe mode from the key
 * prefix, pipeline counts from one groupBy. ADMIN-gated like every /ops route.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `opsstatus_${Date.now()}`;
let tenantId: string;
let adminCookie: string;
let clientCookie: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } });
  const client = await prisma.user.create({ data: { email: `${run}_client@x.com`, tenantId, role: 'CLIENT' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId, role: 'ADMIN' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: client.id, tenantId, role: 'CLIENT' })}`;
  await fastify.ready();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('GET /ops/status', () => {
  it('reports presence flags, stripe mode, and pipeline counts — and never a secret', async () => {
    const prevStripe = process.env.STRIPE_SECRET_KEY;
    const prevResend = process.env.RESEND_API_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
    delete process.env.RESEND_API_KEY;
    try {
      const res = await fastify.inject({ method: 'GET', url: '/ops/status', headers: { cookie: adminCookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stripe).toBe('test');
      expect(body.email).toEqual({ configured: false, from: null });
      expect(typeof body.autoApprove).toBe('boolean');
      expect(body.pipeline).toEqual(
        expect.objectContaining({ awaitingDocs: expect.any(Number), held: expect.any(Number), ready: expect.any(Number) })
      );
      expect(typeof body.retentionCandidates).toBe('number');
      expect(JSON.stringify(body)).not.toContain('sk_test_abc123'); // presence, never the value
    } finally {
      if (prevStripe !== undefined) process.env.STRIPE_SECRET_KEY = prevStripe; else delete process.env.STRIPE_SECRET_KEY;
      if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
    }
  });

  it('derives live mode from the key prefix and reports a configured email transport', async () => {
    const prevStripe = process.env.STRIPE_SECRET_KEY;
    const prevResend = process.env.RESEND_API_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_live_zzz';
    process.env.RESEND_API_KEY = 're_test';
    try {
      const body = (await fastify.inject({ method: 'GET', url: '/ops/status', headers: { cookie: adminCookie } })).json();
      expect(body.stripe).toBe('live');
      expect(body.email.configured).toBe(true);
      expect(body.email.from).toMatch(/snotnoselegal\.com/);
    } finally {
      if (prevStripe !== undefined) process.env.STRIPE_SECRET_KEY = prevStripe; else delete process.env.STRIPE_SECRET_KEY;
      if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend; else delete process.env.RESEND_API_KEY;
    }
  });

  it('POST /ops/email-test returns the transport verdict — reason text when no key is loaded', async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const { __setEmailProviderForTests } = await import('@hg/email');
      __setEmailProviderForTests(undefined); // rebuild the provider from the (now absent) key
      const res = await fastify.inject({ method: 'POST', url: '/ops/email-test', headers: { cookie: adminCookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.to).toBe(`${run}_admin@x.com`);
      expect(body.delivered).toBe(false);
      expect(body.error).toMatch(/RESEND_API_KEY is not set/);
      __setEmailProviderForTests(undefined);
    } finally {
      if (prev !== undefined) process.env.RESEND_API_KEY = prev;
    }
  });

  it('is ADMIN-only', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/ops/status', headers: { cookie: clientCookie } });
    expect(res.statusCode).toBe(403);
  });
});
