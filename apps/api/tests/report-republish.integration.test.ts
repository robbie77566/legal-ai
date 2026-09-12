import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';
import { TEMPLATE_VERSION, templateNotesSince } from '../src/services/report-template';

/** Republish (PO, 2026-09-12): the latest findings re-released on the current
 *  template, the family emailed what is different. Never a new analysis. */
const sent: EmailMessage[] = [];
const run = `repub_${Date.now()}`;
let tenantId: string; let caseId: string; let runId: string;
let adminCookie: string; let supportCookie: string; let clientCookie: string;

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } });
  const support = await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId, role: 'SUPPORT' } });
  const client = await prisma.user.create({ data: { email: `${run}_family@x.com`, tenantId, role: 'CLIENT' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId, role: 'ADMIN' })}`;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId, role: 'SUPPORT' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: client.id, tenantId, role: 'CLIENT' })}`;
  const kase = await prisma.case.create({
    data: { title: `${run}_case`, tenantId, status: 'READY', lane: 'TRIAL', vehicle: '11.07', slaStartedAt: new Date(), accessList: { create: { userId: client.id, role: 'ADMIN' } } },
  });
  caseId = kase.id;
  runId = (await prisma.analysisRun.create({ data: { caseId, tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } })).id;
  await prisma.report.create({ data: { caseId, tenantId, runId, versionNo: 1, templateVersion: 'AB-v1', approvedBy: 'auto_qa', findingsSnapshot: { findings: [] } } });
});
afterAll(async () => { __setEmailProviderForTests(undefined); await fastify.close(); });

describe('template changelog', () => {
  it('lists what changed after the family\'s version; nothing when already current', () => {
    expect(templateNotesSince('AB-v1').length).toBeGreaterThan(0);
    expect(templateNotesSince('AB-v1').join(' ')).toMatch(/weight line/);
    expect(templateNotesSince(TEMPLATE_VERSION)).toEqual([]);
    expect(templateNotesSince(null)).toEqual(templateNotesSince(undefined));
  });
});

describe('POST /ops/cases/:id/report/republish', () => {
  it('support cannot (it emails a customer)', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${caseId}/report/republish`, headers: { cookie: supportCookie } });
    expect(res.statusCode).toBe(403);
  });

  it('releases v2 on the current template with the same snapshot and run, and emails the family what changed', async () => {
    sent.length = 0;
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${caseId}/report/republish`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, fromVersion: 1, toVersion: 2, templateVersion: TEMPLATE_VERSION, emailed: true });
    // Summary backfill is attempted, never blocks: this case has no digitized text, so no model call.
    expect(body.summary).toMatchObject({ runId, rebuilt: false, reason: 'no digitized text' });
    expect(body.notes.length).toBeGreaterThan(0);
    const v2 = await prisma.report.findFirstOrThrow({ where: { caseId, versionNo: 2 } });
    expect(v2.runId).toBe(runId);
    expect(v2.templateVersion).toBe(TEMPLATE_VERSION);
    expect(v2.changeNotes).toEqual(body.notes);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'report.rendered' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { caseId, action: 'QA_DECISION' } })).toBe(1);

    const mail = sent.find((m) => m.to === `${run}_family@x.com`);
    expect(mail?.subject).toBe('Your report has been updated (version 2)');
    expect(mail?.text).toContain('What we found has not changed');
    for (const n of body.notes as string[]) expect(mail?.text).toContain(n);
    expect(mail?.text).toContain(`/case/${caseId}/report`);

    // The family's "what changed" box carries the same notes.
    const changes = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report/changes`, headers: { cookie: clientCookie } });
    expect(changes.statusCode).toBe(200);
    expect(changes.json()).toMatchObject({ fromVersion: 1, toVersion: 2, added: [], removed: [], keptCount: 0, notes: body.notes });
    expect((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report/versions`, headers: { cookie: clientCookie } })).json()).toHaveLength(2);
  });

  it('refuses when the latest version is already on the current template', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${caseId}/report/republish`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already on the current template/);
  });

  it('404 when nothing has been released', async () => {
    const bare = await prisma.case.create({ data: { title: `${run}_bare`, tenantId, status: 'READY', lane: 'TRIAL', vehicle: '11.07', slaStartedAt: new Date() } });
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${bare.id}/report/republish`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(404);
  });
});
