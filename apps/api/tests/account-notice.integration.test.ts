/**
 * Admin notice on account creation (2026-11-17): a professional signing up
 * on the counsel page emails the operator address with the account summary
 * and the console link. The family path is asserted in
 * checkout.integration.test.ts and the invitation path in
 * org-seats.integration.test.ts. Live Postgres.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';
import { ADMIN_NOTICE_TO } from '../src/services/account-notice.service';

const run = `acctnotice_${Date.now()}`;
const sent: EmailMessage[] = [];

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  const users = await prisma.user.findMany({ where: { email: { startsWith: run } }, select: { id: true, tenantId: true } });
  for (const u of users) {
    await prisma.membership.deleteMany({ where: { userId: u.id } });
    await prisma.organisation.deleteMany({ where: { tenantId: u.tenantId } });
    await prisma.user.delete({ where: { id: u.id } });
    await prisma.tenant.delete({ where: { id: u.tenantId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('new-account notice to the admin address', () => {
  it('the recipient is the operator address from brand.ts', () => {
    expect(ADMIN_NOTICE_TO).toBe('admin@snotnoselegal.com');
  });

  it('a counsel signup sends one notice with name, email, kind, organisation and the console link', async () => {
    const email = `${run}_pd@example.com`;
    const res = await fastify.inject({
      method: 'POST', url: '/counsel/signup',
      payload: { email, password: 'CorrectHorse9Battery!', name: 'Dana Reyes', barNumber: '24099001', practiceType: 'appellate', organisationKind: 'PD_OFFICE', organisationName: `${run} Travis PD` },
    });
    expect(res.statusCode).toBe(200);
    const { userId } = res.json() as { userId: string };

    await new Promise((r) => setTimeout(r, 50));
    const notices = sent.filter((m) => m.subject.startsWith('New account'));
    expect(notices).toHaveLength(1);
    expect(notices[0].to).toBe('admin@snotnoselegal.com');
    expect(notices[0].subject).toBe('New account: Dana Reyes (professional)');
    expect(notices[0].text).toContain(`Email: ${email}`);
    expect(notices[0].text).toMatch(/Professional account — signed up on the counsel page as a pd office/);
    expect(notices[0].text).toContain(`Organisation: ${run} Travis PD`);
    expect(notices[0].text).toContain(`/ops/accounts/${userId}`);
    // The bar number never travels in email.
    expect(notices[0].text).not.toContain('24099001');
  });

  it('an existing address gets the enumeration-safe answer and no notice', async () => {
    sent.length = 0;
    const res = await fastify.inject({
      method: 'POST', url: '/counsel/signup',
      payload: { email: `${run}_pd@example.com`, password: 'CorrectHorse9Battery!', name: 'Dana Again', barNumber: '24099002', practiceType: 'appellate' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.filter((m) => m.subject.startsWith('New account'))).toHaveLength(0);
  });
});
