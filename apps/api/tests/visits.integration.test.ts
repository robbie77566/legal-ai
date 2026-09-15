/**
 * Accounts-page activity — live Postgres. Beats within the gap fold into one
 * visit; a beat after the gap starts another; the admin list rolls them up;
 * a successful credential sign-in stamps lastLoginAt; deletion removes it all.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken, authOptions } from '@hg/auth';
import { VISIT_GAP_MS } from '../src/services/visits.service';

const run = `visits_${Date.now()}`;
let tenantId: string; let userId: string; let adminId: string; let cookie: string; let adminCookie: string;
const password = 'CorrectHorse99!';

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({
    data: { email: `${run}@x.com`, name: 'Maria Delgado', tenantId, role: 'CLIENT', passwordHash: await bcrypt.hash(password, 12) },
  })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
});
afterAll(async () => {
  await prisma.userVisit.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
});

const beat = (pageview: boolean, c = cookie) =>
  fastify.inject({ method: 'POST', url: '/me/visit', headers: { cookie: c }, payload: { pageview } });

describe('visit heartbeat', () => {
  it('folds beats inside the gap into one visit and counts page views', async () => {
    const a = await beat(true); expect(a.statusCode).toBe(200); expect(a.json().started).toBe(true);
    const b = await beat(true); expect(b.json().started).toBe(false);
    const c = await beat(false); expect(c.json().started).toBe(false);
    const visits = await prisma.userVisit.findMany({ where: { userId } });
    expect(visits).toHaveLength(1);
    expect(visits[0].pageViews).toBe(2);
    expect(visits[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(visits[0].startedAt.getTime());
  });
  it('a beat after the gap starts a new visit', async () => {
    const [v] = await prisma.userVisit.findMany({ where: { userId } });
    const ago = new Date(Date.now() - VISIT_GAP_MS - 60_000);
    await prisma.userVisit.update({ where: { id: v.id }, data: { startedAt: new Date(ago.getTime() - 300_000), lastSeenAt: ago } });
    const d = await beat(true); expect(d.json().started).toBe(true);
    expect(await prisma.userVisit.count({ where: { userId } })).toBe(2);
  });
  it('refuses a visitor with no session', async () => {
    const r = await fastify.inject({ method: 'POST', url: '/me/visit', payload: { pageview: true } });
    expect(r.statusCode).toBe(401);
  });
});

describe('sign-in stamps the account', () => {
  it('authorize() records lastLoginAt and increments loginCount', async () => {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { lastLoginAt: true, loginCount: true } });
    expect(before?.lastLoginAt).toBeNull();
    const provider = authOptions.providers[0] as unknown as { authorize?: (c: Record<string, string>) => Promise<unknown>; options?: { authorize: (c: Record<string, string>) => Promise<unknown> } };
    const authorize = provider.options?.authorize ?? provider.authorize!;
    const result = await authorize({ email: `${run}@x.com`, password });
    expect(result).toBeTruthy();
    const after = await prisma.user.findUnique({ where: { id: userId }, select: { lastLoginAt: true, loginCount: true } });
    expect(after?.lastLoginAt).toBeInstanceOf(Date);
    expect(after?.loginCount).toBe(1);
  });
  it('a wrong password stamps nothing', async () => {
    const provider = authOptions.providers[0] as unknown as { authorize?: (c: Record<string, string>) => Promise<unknown>; options?: { authorize: (c: Record<string, string>) => Promise<unknown> } };
    const authorize = provider.options?.authorize ?? provider.authorize!;
    expect(await authorize({ email: `${run}@x.com`, password: 'nope-nope-nope-1' })).toBeNull();
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { loginCount: true } });
    expect(u?.loginCount).toBe(1);
  });
});

describe('the admin list', () => {
  it('rolls visits up per account: count, average length, last seen, last sign-in', async () => {
    const r = await fastify.inject({ method: 'GET', url: `/ops/accounts?q=${run}@x.com`, headers: { cookie: adminCookie } });
    expect(r.statusCode).toBe(200);
    const row = r.json().find((a: { id: string }) => a.id === userId);
    expect(row.visits).toBe(2);
    expect(typeof row.avgSecondsOnSite).toBe('number');
    expect(row.avgSecondsOnSite).toBeGreaterThanOrEqual(0);
    expect(row.lastSeenAt).toBeTruthy();
    expect(row.lastLoginAt).toBeTruthy();
    expect(row.loginCount).toBe(1);
  });
});
