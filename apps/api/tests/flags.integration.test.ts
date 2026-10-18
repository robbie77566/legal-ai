/** Feature flags (persona_rollout_plan.md §5 J; staff_console.md §10):
 *  J1 a flip is live without a deploy, J2 override precedence, J3 who may
 *  read and write, J4 one audit row per write. Live Postgres. */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { __invalidateFlagCache, FLAG_KEYS, FLAG_CACHE_TTL_MS } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { registerAuth } from '../src/plugins/auth';
import { requireFlag } from '../src/plugins/flags';

const run = `flags_${Date.now()}`;
let tenantA: string;
let tenantB: string;
let adminId: string;
let adminCookie: string;
let supportCookie: string;
let clientCookie: string;
let clientBCookie: string;

const json = { 'content-type': 'application/json' };

/** A route behind requireFlag, on its own app so nothing in src/index.ts has to change. */
const dark = Fastify();
registerAuth(dark);
dark.get('/counsel/dark', { preHandler: requireFlag('counsel_surfaces') }, async () => ({ ok: true }));

const resetFlags = async () => {
  await prisma.featureFlagOverride.deleteMany({ where: { tenantId: { in: [tenantA, tenantB].filter(Boolean) } } });
  await prisma.featureFlag.updateMany({ data: { enabled: false, updatedBy: null } });
  __invalidateFlagCache();
};

beforeAll(async () => {
  const a = await prisma.tenant.create({ data: { name: `${run}_A` } });
  const b = await prisma.tenant.create({ data: { name: `${run}_B` } });
  tenantA = a.id;
  tenantB = b.id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId: tenantA, role: 'ADMIN' } });
  const support = await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId: tenantA, role: 'SUPPORT' } });
  const client = await prisma.user.create({ data: { email: `${run}_client@x.com`, tenantId: tenantA, role: 'CLIENT' } });
  const clientB = await prisma.user.create({ data: { email: `${run}_clientb@x.com`, tenantId: tenantB, role: 'CLIENT' } });
  adminId = admin.id;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId: tenantA, role: 'ADMIN' })}`;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId: tenantA, role: 'SUPPORT' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: client.id, tenantId: tenantA, role: 'CLIENT' })}`;
  clientBCookie = `next-auth.session-token=${await encodeSessionToken({ userId: clientB.id, tenantId: tenantB, role: 'CLIENT' })}`;
  await resetFlags();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetFlags();
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await dark.close();
  await prisma.$disconnect();
});

const flagsFor = async (cookie: string) => {
  const res = await fastify.inject({ method: 'GET', url: '/flags', headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res.json() as Record<string, boolean>;
};

describe('J1 — a flip is live without a deploy', () => {
  it('migration seeds the six keys dark; /flags is the effective map for the caller', async () => {
    const map = await flagsFor(clientCookie);
    expect(Object.keys(map).sort()).toEqual([...FLAG_KEYS].sort());
    expect(Object.values(map).every((v) => v === false)).toBe(true);
  });

  it('PUT /ops/flags/counsel_surfaces as ADMIN → true after cache invalidation; the dark route goes 404 → 200', async () => {
    const before = await dark.inject({ method: 'GET', url: '/counsel/dark', headers: { cookie: clientCookie } });
    expect(before.statusCode).toBe(404);
    expect(before.json()).toEqual({ error: 'Not available' });

    const flip = await fastify.inject({ method: 'PUT', url: '/ops/flags/counsel_surfaces', headers: { cookie: adminCookie, ...json }, payload: { enabled: true } });
    expect(flip.statusCode).toBe(200);
    expect(flip.json()).toMatchObject({ key: 'counsel_surfaces', tenantId: null, before: false, after: true });

    __invalidateFlagCache();
    expect((await flagsFor(clientCookie)).counsel_surfaces).toBe(true);
    const after = await dark.inject({ method: 'GET', url: '/counsel/dark', headers: { cookie: clientCookie } });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual({ ok: true });
  });

  it('…and without invalidation the TTL alone carries the flip: stale for < 15 s, fresh after', async () => {
    // Warm the cache with the current (on) value, then flip the row underneath
    // it the way another instance would — no cache call on this instance.
    __invalidateFlagCache();
    expect((await flagsFor(clientCookie)).counsel_surfaces).toBe(true);
    await prisma.featureFlag.update({ where: { key: 'counsel_surfaces' }, data: { enabled: false } });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + FLAG_CACHE_TTL_MS - 1_000);
    expect((await flagsFor(clientCookie)).counsel_surfaces).toBe(true); // still cached
    expect((await dark.inject({ method: 'GET', url: '/counsel/dark', headers: { cookie: clientCookie } })).statusCode).toBe(200);

    vi.setSystemTime(Date.now() + 2_000); // past the TTL
    expect((await flagsFor(clientCookie)).counsel_surfaces).toBe(false);
    expect((await dark.inject({ method: 'GET', url: '/counsel/dark', headers: { cookie: clientCookie } })).statusCode).toBe(404);
  });

  it('an unauthenticated caller gets 401 from /flags and from the dark route alike', async () => {
    expect((await fastify.inject({ method: 'GET', url: '/flags' })).statusCode).toBe(401);
    expect((await dark.inject({ method: 'GET', url: '/counsel/dark' })).statusCode).toBe(401);
  });
});

describe('J2 — override precedence', () => {
  it('global off + override on → on for that tenant only', async () => {
    await resetFlags();
    const res = await fastify.inject({ method: 'PUT', url: `/ops/flags/offices/overrides/${tenantB}`, headers: { cookie: adminCookie, ...json }, payload: { enabled: true, note: 'founder test org' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ key: 'offices', tenantId: tenantB, before: null, after: true });
    expect((await flagsFor(clientBCookie)).offices).toBe(true);
    expect((await flagsFor(clientCookie)).offices).toBe(false);
  });

  it('global on + override off → off for that tenant only', async () => {
    await resetFlags();
    await fastify.inject({ method: 'PUT', url: '/ops/flags/offices', headers: { cookie: adminCookie, ...json }, payload: { enabled: true } });
    await fastify.inject({ method: 'PUT', url: `/ops/flags/offices/overrides/${tenantB}`, headers: { cookie: adminCookie, ...json }, payload: { enabled: false } });
    expect((await flagsFor(clientBCookie)).offices).toBe(false);
    expect((await flagsFor(clientCookie)).offices).toBe(true);
  });

  it('clearing the override restores the global value', async () => {
    const del = await fastify.inject({ method: 'DELETE', url: `/ops/flags/offices/overrides/${tenantB}`, headers: { cookie: adminCookie } });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ key: 'offices', tenantId: tenantB, before: false, after: null });
    expect((await flagsFor(clientBCookie)).offices).toBe(true);
    // Nothing left to clear.
    expect((await fastify.inject({ method: 'DELETE', url: `/ops/flags/offices/overrides/${tenantB}`, headers: { cookie: adminCookie } })).statusCode).toBe(404);
  });

  it('GET /ops/flags lists every key with its description and override list', async () => {
    await resetFlags();
    await fastify.inject({ method: 'PUT', url: `/ops/flags/clinic_inbox/overrides/${tenantB}`, headers: { cookie: adminCookie, ...json }, payload: { enabled: true, note: 'first clinic' } });
    const res = await fastify.inject({ method: 'GET', url: '/ops/flags', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ key: string; enabled: boolean; description: string; overrides: Array<{ tenantId: string; enabled: boolean; note: string | null }> }>;
    expect(rows.map((r) => r.key)).toEqual([...FLAG_KEYS]);
    for (const r of rows) expect(r.description.length).toBeGreaterThan(10);
    const clinic = rows.find((r) => r.key === 'clinic_inbox')!;
    expect(clinic.enabled).toBe(false);
    expect(clinic.overrides).toEqual([expect.objectContaining({ tenantId: tenantB, enabled: true, note: 'first clinic' })]);
  });
});

describe('J3 — who may read and write', () => {
  it('SUPPORT reads the table but every write is the 403 sentence', async () => {
    expect((await fastify.inject({ method: 'GET', url: '/ops/flags', headers: { cookie: supportCookie } })).statusCode).toBe(200);
    const writes = [
      fastify.inject({ method: 'PUT', url: '/ops/flags/counsel_surfaces', headers: { cookie: supportCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'PUT', url: `/ops/flags/counsel_surfaces/overrides/${tenantA}`, headers: { cookie: supportCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'DELETE', url: `/ops/flags/counsel_surfaces/overrides/${tenantA}`, headers: { cookie: supportCookie } }),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/need an Ops administrator/);
    }
    __invalidateFlagCache();
    expect((await flagsFor(clientCookie)).counsel_surfaces).toBe(false);
  });

  it('CLIENT is kept off every /ops/flags* door', async () => {
    const calls = [
      fastify.inject({ method: 'GET', url: '/ops/flags', headers: { cookie: clientCookie } }),
      fastify.inject({ method: 'PUT', url: '/ops/flags/counsel_surfaces', headers: { cookie: clientCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'PUT', url: `/ops/flags/counsel_surfaces/overrides/${tenantA}`, headers: { cookie: clientCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'DELETE', url: `/ops/flags/counsel_surfaces/overrides/${tenantA}`, headers: { cookie: clientCookie } }),
    ];
    for (const res of await Promise.all(calls)) expect([403, 404]).toContain(res.statusCode);
  });

  it('an unknown key is refused with 400 on every write and never reaches the table', async () => {
    const calls = [
      fastify.inject({ method: 'PUT', url: '/ops/flags/not_a_flag', headers: { cookie: adminCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'PUT', url: `/ops/flags/not_a_flag/overrides/${tenantA}`, headers: { cookie: adminCookie, ...json }, payload: { enabled: true } }),
      fastify.inject({ method: 'DELETE', url: `/ops/flags/not_a_flag/overrides/${tenantA}`, headers: { cookie: adminCookie } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'Unknown feature flag' });
    }
    expect(await prisma.featureFlag.count()).toBe(FLAG_KEYS.length);
    // A malformed body is a 400 too, not a 500.
    const bad = await fastify.inject({ method: 'PUT', url: '/ops/flags/counsel_surfaces', headers: { cookie: adminCookie, ...json }, payload: { enabled: 'yes' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('J4 — one audit row per write, with before and after', () => {
  const auditRows = (key: string) =>
    prisma.auditLog.findMany({ where: { caseId: `flag:${key}`, userId: adminId, action: 'FLAG_CHANGE' }, orderBy: { createdAt: 'asc' } });

  it('global flip, override set, override cleared → three rows that tell the story', async () => {
    await resetFlags();
    const start = await auditRows('record_desk');
    await fastify.inject({ method: 'PUT', url: '/ops/flags/record_desk', headers: { cookie: adminCookie, ...json }, payload: { enabled: true } });
    await fastify.inject({ method: 'PUT', url: `/ops/flags/record_desk/overrides/${tenantB}`, headers: { cookie: adminCookie, ...json }, payload: { enabled: false, note: 'hold Bexar back' } });
    await fastify.inject({ method: 'DELETE', url: `/ops/flags/record_desk/overrides/${tenantB}`, headers: { cookie: adminCookie } });
    const rows = (await auditRows('record_desk')).slice(start.length);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.details)).toEqual([
      expect.objectContaining({ key: 'record_desk', scope: 'global', tenantId: null, before: false, after: true }),
      expect.objectContaining({ key: 'record_desk', scope: 'override', tenantId: tenantB, before: null, after: false, note: 'hold Bexar back' }),
      expect.objectContaining({ key: 'record_desk', scope: 'override', tenantId: tenantB, before: false, after: null }),
    ]);
    for (const r of rows) expect(r.tenantId).toBe(tenantA); // the admin's tenant scopes the row (RLS)
  });

  it('a refused write (SUPPORT, unknown key) leaves no row', async () => {
    const start = await prisma.auditLog.count({ where: { action: 'FLAG_CHANGE', caseId: { startsWith: 'flag:' } } });
    await fastify.inject({ method: 'PUT', url: '/ops/flags/long_records', headers: { cookie: supportCookie, ...json }, payload: { enabled: true } });
    await fastify.inject({ method: 'PUT', url: '/ops/flags/nope', headers: { cookie: adminCookie, ...json }, payload: { enabled: true } });
    expect(await prisma.auditLog.count({ where: { action: 'FLAG_CHANGE', caseId: { startsWith: 'flag:' } } })).toBe(start);
  });
});
