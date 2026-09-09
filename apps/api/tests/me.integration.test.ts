/**
 * The family's account (your_account spec) — live Postgres. One read model,
 * four writes, and the two things that must never happen: a family changing
 * their email without the new address confirming, and deleting an account
 * while a review is mid-pipeline.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';
process.env.WEB_ORIGIN = 'http://web.test';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Export-cap test (review 2026-09-09): S3 is not in the loop — sizes and
// bytes come from here; everything else in storage.service stays real.
const storageMock = vi.hoisted(() => ({ bytes: 1024 }));
vi.mock('../src/services/storage.service', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getObjectSize: async () => storageMock.bytes,
  getObjectBytes: async () => Buffer.from('%PDF-1.4 test'),
}));
import bcrypt from 'bcryptjs';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `me_${Date.now()}`;
let tenantId: string;
let userId: string;
let adminId: string;
let caseId: string;
let cookie: string;
let adminCookie: string;
const sent: EmailMessage[] = [];

const get = (url: string, c = cookie) => fastify.inject({ method: 'GET', url, headers: { cookie: c } });
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: Record<string, unknown> = {}, c = cookie) =>
  fastify.inject({ method, url, headers: { cookie: c }, payload });

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({
    data: { email: `${run}@x.com`, name: 'Jo Whitfield', tenantId, role: 'CLIENT', passwordHash: await bcrypt.hash('OldPassword99!', 12) },
  })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
  caseId = (await prisma.case.create({
    data: {
      title: `${run} record`, tenantId, status: 'READY', lane: 'TRIAL', county: 'Travis', convictionYear: 2019,
      facts: { trialOrPlea: 'trial', appeal: 'decided', priorWrit: 'no' },
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  })).id;
  await prisma.document.create({ data: { filename: 'RR_Vol1.pdf', caseId, s3Key: `cases/${caseId}/rr1.pdf` } });
  await prisma.payment.create({ data: { stripeId: `cs_${run}`, kind: 'REVIEW', amountCents: 29900, status: 'SUCCEEDED', userId, caseId, tenantId } });
  await prisma.disclosureAck.create({ data: { userId, tenantId, disclosureSetVersion: 'v3', ip: '127.0.0.1', userAgent: 'test' } });
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await prisma.staffRequest.deleteMany({ where: { tenantId } });
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});
beforeEach(() => { sent.length = 0; });

describe('GET /me', () => {
  it('returns the family, their review (with the facts line), payments, and acknowledgements', async () => {
    const r = await get('/me');
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.user).toMatchObject({ name: 'Jo Whitfield', email: `${run}@x.com`, pendingEmail: null });
    expect(d.reviews).toHaveLength(1);
    expect(d.reviews[0]).toMatchObject({ id: caseId, title: 'Travis County · 2019', status: 'READY', documents: 1 });
    expect(d.reviews[0].factsLine).toMatch(/trial/i);
    expect(d.reviews[0].factsLine).toMatch(/decided/i);
    expect(d.payments[0]).toMatchObject({ kind: 'REVIEW', amountCents: 29900, free: false, caseTitle: 'Travis County · 2019' });
    expect(d.acks[0].version).toBe('v3');
    expect(d.deletionRequest).toBeNull();
  });

  it('is not for staff', async () => {
    // A staff account has no cases; the read model still answers only for itself.
    const r = await get('/me', adminCookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().reviews).toEqual([]);
  });
});

describe('name and password', () => {
  it('PATCH /me renames', async () => {
    expect((await send('PATCH', '/me', { name: '  Josephine Whitfield ' })).json()).toEqual({ ok: true, name: 'Josephine Whitfield' });
    expect((await prisma.user.findUnique({ where: { id: userId } }))!.name).toBe('Josephine Whitfield');
  });

  it('POST /me/password needs the current password and enforces the rules', async () => {
    expect((await send('POST', '/me/password', { currentPassword: 'wrong', newPassword: 'BrandNewPass1!x' })).statusCode).toBe(400);
    expect((await send('POST', '/me/password', { currentPassword: 'OldPassword99!', newPassword: 'short' })).statusCode).toBe(400);
    const ok = await send('POST', '/me/password', { currentPassword: 'OldPassword99!', newPassword: 'BrandNewPass1!x' });
    expect(ok.statusCode).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(await bcrypt.compare('BrandNewPass1!x', u!.passwordHash!)).toBe(true);
    expect(u!.passwordChangedAt).not.toBeNull();
  });
});

describe('email change (U5)', () => {
  it('holds the new address as pending, tells both addresses, and switches only on confirm', async () => {
    const newEmail = `${run}_new@x.com`;
    const bad = await send('POST', '/me/email', { newEmail, currentPassword: 'nope' });
    expect(bad.statusCode).toBe(400);
    const r = await send('POST', '/me/email', { newEmail, currentPassword: 'BrandNewPass1!x' });
    expect(r.statusCode).toBe(200);
    expect(r.json().pendingEmail).toBe(newEmail);

    const u1 = await prisma.user.findUnique({ where: { id: userId } });
    expect(u1!.email).toBe(`${run}@x.com`); // sign-in unchanged until confirmed
    expect(u1!.pendingEmail).toBe(newEmail);
    expect((await get('/me')).json().user.pendingEmail).toBe(newEmail);

    const confirm = sent.find((m) => m.to === newEmail)!;
    const notice = sent.find((m) => m.to === `${run}@x.com`)!;
    expect(confirm.subject).toMatch(/confirm/i);
    expect(notice.text).toContain(newEmail);
    const url = new URL(confirm.text.match(/http\S+/)![0]);
    expect(url.pathname).toBe('/account/confirm-email');
    const token = url.searchParams.get('token')!;

    // Wrong token: nothing happens. Right token, no session needed.
    expect((await fastify.inject({ method: 'POST', url: '/me/email/confirm', payload: { userId, token: 'nope' } })).statusCode).toBe(400);
    const done = await fastify.inject({ method: 'POST', url: '/me/email/confirm', payload: { userId, token } });
    expect(done.statusCode).toBe(200);
    const u2 = await prisma.user.findUnique({ where: { id: userId } });
    expect(u2!.email).toBe(newEmail);
    expect(u2!.pendingEmail).toBeNull();
    expect(u2!.emailChangeToken).toBeNull();
    // The link is single-use.
    expect((await fastify.inject({ method: 'POST', url: '/me/email/confirm', payload: { userId, token } })).statusCode).toBe(400);
  });

  it('refuses an address another account already uses, and lets the family cancel a pending change', async () => {
    expect((await send('POST', '/me/email', { newEmail: `${run}_admin@x.com`, currentPassword: 'BrandNewPass1!x' })).statusCode).toBe(409);
    await send('POST', '/me/email', { newEmail: `${run}_third@x.com`, currentPassword: 'BrandNewPass1!x' });
    expect((await get('/me')).json().user.pendingEmail).toBe(`${run}_third@x.com`);
    expect((await send('DELETE', '/me/email/pending')).statusCode).toBe(200);
    expect((await get('/me')).json().user.pendingEmail).toBeNull();
  });
});

describe('deletion request (§8)', () => {
  it('is refused while a review is mid-pipeline', async () => {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'ANALYZING' } });
    const r = await send('POST', '/me/delete-request');
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/still running/);
    await prisma.case.update({ where: { id: caseId }, data: { status: 'READY' } });
  });

  it('opens an ACCOUNT_DELETE request an Admin sees in the queue, tells the admins, and is idempotent', async () => {
    const r = await send('POST', '/me/delete-request');
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    // Admin notification is fire-and-forget — give it a beat.
    for (let i = 0; i < 20 && !sent.some((m) => m.to === `${run}_admin@x.com`); i++) await new Promise((r) => setTimeout(r, 50));
    expect(sent.some((m) => m.to === `${run}_admin@x.com` && /approval needed/i.test(m.subject))).toBe(true);
    expect((await get('/me')).json().deletionRequest).not.toBeNull();

    const again = await send('POST', '/me/delete-request');
    expect(again.json().already).toBe(true);
    expect(await prisma.staffRequest.count({ where: { requestedBy: userId, type: 'ACCOUNT_DELETE' } })).toBe(1);

    const queue = await get('/ops/requests', adminCookie);
    expect(queue.statusCode).toBe(200);
    const mine = queue.json().open.find((q: { caseId: string }) => q.caseId === caseId);
    expect(mine).toMatchObject({ type: 'ACCOUNT_DELETE', requestedByEmail: `${run}_new@x.com` });
  });
});

describe('export', () => {
  it('refuses a bundle over 300 MB with a way forward, and serves a zip under it', async () => {
    storageMock.bytes = 400 * 1024 * 1024;
    let r = await get('/me/export');
    expect(r.statusCode).toBe(413);
    expect(r.json().error).toMatch(/too large .* documents page/);
    storageMock.bytes = 1024;
    r = await get('/me/export');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/zip/);
    expect(r.headers['content-disposition']).toMatch(/my-court-documents\.zip/);
  });
});
