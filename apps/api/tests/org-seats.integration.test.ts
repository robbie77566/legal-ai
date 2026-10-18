/**
 * I3 — seats in an organisation (persona_rollout_plan.md §4 "unlimited
 * users", §5 I): the OWNER invites an INVESTIGATOR and a VIEWER by email;
 * accepting creates PROFESSIONAL users with those membership roles; a VIEWER
 * can neither create a matter nor invite (403); the last OWNER cannot be
 * removed. Live Postgres, capture email provider.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `seats_${Date.now()}`;
const sent: EmailMessage[] = [];
const tokenIn = (msg: EmailMessage) => {
  const m = msg.text.match(/\/counsel\/join\?token=([0-9a-f]+)/);
  if (!m) throw new Error('no join link in email');
  return m[1];
};
const cookieFor = async (userId: string, tenantId: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

let ownerId: string;
let orgId: string;
let tenantId: string;
let ownerCookie: string;
let familyTenant: string;
const PASSWORD = 'CorrectHorse9Battery!';

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  const res = await fastify.inject({
    method: 'POST', url: '/counsel/signup',
    payload: { email: `${run}_owner@example.com`, password: PASSWORD, name: 'Maria Lopez', barNumber: '24022222', practiceType: 'pd', organisationName: `${run} Bexar PD`, organisationKind: 'PD_OFFICE' },
  });
  expect(res.statusCode).toBe(200);
  ownerId = res.json().userId;
  orgId = res.json().organisationId;
  tenantId = (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).tenantId;
  ownerCookie = await cookieFor(ownerId, tenantId);
  familyTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: familyTenant, role: 'CLIENT' } });
  await setOverride('counsel_surfaces', tenantId, true, 'I3', 'test');
  await setOverride('offices', tenantId, true, 'I3', 'test');
  __invalidateFlagCache();
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await clearOverride('counsel_surfaces', tenantId, 'test');
  await clearOverride('offices', tenantId, 'test');
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, familyTenant] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, familyTenant] } } });
  await prisma.$disconnect();
});

const invite = (cookie: string, email: string, role: string) =>
  fastify.inject({ method: 'POST', url: '/counsel/org/invitations', headers: { cookie }, payload: { email, role } });
const accept = (token: string, payload: Record<string, unknown>) =>
  fastify.inject({ method: 'POST', url: `/counsel/org/invitations/${token}/accept`, payload });
const org = (cookie: string) => fastify.inject({ method: 'GET', url: '/counsel/org', headers: { cookie } });

describe('I3 — seats', () => {
  let investigatorId: string;
  let investigatorCookie: string;
  let viewerId: string;
  let viewerCookie: string;
  let investigatorToken: string;

  it('GET /counsel/org shows the organisation, its members, no invitations and the allowance', async () => {
    const res = await org(ownerCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().organisation).toMatchObject({ id: orgId, kind: 'PD_OFFICE', name: `${run} Bexar PD`, pilot: false, allowanceRecords: 0, publicInterest: false });
    expect(res.json().members).toEqual([expect.objectContaining({ userId: ownerId, role: 'OWNER', email: `${run}_owner@example.com`, name: 'Maria Lopez' })]);
    expect(res.json().invitations).toEqual([]);
    expect(res.json().membership).toEqual({ role: 'OWNER' });
  });

  it('the OWNER invites an investigator and a viewer; the email carries a join link; the raw token is never stored', async () => {
    const inv = await invite(ownerCookie, `${run}_inv@example.com`, 'INVESTIGATOR');
    expect(inv.statusCode).toBe(200);
    expect(inv.json().invitation).toMatchObject({ email: `${run}_inv@example.com`, role: 'INVESTIGATOR' });
    expect(inv.json().invite).toMatchObject({ delivered: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(`${run}_inv@example.com`);
    expect(sent[0].subject).toMatch(new RegExp(`${run} Bexar PD`));
    expect(sent[0].text).toMatch(/Maria Lopez added you to .* as an investigator/);
    expect(sent[0].text).toMatch(/\/counsel\/join\?token=/);
    investigatorToken = tokenIn(sent[0]);
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: inv.json().invitation.id } });
    expect(row.tokenHash).not.toBe(investigatorToken);
    expect(row.tokenHash).toHaveLength(64);
    expect(row.acceptedAt).toBeNull();
    expect(row.invitedBy).toBe(ownerId);
    expect(row.tenantId).toBe(tenantId);

    const view = await invite(ownerCookie, `${run}_viewer@example.com`, 'VIEWER');
    expect(view.statusCode).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toMatch(/as a viewer/);

    const listed = await org(ownerCookie);
    expect(listed.json().invitations.map((i: { email: string; role: string }) => [i.email, i.role])).toEqual([
      [`${run}_inv@example.com`, 'INVESTIGATOR'], [`${run}_viewer@example.com`, 'VIEWER'],
    ]);
  });

  it('re-inviting the same address rotates the token instead of adding a row; a member cannot be invited; junk is 400', async () => {
    const before = await prisma.invitation.findFirstOrThrow({ where: { organisationId: orgId, email: `${run}_viewer@example.com` } });
    const again = await invite(ownerCookie, `${run}_VIEWER@example.com`, 'VIEWER');
    expect(again.statusCode).toBe(200);
    expect(await prisma.invitation.count({ where: { organisationId: orgId, email: `${run}_viewer@example.com` } })).toBe(1);
    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.tokenHash).not.toBe(before.tokenHash);
    expect(sent).toHaveLength(1);
    expect((await invite(ownerCookie, `${run}_owner@example.com`, 'VIEWER')).statusCode).toBe(409);
    expect((await invite(ownerCookie, 'not-an-email', 'VIEWER')).statusCode).toBe(400);
    expect((await invite(ownerCookie, `${run}_x@example.com`, 'ADMIN')).statusCode).toBe(400);
  });

  it('accepting creates a PROFESSIONAL user (role CLIENT) with the invited membership role; the token is single-use', async () => {
    expect((await accept(investigatorToken, { name: 'Sam Ortiz', password: 'short' })).statusCode).toBe(400);
    const res = await accept(investigatorToken, { name: 'Sam Ortiz', password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, organisationId: orgId, created: true, email: `${run}_inv@example.com` });
    investigatorId = res.json().userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: investigatorId }, include: { memberships: true, grants: true } });
    expect(user).toMatchObject({ email: `${run}_inv@example.com`, name: 'Sam Ortiz', role: 'CLIENT', accountKind: 'PROFESSIONAL', tenantId, practiceType: 'investigator' });
    expect(user.passwordHash).toBeTruthy();
    expect(user.grants).toEqual([]);
    expect(user.memberships).toEqual([expect.objectContaining({ organisationId: orgId, tenantId, role: 'INVESTIGATOR', invitedBy: ownerId })]);
    expect((await prisma.invitation.findFirstOrThrow({ where: { organisationId: orgId, email: `${run}_inv@example.com` } })).acceptedAt).toBeTruthy();
    expect((await accept(investigatorToken, { name: 'Sam Ortiz', password: PASSWORD })).statusCode).toBe(400);
    expect((await accept('0'.repeat(64), { name: 'X', password: PASSWORD })).statusCode).toBe(400);

    investigatorCookie = await cookieFor(investigatorId, tenantId);
    const me = await fastify.inject({ method: 'GET', url: '/counsel/me', headers: { cookie: investigatorCookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().membership).toEqual({ role: 'INVESTIGATOR' });
    expect(me.json().organisation.id).toBe(orgId);
  });

  it('the viewer accepts with the rotated token; an expired invitation and an address that already belongs to a family account are refused', async () => {
    const resend = await invite(ownerCookie, `${run}_viewer@example.com`, 'VIEWER');
    expect(resend.statusCode).toBe(200);
    const viewerToken = tokenIn(sent[0]);
    const res = await accept(viewerToken, { name: 'Vera Chen', password: PASSWORD });
    expect(res.statusCode).toBe(200);
    viewerId = res.json().userId;
    viewerCookie = await cookieFor(viewerId, tenantId);
    expect((await prisma.membership.findFirstOrThrow({ where: { userId: viewerId } })).role).toBe('VIEWER');
    const audit = await prisma.auditLog.findFirst({ where: { caseId: `account:${viewerId}`, action: 'ACCOUNT_SIGNUP' } });
    expect(audit!.details).toMatchObject({ op: 'invitation_accepted', organisationId: orgId, role: 'VIEWER' });

    // Expired.
    await invite(ownerCookie, `${run}_late@example.com`, 'ATTORNEY');
    const late = tokenIn(sent[sent.length - 1]);
    await prisma.invitation.updateMany({ where: { organisationId: orgId, email: `${run}_late@example.com` }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(late, { name: 'Late', password: PASSWORD })).statusCode).toBe(400);

    // An address that is already a family account elsewhere.
    await invite(ownerCookie, `${run}_family@example.com`, 'VIEWER');
    const fam = tokenIn(sent[sent.length - 1]);
    const clash = await accept(fam, { name: 'Fam', password: PASSWORD });
    expect(clash.statusCode).toBe(409);
  });

  it('a VIEWER cannot create a matter or an invitation (403); an INVESTIGATOR cannot invite either', async () => {
    const asViewer = await fastify.inject({ method: 'POST', url: '/cases', headers: { cookie: viewerCookie }, payload: { title: 'Viewer matter' } });
    expect(asViewer.statusCode).toBe(403);
    expect((await invite(viewerCookie, `${run}_v2@example.com`, 'VIEWER')).statusCode).toBe(403);
    expect((await invite(investigatorCookie, `${run}_v2@example.com`, 'VIEWER')).statusCode).toBe(403);
    // The owner's seat still can.
    const asOwner = await fastify.inject({ method: 'POST', url: '/cases', headers: { cookie: ownerCookie }, payload: { title: 'Owner matter' } });
    expect(asOwner.statusCode).toBe(200);
    // Everyone with a seat can read the organisation.
    expect((await org(viewerCookie)).statusCode).toBe(200);
    expect((await org(viewerCookie)).json().members).toHaveLength(3);
  });

  it('the OWNER removes a member (403 on their next request); the last OWNER cannot be removed; audited', async () => {
    const remove = (cookie: string, userId: string) =>
      fastify.inject({ method: 'DELETE', url: `/counsel/org/members/${userId}`, headers: { cookie } });
    expect((await remove(viewerCookie, investigatorId)).statusCode).toBe(403);
    expect((await remove(ownerCookie, 'nobody')).statusCode).toBe(404);
    expect((await remove(ownerCookie, ownerId)).statusCode).toBe(409);
    expect((await remove(ownerCookie, viewerId)).statusCode).toBe(200);
    expect((await fastify.inject({ method: 'GET', url: '/counsel/me', headers: { cookie: viewerCookie } })).statusCode).toBe(403);
    expect(await prisma.membership.count({ where: { userId: viewerId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: viewerId } })).toBe(1); // the account stays; the seat is gone
    const audit = await prisma.auditLog.findFirst({ where: { caseId: `organisation:${orgId}`, action: 'SEAT_CHANGE', details: { path: ['op'], equals: 'member_removed' } } });
    expect(audit).toBeTruthy();
    expect(audit!.details).toMatchObject({ targetUserId: viewerId, role: 'VIEWER' });
  });

  it('counsel_surfaces off for the tenant → /counsel/org is 404, /counsel/me still answers', async () => {
    await clearOverride('counsel_surfaces', tenantId, 'test');
    __invalidateFlagCache();
    expect((await org(ownerCookie)).statusCode).toBe(404);
    expect((await fastify.inject({ method: 'GET', url: '/counsel/me', headers: { cookie: ownerCookie } })).statusCode).toBe(200);
    await setOverride('counsel_surfaces', tenantId, true, 'I3', 'test');
    __invalidateFlagCache();
  });
});
