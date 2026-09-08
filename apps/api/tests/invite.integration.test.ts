/**
 * Staff invites (auth design §4.6) — live Postgres, capture email provider.
 * Creating a user sends the invite; the link sets the first password; the
 * token is single-use and rotates on resend; nothing signs in before that.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `inv_${Date.now()}`;
let tenantId: string;
let adminId: string;
let adminCookie: string;
const sent: EmailMessage[] = [];
const linkIn = (msg: EmailMessage) => {
  const m = msg.text.match(/\/auth\/setup-password\?token=([0-9a-f]+)&id=(\S+)/);
  if (!m) throw new Error('no setup link in email');
  return { token: m[1], id: m[2] };
};

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@x.com`, name: 'Robbie', tenantId, role: 'ADMIN', passwordHash: await bcrypt.hash('AdminPassword99!', 12) } })).id;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  __setEmailProviderForTests(undefined);
  // AuditLog rows are append-only by trigger and stay behind by design.
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('creating a staff account', () => {
  let newId: string;
  let firstToken: string;

  it('sends an invite that explains how to sign in, and the account cannot sign in yet', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/permissions/users', headers: { cookie: adminCookie },
      payload: { email: `${run}_dana@x.com`, name: 'Dana', role: 'SUPPORT' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().invite).toMatchObject({ delivered: true });
    newId = res.json().user.id;

    expect(sent).toHaveLength(1);
    const msg = sent[0];
    expect(msg.to).toBe(`${run}_dana@x.com`);
    expect(msg.subject).toMatch(/added to the Family Case Review console/);
    expect(msg.text).toMatch(/Robbie added you .* as a support team member/);
    expect(msg.text).toMatch(/Set your password/);
    expect(msg.text).toMatch(/sign in with this email address at:\s+\S+\/auth\/signin/);
    expect(msg.text).toMatch(/every case file/); // what a Support person will see
    const { token, id } = linkIn(msg);
    expect(id).toBe(newId);
    firstToken = token;

    const u = await prisma.user.findUniqueOrThrow({ where: { id: newId } });
    expect(u.passwordHash).toBeNull();
    expect(u.inviteToken).not.toBeNull();
    expect(u.inviteExpires!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const list = await fastify.inject({ method: 'GET', url: '/permissions/users', headers: { cookie: adminCookie } });
    expect(list.json().find((x: { id: string }) => x.id === newId)).toMatchObject({ active: false, invitePending: true });
  });

  it('resending rotates the token so the old link stops working', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/permissions/users/${newId}/invite`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    const { token } = linkIn(sent[0]);
    expect(token).not.toBe(firstToken);

    const stale = await fastify.inject({ method: 'POST', url: '/auth/setup', payload: { userId: newId, token: firstToken, password: 'FirstPassword99!' } });
    expect(stale.statusCode).toBe(400);
    firstToken = token;
  });

  it('the link sets the first password (anonymously), is single-use, and sign-in then works', async () => {
    const ok = await fastify.inject({ method: 'POST', url: '/auth/setup', payload: { userId: newId, token: firstToken, password: 'FirstPassword99!' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().email).toBe(`${run}_dana@x.com`);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: newId } });
    expect(u.inviteToken).toBeNull();
    expect(await bcrypt.compare('FirstPassword99!', u.passwordHash!)).toBe(true);

    const again = await fastify.inject({ method: 'POST', url: '/auth/setup', payload: { userId: newId, token: firstToken, password: 'Another99!Pass' } });
    expect(again.statusCode).toBe(400);

    // Now they have a password: resend is refused and points at forgot-password.
    const resend = await fastify.inject({ method: 'POST', url: `/permissions/users/${newId}/invite`, headers: { cookie: adminCookie } });
    expect(resend.statusCode).toBe(409);
    const list = await fastify.inject({ method: 'GET', url: '/permissions/users', headers: { cookie: adminCookie } });
    expect(list.json().find((x: { id: string }) => x.id === newId)).toMatchObject({ active: true, invitePending: false });
  });

  it('when email cannot be delivered, the admin gets the link to hand over', async () => {
    __setEmailProviderForTests({ send: async () => ({ delivered: false, error: 'RESEND_API_KEY not set' }) });
    const res = await fastify.inject({
      method: 'POST', url: '/permissions/users', headers: { cookie: adminCookie },
      payload: { email: `${run}_sam@x.com`, role: 'SUPPORT' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().invite).toMatchObject({ delivered: false, error: 'RESEND_API_KEY not set' });
    expect(res.json().invite.setupUrl).toMatch(/\/auth\/setup-password\?token=[0-9a-f]{64}&id=/);
    __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  });
});
