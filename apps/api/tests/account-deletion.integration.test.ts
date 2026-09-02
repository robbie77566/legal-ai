/**
 * Admin account deletion (2026-09-02): cases go through OPS-4 scoped
 * deletion, the payment ledger + disclosure acks survive by design, the
 * user row is anonymized (email FREED for reuse), live sessions die, and
 * staff accounts are untouchable through this path.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `acctdel_${Date.now()}`;
let tenantId: string;
let adminId: string;
let victimId: string;
let caseId: string;
let adminCookie: string;
const EMAIL = `${run}@x.com`;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } });
  adminId = admin.id;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
  const victim = await prisma.user.create({ data: { email: EMAIL, name: 'Victim', tenantId, role: 'CLIENT' } });
  victimId = victim.id;
  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL',
      accessList: { create: { userId: victimId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
  await prisma.document.create({ data: { filename: 'x.pdf', caseId } });
  await prisma.payment.create({
    data: {
      stripeId: `cs_test_${run}`, caseId, userId: victimId, tenantId,
      kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900,
    },
  });
  await fastify.ready();
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { tenantId } });
  // caseEvent rows stay — the append-only trigger refuses DELETE, correctly.
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('GET /ops/accounts', () => {
  it('lists customer accounts without a search term, and filters with one', async () => {
    const all = await fastify.inject({ method: 'GET', url: '/ops/accounts', headers: { cookie: adminCookie } });
    expect(all.statusCode).toBe(200);
    expect(all.json().some((a: { email: string }) => a.email === EMAIL)).toBe(true);
    const filtered = await fastify.inject({ method: 'GET', url: `/ops/accounts?q=${run}`, headers: { cookie: adminCookie } });
    expect(filtered.json().map((a: { email: string }) => a.email)).toEqual([EMAIL]);
    const none = await fastify.inject({ method: 'GET', url: '/ops/accounts?q=zzz-no-such-account', headers: { cookie: adminCookie } });
    expect(none.json()).toEqual([]);
  });
});

describe('POST /ops/accounts/:id/delete', () => {
  it('refuses a mismatched confirmation email', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/accounts/${victimId}/delete`,
      headers: { cookie: adminCookie }, payload: { confirmEmail: 'wrong@x.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deletes cases, retains the ledger, anonymizes the user, and frees the email', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/accounts/${victimId}/delete`,
      headers: { cookie: adminCookie }, payload: { confirmEmail: EMAIL },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.originalEmail).toBe(EMAIL);
    expect(body.casesDeleted).toContain(caseId);

    // Case content is gone
    expect(await prisma.case.findUnique({ where: { id: caseId } })).toBeNull();
    expect(await prisma.document.count({ where: { caseId } })).toBe(0);

    // The ledger survives by design
    const pay = await prisma.payment.findUnique({ where: { stripeId: `cs_test_${run}` } });
    expect(pay?.amountCents).toBe(29900);

    // Deletion certificates in the surviving event stream
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'deletion.completed' } })).toBe(1);

    // Anonymized: PII gone, sessions dead, email freed
    const u = await prisma.user.findUniqueOrThrow({ where: { id: victimId } });
    expect(u.email).toBe(`deleted.${victimId}@invalid.snotnoselegal.com`);
    expect(u.name).toBeNull();
    expect(u.deletedAt).not.toBeNull();
    expect(u.passwordChangedAt).not.toBeNull();
    const reuse = await prisma.user.create({ data: { email: EMAIL, tenantId, role: 'CLIENT' } });
    expect(reuse.email).toBe(EMAIL); // unique constraint no longer blocks
  });

  it('is idempotent-safe: a second attempt reports already deleted', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/accounts/${victimId}/delete`,
      headers: { cookie: adminCookie },
      payload: { confirmEmail: `deleted.${victimId}@invalid.snotnoselegal.com` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('staff accounts are untouchable through this path', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/accounts/${adminId}/delete`,
      headers: { cookie: adminCookie }, payload: { confirmEmail: `${run}_admin@x.com` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Staff/);
  });

  it('non-admin callers are rejected by the role gate', async () => {
    const clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: victimId, tenantId, role: 'CLIENT' })}`;
    const res = await fastify.inject({
      method: 'POST', url: `/ops/accounts/${victimId}/delete`,
      headers: { cookie: clientCookie }, payload: { confirmEmail: EMAIL },
    });
    expect(res.statusCode).toBe(403);
  });
});
