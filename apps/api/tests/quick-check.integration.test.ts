/**
 * The document quick check ("this looks like X — did we name it right?").
 * Found 2026-11-01: "That's right" did nothing when the suggested checklist
 * item had been retired by an interview re-run — the confirm route threw on
 * the missing item and the whole save rolled back. Now the confirm survives
 * a retired item, and the interview re-run re-points documents at the
 * re-seeded item of the same kind so the link is never stale.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `quickcheck_${Date.now()}`;
let tenantId: string;
let userId: string;
let cookie: string;
const caseIds: string[] = [];

const seedCase = async () => {
  const c = await prisma.case.create({
    data: { title: `${run}_case`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL', vehicle: '11.07', accessList: { create: { userId, role: 'ADMIN' } } },
  });
  caseIds.push(c.id);
  return c;
};

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.checklistItem.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('quick check confirm', () => {
  it('"That\'s right" confirms the document and its checklist item', async () => {
    const c = await seedCase();
    const item = await prisma.checklistItem.create({ data: { caseId: c.id, kind: 'rr_volume', label: "Reporter's record", state: 'NEEDED' } });
    const doc = await prisma.document.create({ data: { filename: 'rr.pdf', caseId: c.id, suggestedChecklistItemId: item.id } });
    const res = await fastify.inject({ method: 'POST', url: `/cases/${c.id}/documents/${doc.id}/confirm`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).classificationConfirmed).toBe(true);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: item.id } })).state).toBe('CONFIRMED');
    const list = await fastify.inject({ method: 'GET', url: `/cases/${c.id}/checklist`, headers: { cookie } });
    expect(list.json().documents.find((d: { id: string }) => d.id === doc.id).classificationConfirmed).toBe(true);
  });

  it('still saves when the suggested checklist item no longer exists (the 2026-11-01 bug)', async () => {
    const c = await seedCase();
    const doc = await prisma.document.create({ data: { filename: 'orphan.pdf', caseId: c.id, suggestedChecklistItemId: 'item_retired_long_ago' } });
    const res = await fastify.inject({ method: 'POST', url: `/cases/${c.id}/documents/${doc.id}/confirm`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).classificationConfirmed).toBe(true);
  });

  it('an interview re-run keeps a recognised document pointed at the re-seeded item of the same kind', async () => {
    const c = await seedCase();
    const first = await fastify.inject({ method: 'POST', url: `/cases/${c.id}/interview`, headers: { cookie }, payload: { county: 'Bexar', convictionYear: 2019, hadAppeal: true } });
    expect(first.statusCode).toBeLessThan(300);
    const before = await prisma.checklistItem.findMany({ where: { caseId: c.id }, select: { id: true, kind: true } });
    expect(before.length).toBeGreaterThan(0);
    const target = before[0];
    const doc = await prisma.document.create({ data: { filename: 'linked.pdf', caseId: c.id, suggestedChecklistItemId: target.id } });
    const again = await fastify.inject({ method: 'POST', url: `/cases/${c.id}/interview`, headers: { cookie }, payload: { county: 'Bexar', convictionYear: 2019, hadAppeal: true } });
    expect(again.statusCode).toBeLessThan(300);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.suggestedChecklistItemId).not.toBeNull();
    const now = await prisma.checklistItem.findUniqueOrThrow({ where: { id: after.suggestedChecklistItemId! } });
    expect(now.kind).toBe(target.kind);
    expect(now.caseId).toBe(c.id);
    // …and the confirm goes through on the re-pointed link.
    const res = await fastify.inject({ method: 'POST', url: `/cases/${c.id}/documents/${doc.id}/confirm`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: now.id } })).state).toBe('CONFIRMED');
  });
});
