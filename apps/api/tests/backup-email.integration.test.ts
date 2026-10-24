/**
 * Backup email (your_account "Backup email (2026-10-24)") — live Postgres,
 * capture email provider. A signed-in person adds a second address; it is
 * verified from a link sent to it; the primary hears about every step; the
 * api never gives the token back and never audits an address.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';
process.env.WEB_ORIGIN = 'http://web.test';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `bk_${Date.now()}`;
const PRIMARY = `${run}@example.com`;
const OTHER_PRIMARY = `${run}_other@example.com`;
const BACKUP = `${run}_backup@example.com`;
const BACKUP2 = `${run}_backup2@example.com`;
let tenantId: string;
let userId: string;
let otherId: string;
let cookie: string;
const sent: EmailMessage[] = [];

const get = (url: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const send = (method: 'POST' | 'DELETE', url: string, payload: Record<string, unknown> = {}) =>
  fastify.inject({ method, url, headers: { cookie }, payload });
const confirm = (token: string) => fastify.inject({ method: 'POST', url: '/me/backup-email/confirm', payload: { token } });
/** Sends are fire-and-forget in the routes — wait for the capture provider. */
const until = async (pred: () => boolean) => {
  for (let i = 0; i < 40 && !pred(); i++) await new Promise((r) => setTimeout(r, 25));
  expect(pred()).toBe(true);
};
const linkIn = (m: EmailMessage) => new URL(m.text.match(/http\S+/)![0]);
const row = () => prisma.user.findUniqueOrThrow({ where: { id: userId } });

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({
    data: { email: PRIMARY, name: 'Jo Whitfield', tenantId, role: 'ADMIN', passwordHash: await bcrypt.hash('OldPassword99!', 12) },
  })).id;
  otherId = (await prisma.user.create({ data: { email: OTHER_PRIMARY, tenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'ADMIN' })}`;
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  // AuditLog is append-only by trigger; its rows have no FKs and stay.
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});
beforeEach(() => { sent.length = 0; });

describe('POST /me/backup-email', () => {
  it('stores the address unverified with a hashed 24-hour token, mails the link to the NEW address and a notice to the primary', async () => {
    const r = await send('POST', '/me/backup-email', { email: BACKUP.toUpperCase() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, backupEmail: BACKUP, backupEmailVerified: false });

    const u = await row();
    expect(u.backupEmail).toBe(BACKUP);
    expect(u.backupEmailVerifiedAt).toBeNull();
    expect(u.backupEmailToken).toMatch(/^[0-9a-f]{64}$/);
    expect(u.backupEmailExpires!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    await until(() => sent.length >= 2);
    const confirmMail = sent.find((m) => m.to === BACKUP)!;
    const notice = sent.find((m) => m.to === PRIMARY)!;
    expect(confirmMail.subject).toMatch(/confirm your backup email/i);
    const url = linkIn(confirmMail);
    expect(url.origin + url.pathname).toBe('http://web.test/auth/backup-email/confirm');
    const token = url.searchParams.get('token')!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toBe(u.backupEmailToken); // hash stored, raw only in the email
    expect(confirmMail.text).toContain('b•••@example.com'); // the primary, masked, so the recipient knows which account
    expect(confirmMail.text).not.toContain(PRIMARY);
    expect(notice.subject).toMatch(/backup email was added/i);
    expect(notice.text).toContain('b•••@example.com');
    expect(notice.text).not.toContain(BACKUP);
    expect(notice.text).toMatch(/change your password/i);
  });

  it('GET /me shows the address and its state — never the token', async () => {
    const d = (await get('/me')).json();
    expect(d.user.backupEmail).toBe(BACKUP);
    expect(d.user.backupEmailVerified).toBe(false);
    expect(d.user.backupEmailVerifiedAt).toBeNull();
    expect(new Date(d.user.backupEmailAddedAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(d)).not.toMatch(/backupEmailToken|backupEmailExpires/);
  });

  it('re-posting while pending replaces the address and re-issues the token', async () => {
    const before = (await row()).backupEmailToken;
    const r = await send('POST', '/me/backup-email', { email: BACKUP2 });
    expect(r.statusCode).toBe(200);
    const u = await row();
    expect(u.backupEmail).toBe(BACKUP2);
    expect(u.backupEmailToken).not.toBe(before);
    await until(() => sent.some((m) => m.to === BACKUP2));
    expect(sent.some((m) => m.to === BACKUP)).toBe(false); // the replaced address hears nothing new
  });

  it("refuses the account's own sign-in address", async () => {
    const r = await send('POST', '/me/backup-email', { email: PRIMARY.toUpperCase() });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/your sign-in address/i);
    expect((await row()).backupEmail).toBe(BACKUP2); // unchanged
  });

  it("refuses another account's sign-in address with the neutral message", async () => {
    const r = await send('POST', '/me/backup-email', { email: OTHER_PRIMARY });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("That address can't be used as a backup here");
    expect((await row()).backupEmail).toBe(BACKUP2);
    expect(sent).toHaveLength(0);
  });

  it('is rejected signed out', async () => {
    const r = await fastify.inject({ method: 'POST', url: '/me/backup-email', payload: { email: BACKUP } });
    expect(r.statusCode).toBe(401);
  });
});

describe('POST /me/backup-email/confirm (public)', () => {
  it('a bad token is 400 and changes nothing', async () => {
    expect((await confirm('f'.repeat(64))).statusCode).toBe(400);
    expect((await confirm('nope')).statusCode).toBe(400);
    expect((await row()).backupEmailVerifiedAt).toBeNull();
  });

  it('an expired token is 400', async () => {
    await send('POST', '/me/backup-email', { email: BACKUP });
    await until(() => sent.some((m) => m.to === BACKUP));
    const token = linkIn(sent.find((m) => m.to === BACKUP)!).searchParams.get('token')!;
    await prisma.user.update({ where: { id: userId }, data: { backupEmailExpires: new Date(Date.now() - 1000) } });
    const r = await confirm(token);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/invalid or has expired/);
    expect((await row()).backupEmailVerifiedAt).toBeNull();
  });

  it('the emailed token verifies the address once, clears the token, and tells both addresses', async () => {
    await send('POST', '/me/backup-email', { email: BACKUP });
    await until(() => sent.some((m) => m.to === BACKUP));
    const token = linkIn(sent.find((m) => m.to === BACKUP)!).searchParams.get('token')!;
    sent.length = 0;

    const r = await confirm(token);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, backupEmail: BACKUP });
    const u = await row();
    expect(u.backupEmailVerifiedAt).not.toBeNull();
    expect(u.backupEmailToken).toBeNull();
    expect(u.backupEmailExpires).toBeNull();

    await until(() => sent.filter((m) => /backup email is verified/i.test(m.subject)).length >= 2);
    expect(sent.map((m) => m.to).sort()).toEqual([PRIMARY, BACKUP].sort());
    for (const m of sent) expect(m.text).toContain('b•••@example.com');

    const d = (await get('/me')).json();
    expect(d.user).toMatchObject({ backupEmail: BACKUP, backupEmailVerified: true, backupEmailAddedAt: null });
    expect(d.user.backupEmailVerifiedAt).toBeTruthy();

    // single-use
    expect((await confirm(token)).statusCode).toBe(400);
  });
});

describe('DELETE /me/backup-email', () => {
  it('clears all four fields and tells both addresses', async () => {
    const r = await send('DELETE', '/me/backup-email');
    expect(r.statusCode).toBe(200);
    const u = await row();
    expect([u.backupEmail, u.backupEmailVerifiedAt, u.backupEmailToken, u.backupEmailExpires]).toEqual([null, null, null, null]);
    await until(() => sent.filter((m) => /backup email was removed/i.test(m.subject)).length >= 2);
    expect(sent.map((m) => m.to).sort()).toEqual([PRIMARY, BACKUP].sort());
    const d = (await get('/me')).json();
    expect(d.user).toMatchObject({ backupEmail: null, backupEmailVerified: false });
  });

  it('is a quiet no-op when there is nothing to remove', async () => {
    expect((await send('DELETE', '/me/backup-email')).statusCode).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

describe('audit', () => {
  it('every write is audited with ids and the op only — never an address', async () => {
    const rows = await prisma.auditLog.findMany({ where: { caseId: `account:${userId}`, action: 'ACCOUNT_SECURITY' }, orderBy: { createdAt: 'asc' } });
    const ops = rows.map((r) => (r.details as { op: string }).op);
    expect(ops).toContain('backup_email_add');
    expect(ops).toContain('backup_email_verify');
    expect(ops).toContain('backup_email_remove');
    expect(ops.filter((o) => o === 'backup_email_remove')).toHaveLength(1); // the no-op DELETE wrote nothing
    for (const r of rows) {
      expect(r.userId).toBe(userId);
      expect(r.tenantId).toBe(tenantId);
      expect(JSON.stringify(r.details)).not.toContain('@');
    }
  });
});

describe('rate limit', () => {
  it('POST /me/backup-email is limited to 10 per 15 minutes per caller', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12 && !codes.includes(429); i++) {
      codes.push((await send('POST', '/me/backup-email', { email: `${run}_rl${i}@example.com` })).statusCode);
    }
    expect(codes).toContain(429);
    expect(codes.filter((c) => c === 200).length).toBeGreaterThan(0);
  });
});
