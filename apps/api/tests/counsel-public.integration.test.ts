/**
 * Workstream F (persona_rollout_plan.md §5 F) — the anonymous half of the
 * professional surfaces: GET /counsel/signup answers whether sign-ups are
 * open (the GLOBAL counsel_surfaces flag) and POST /counsel/pilot-interest
 * emails every admin and audits without a row of its own. Live Postgres,
 * capture email provider.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setFlag, __invalidateFlagCache } from '@hg/database/flags';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `cpub_${Date.now()}`;
const sent: EmailMessage[] = [];
let tenantId: string;
let adminEmails: string[];

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  adminEmails = [`${run}_admin1@x.com`, `${run}_admin2@x.com`];
  for (const email of adminEmails) await prisma.user.create({ data: { email, tenantId, role: 'ADMIN', accountKind: 'STAFF' } });
  await setFlag('counsel_surfaces', false, 'test');
  __invalidateFlagCache();
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await setFlag('counsel_surfaces', false, 'test');
  __invalidateFlagCache();
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('GET /counsel/signup — are sign-ups open?', () => {
  it('is public and follows the GLOBAL counsel_surfaces flag', async () => {
    const dark = await fastify.inject({ method: 'GET', url: '/counsel/signup' });
    expect(dark.statusCode).toBe(200);
    expect(dark.json()).toEqual({ open: false });

    await setFlag('counsel_surfaces', true, 'test');
    __invalidateFlagCache();
    const lit = await fastify.inject({ method: 'GET', url: '/counsel/signup' });
    expect(lit.json()).toEqual({ open: true });
    await setFlag('counsel_surfaces', false, 'test');
    __invalidateFlagCache();
  });
});

describe('POST /counsel/pilot-interest — the PD pilot form', () => {
  it('emails every admin in the house voice and writes one audit row without the sender\'s details', async () => {
    const started = new Date();
    const res = await fastify.inject({
      method: 'POST', url: '/counsel/pilot-interest',
      payload: { office: 'Bexar County Public Defender', county: 'Bexar', name: 'Maria Lopez', email: 'Maria@Example.com', note: 'Two appellate attorneys, about 40 appeals a year.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const ours = sent.filter((m) => adminEmails.includes(m.to));
    expect(ours.map((m) => m.to).sort()).toEqual([...adminEmails].sort());
    for (const m of ours) {
      expect(m.subject).toBe('Pilot interest — Bexar County Public Defender (Bexar County)');
      expect(m.text).toContain('15 records, 90 days, free');
      expect(m.text).toContain('maria@example.com');
      expect(m.text).toContain('Two appellate attorneys');
      expect(m.text).toContain('/ops/accounts');
    }

    // The row sits under the staff tenant of the oldest admin on this database (shared by every suite), so find it by key and time.
    const rows = await prisma.auditLog.findMany({ where: { action: 'PILOT_INTEREST', caseId: 'pilot-interest:bexar-county-public-defender', createdAt: { gte: started } } });
    expect(rows).toHaveLength(1);
    const details = rows[0].details as Record<string, unknown>;
    expect(details).toMatchObject({ office: 'Bexar County Public Defender', county: 'Bexar', hasNote: true });
    expect(details.admins).toBeGreaterThanOrEqual(2);
    expect(details.delivered).toBe(details.admins);
    expect(JSON.stringify(details)).not.toContain('Maria');
    expect(JSON.stringify(details)).not.toContain('example.com');
    expect(rows[0].userId).toBe('anonymous');
  });

  it('refuses a form without an office, county, name or valid email (400 with the field)', async () => {
    const res = await fastify.inject({ method: 'POST', url: '/counsel/pilot-interest', payload: { office: 'X', county: 'Y', name: 'Z', email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('email');
    expect(sent.filter((m) => adminEmails.includes(m.to))).toHaveLength(0);
  });
});
