/**
 * Global error handler (2026-09-03): a ZodError is a 400 with a readable
 * message, not an unhandled 500 that pages Sentry. Found via 37 escalating
 * Sentry events from password-rule typos on /buy/account.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `errh_${Date.now()}`;
let tenantId: string;
let cookie: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId: u.id, tenantId, role: 'CLIENT' })}`;
  await fastify.ready();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('global error handler', () => {
  it('a bad password on /buy/account is a 400 with the rule, not a 500', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/buy/account',
      payload: { email: 'x@y.com', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/12 character/);
    expect(res.json().field).toBe('password');
  });

  it('a wrong disclosureSetVersion is a 400, not a 500', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/buy/disclosure-ack',
      headers: { cookie }, payload: { disclosureSetVersion: '2020-01-01.0' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid literal|expected/i);
  });
});
