/**
 * W4 — sign-in log and the account summary (staff_console.md §12 "Sign-in
 * log and alerts") — live Postgres.
 *  - GET /ops/accounts/:id: the shape for a family (cases, backup email,
 *    attempts) and for a professional (bar status, organisation, seat);
 *    SUPPORT sees the backup email masked; CLIENT 403; unknown 404.
 *  - GET /ops/sign-ins: outcome / FAILED / first / q / since filters, paging.
 *  - prune deletes rows older than 180 days and keeps newer ones; the route
 *    is ADMIN only; the hourly sweep calls the same function.
 *  - GET /ops/status carries today's two numbers.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { pruneSignInAttempts, shortUserAgent, startOfTodayChicago, SIGN_IN_RETENTION_DAYS } from '../src/services/sign-ins.service';

const run = `signins_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role: 'ADMIN' | 'SUPPORT' | 'CLIENT') =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;
const get = (url: string, cookie: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string) => fastify.inject({ method: 'POST', url, headers: { cookie }, payload: {} });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let staffTenant: string; let famTenant: string; let firmTenant: string;
let adminId: string; let supportId: string; let familyId: string; let counselId: string;
let adminCookie: string; let supportCookie: string; let familyCookie: string;
let firmOrgId: string;
const familyEmail = `${run}_family@example.com`;
const counselEmail = `${run}_counsel@firm.example`;
const strangerEmail = `${run}_stranger@example.com`;

beforeAll(async () => {
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  famTenant = (await prisma.tenant.create({ data: { name: `${run}_fam` } })).id;
  firmTenant = (await prisma.tenant.create({ data: { name: `${run}_firm` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId: staffTenant, role: 'ADMIN', accountKind: 'STAFF' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId: staffTenant, role: 'SUPPORT', accountKind: 'STAFF' } })).id;
  familyId = (await prisma.user.create({
    data: {
      email: familyEmail, name: 'Maria Delgado', tenantId: famTenant, role: 'CLIENT', accountKind: 'FAMILY',
      lastLoginAt: daysAgo(1), loginCount: 3, backupEmail: 'backup.maria@example.com', backupEmailVerifiedAt: daysAgo(2),
    },
  })).id;
  await prisma.case.create({ data: { title: `${run}_case`, tenantId: famTenant, status: 'AWAITING_DOCS', lane: 'TRIAL', accessList: { create: { userId: familyId, role: 'ADMIN' } } } });
  firmOrgId = (await prisma.organisation.create({ data: { tenantId: firmTenant, kind: 'FIRM', name: 'Ortiz & Vale PLLC' } })).id;
  counselId = (await prisma.user.create({
    data: {
      email: counselEmail, name: 'Dana Ortiz', tenantId: firmTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL',
      barNumber: '24011111', barState: 'TX', practiceType: 'writ', barVerificationStatus: 'VERIFIED', barVerifiedAt: daysAgo(3), barVerifiedBy: adminId,
      loginCount: 1, lastLoginAt: daysAgo(3),
      memberships: { create: { organisationId: firmOrgId, tenantId: firmTenant, role: 'OWNER' } },
    },
  })).id;
  adminCookie = await cookieFor(adminId, staffTenant, 'ADMIN');
  supportCookie = await cookieFor(supportId, staffTenant, 'SUPPORT');
  familyCookie = await cookieFor(familyId, famTenant, 'CLIENT');

  // The log, oldest first: 25 attempts for the family (paging), a first
  // sign-in for counsel today, a stranger's miss, and two rows past retention.
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push({ email: familyEmail, userId: familyId, tenantId: famTenant, outcome: i % 5 === 0 ? ('BAD_PASSWORD' as const) : ('SUCCESS' as const), firstSignIn: i === 0, ip: '203.0.113.9', userAgent: IPHONE, createdAt: daysAgo(30 - i) });
  }
  rows.push({ email: counselEmail, userId: counselId, tenantId: firmTenant, outcome: 'SUCCESS' as const, firstSignIn: true, ip: '198.51.100.7', userAgent: CHROME, createdAt: new Date() });
  rows.push({ email: strangerEmail, userId: null, tenantId: null, outcome: 'UNKNOWN_EMAIL' as const, firstSignIn: false, ip: '192.0.2.1', userAgent: 'curl/8.4.0', createdAt: new Date(Date.now() - 60_000) });
  rows.push({ email: familyEmail, userId: familyId, tenantId: famTenant, outcome: 'RATE_LIMITED' as const, firstSignIn: false, ip: '203.0.113.9', userAgent: IPHONE, createdAt: new Date(Date.now() - 120_000) });
  rows.push({ email: `${run}_old1@example.com`, userId: null, tenantId: null, outcome: 'UNKNOWN_EMAIL' as const, firstSignIn: false, ip: null, userAgent: null, createdAt: daysAgo(SIGN_IN_RETENTION_DAYS + 1) });
  rows.push({ email: `${run}_old2@example.com`, userId: familyId, tenantId: famTenant, outcome: 'SUCCESS' as const, firstSignIn: false, ip: null, userAgent: null, createdAt: daysAgo(SIGN_IN_RETENTION_DAYS + 40) });
  await prisma.signInAttempt.createMany({ data: rows });
});

afterAll(async () => {
  await prisma.signInAttempt.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.caseAccess.deleteMany({ where: { userId: familyId } });
  await prisma.case.deleteMany({ where: { tenantId: famTenant } });
  await prisma.membership.deleteMany({ where: { tenantId: firmTenant } });
  await prisma.organisation.deleteMany({ where: { tenantId: firmTenant } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [staffTenant, famTenant, firmTenant] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [staffTenant, famTenant, firmTenant] } } });
});

describe('GET /ops/accounts/:id — the page the SMS links to', () => {
  it('a family account: name, email, kind, cases, last sign-in, count, verified backup email (ADMIN sees the address), the last 20 attempts newest first', async () => {
    const r = await get(`/ops/accounts/${familyId}`, adminCookie);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b).toMatchObject({
      id: familyId, email: familyEmail, name: 'Maria Delgado', accountKind: 'FAMILY', role: 'CLIENT', grants: [], seat: null, organisation: null, bar: null,
      signInCount: 3, cases: 1, deletedAt: null,
      backupEmail: { address: 'backup.maria@example.com', verified: true },
    });
    expect(b.lastSignInAt).toBeTruthy();
    expect(b.createdAt).toBeTruthy();
    expect(b.attempts).toHaveLength(20);
    expect(b.attempts[0]).toMatchObject({ outcome: 'RATE_LIMITED', ip: '203.0.113.9', userAgent: 'Safari 17 · iOS', firstSignIn: false });
    expect(b.attempts.every((a: { userId: string }) => a.userId === familyId)).toBe(true);
    const times = b.attempts.map((a: { createdAt: string }) => new Date(a.createdAt).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    // The full user agent stays in the row; the page gets the short form.
    expect(JSON.stringify(b)).not.toContain('AppleWebKit');
  });

  it('a professional account: bar status, organisation and seat', async () => {
    const r = await get(`/ops/accounts/${counselId}`, adminCookie);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      accountKind: 'PROFESSIONAL', seat: 'OWNER',
      organisation: { id: firmOrgId, kind: 'FIRM', name: 'Ortiz & Vale PLLC', isTest: false },
      bar: { number: '24011111', state: 'TX', status: 'VERIFIED', practiceType: 'writ' },
      backupEmail: null, cases: 0, signInCount: 1,
    });
    expect(r.json().bar.verifiedAt).toBeTruthy();
    expect(r.json().attempts).toHaveLength(1);
    expect(r.json().attempts[0]).toMatchObject({ outcome: 'SUCCESS', firstSignIn: true, userAgent: 'Chrome 130 · Windows' });
  });

  it('a staff account lists its role; SUPPORT may read every account but sees the backup email masked', async () => {
    const staff = await get(`/ops/accounts/${adminId}`, supportCookie);
    expect(staff.statusCode).toBe(200);
    expect(staff.json()).toMatchObject({ accountKind: 'STAFF', role: 'ADMIN' });
    const fam = await get(`/ops/accounts/${familyId}`, supportCookie);
    expect(fam.statusCode).toBe(200);
    expect(fam.json().backupEmail).toMatchObject({ address: 'b•••@example.com', verified: true });
    expect(JSON.stringify(fam.json())).not.toContain('backup.maria@example.com');
    // The primary address is the account — Support needs it to find the person.
    expect(fam.json().email).toBe(familyEmail);
  });

  it('CLIENT 403, unknown 404', async () => {
    expect((await get(`/ops/accounts/${familyId}`, familyCookie)).statusCode).toBe(403);
    expect((await get('/ops/accounts/nope_does_not_exist', adminCookie)).statusCode).toBe(404);
    expect((await fastify.inject({ method: 'GET', url: `/ops/accounts/${familyId}` })).statusCode).toBe(401);
  });
});

describe('GET /ops/sign-ins — the log', () => {
  const mine = (b: { attempts: Array<{ email: string; outcome: string }> }) => b.attempts.filter((a) => a.email.startsWith(run));

  it('newest first, paged, with the total; SUPPORT may read', async () => {
    const r = await get(`/ops/sign-ins?q=${run}&pageSize=10`, supportCookie);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b).toMatchObject({ page: 1, pageSize: 10, total: 30, hasMore: true });
    expect(b.attempts).toHaveLength(10);
    expect(b.attempts[0].email).toBe(counselEmail);
    expect(b.attempts[1].email).toBe(strangerEmail);
    expect(b.attempts[1]).toMatchObject({ outcome: 'UNKNOWN_EMAIL', userId: null, userAgent: 'curl/8.4.0' });
    const p3 = (await get(`/ops/sign-ins?q=${run}&pageSize=10&page=3`, adminCookie)).json();
    expect(p3.attempts).toHaveLength(10);
    expect(p3.hasMore).toBe(false);
    const p4 = (await get(`/ops/sign-ins?q=${run}&pageSize=10&page=4`, adminCookie)).json();
    expect(p4.attempts).toHaveLength(0);
  });

  it('outcome filter: one outcome, or FAILED = everything but SUCCESS', async () => {
    const bad = (await get(`/ops/sign-ins?q=${run}&outcome=BAD_PASSWORD&pageSize=200`, adminCookie)).json();
    expect(bad.total).toBe(5);
    expect(mine(bad).every((a) => (a as { outcome: string }).outcome === 'BAD_PASSWORD')).toBe(true);
    const failed = (await get(`/ops/sign-ins?q=${run}&outcome=FAILED&pageSize=200`, adminCookie)).json();
    expect(failed.total).toBe(5 + 1 + 1 + 1); // bad passwords, the stranger, the rate limit, old1
    expect(mine(failed).some((a) => (a as { outcome: string }).outcome === 'SUCCESS')).toBe(false);
    expect((await get('/ops/sign-ins?outcome=NOPE', adminCookie)).statusCode).toBe(400);
  });

  it('first=1 keeps only first sign-ins; since= bounds the window', async () => {
    const first = (await get(`/ops/sign-ins?q=${run}&first=1&pageSize=200`, adminCookie)).json();
    expect(first.total).toBe(2);
    expect(first.attempts.map((a: { email: string }) => a.email).sort()).toEqual([counselEmail, familyEmail].sort());
    const since = encodeURIComponent(daysAgo(10).toISOString());
    const recent = (await get(`/ops/sign-ins?q=${run}&since=${since}&pageSize=200`, adminCookie)).json();
    // Family rows 21..24 (9..6 days ago) + counsel today + stranger + rate-limit.
    expect(recent.total).toBe(4 + 3);
    expect(recent.attempts.every((a: { createdAt: string }) => new Date(a.createdAt).getTime() >= daysAgo(10).getTime())).toBe(true);
  });

  it('CLIENT 403', async () => {
    expect((await get('/ops/sign-ins', familyCookie)).statusCode).toBe(403);
  });
});

describe('retention', () => {
  it('prune deletes rows older than 180 days and keeps the rest; SUPPORT may not run it; ADMIN may', async () => {
    const before = await prisma.signInAttempt.count({ where: { email: { startsWith: run } } });
    expect(before).toBe(30);
    expect((await post('/ops/sign-ins/prune', supportCookie)).statusCode).toBe(403);
    const r = await post('/ops/sign-ins/prune', adminCookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    expect(r.json().deleted).toBeGreaterThanOrEqual(2);
    expect(await prisma.signInAttempt.count({ where: { email: { in: [`${run}_old1@example.com`, `${run}_old2@example.com`] } } })).toBe(0);
    expect(await prisma.signInAttempt.count({ where: { email: { startsWith: run } } })).toBe(28);
    // Idempotent: the sweep's function finds nothing more of ours.
    const again = await pruneSignInAttempts();
    expect(again.deleted).toBe(0);
    expect(again.cutoff.getTime()).toBeLessThan(daysAgo(SIGN_IN_RETENTION_DAYS - 1).getTime());
  });
});

describe('GET /ops/status — the Today page numbers', () => {
  it('carries signIns.firstToday and signIns.failed24h', async () => {
    const r = await get('/ops/status', adminCookie);
    expect(r.statusCode).toBe(200);
    const s = r.json().signIns;
    expect(s.firstToday).toBeGreaterThanOrEqual(1); // counsel, today
    expect(s.failed24h).toBeGreaterThanOrEqual(2); // the stranger and the rate limit
    expect(startOfTodayChicago().getTime()).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - startOfTodayChicago().getTime()).toBeLessThan(24 * 60 * 60 * 1000 + 60_000);
  });
});

describe('shortUserAgent', () => {
  it('names the browser and the OS, or cuts an unknown string', () => {
    expect(shortUserAgent(IPHONE)).toBe('Safari 17 · iOS');
    expect(shortUserAgent(CHROME)).toBe('Chrome 130 · Windows');
    expect(shortUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe('Firefox 128 · Linux');
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0')).toBe('Edge 129 · Windows');
    expect(shortUserAgent('curl/8.4.0')).toBe('curl/8.4.0');
    expect(shortUserAgent('x'.repeat(100))).toHaveLength(60);
    expect(shortUserAgent(null)).toBeNull();
  });
});
