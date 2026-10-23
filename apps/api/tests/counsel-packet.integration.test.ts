/**
 * Counsel packet routes (persona_rollout_plan.md §5 E, January slice) — live Postgres.
 *  E10  PROFESSIONAL with a released report → 200 PDF and 200 JSON with the
 *       sections (Part B first); before release → 409; FAMILY → 403; flag off
 *       → 404; another organisation → 404; the download is audited (ids only)
 *   +   the FR-7 re-verification at render: a tampered citation is listed as
 *       dropped, never in Part B; the ops case file says which deliverable the
 *       case gets (variant)
 *  U5-d (UPL review 2026-10-23) no `clientLetter` / `wdtex` switches: the
 *       letter and the court-facing templates are withheld pending counsel
 *       (questions 8 and 9); unknown query parameters are ignored, never 400;
 *       the tool statement is on the first page; the writ posture prints the
 *       recorded inputs and the rule
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import type { MatterCreateInput } from '@hg/case-lifecycle';
import type { CounselPacketSection } from '@hg/reports';
import { getCaseFile } from '../src/services/case-file.service';

const run = `packet_${Date.now()}`;
const json = { 'content-type': 'application/json' };
const cookieFor = async (userId: string, tenantId: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

let proA: { userId: string; tenantId: string; orgId: string; cookie: string };
let proB: { userId: string; tenantId: string; orgId: string; cookie: string };
let family: { userId: string; tenantId: string; cookie: string };
let releasedCaseId: string;
let unreleasedCaseId: string;
let familyCaseId: string;
let goodFindingId: string;
let badFindingId: string;

const signup = async (tag: string) => {
  const res = await fastify.inject({
    method: 'POST', url: '/counsel/signup',
    payload: { email: `${run}_${tag}@example.com`, password: 'CorrectHorse9Battery!', name: `Counsel ${tag}`, barNumber: `2402${tag.length}`, practiceType: 'appellate' },
  });
  expect(res.statusCode).toBe(200);
  const { userId, organisationId } = res.json();
  const { tenantId } = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { userId, tenantId, orgId: organisationId as string, cookie: await cookieFor(userId, tenantId) };
};

const flag = async (tenantId: string, enabled: boolean) => {
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_tenantId: { flagKey: 'counsel_surfaces', tenantId } },
    create: { flagKey: 'counsel_surfaces', tenantId, enabled, updatedBy: 'test' },
    update: { enabled },
  });
  __invalidateFlagCache();
};

const get = (url: string, cookie = proA.cookie) => fastify.inject({ method: 'GET', url, headers: { cookie } });

const MATTER: MatterCreateInput = {
  vehicle: 'direct_appeal',
  lane: 'TRIAL',
  county: 'Harris',
  court: '176th District Court',
  causeNumber: '1234567',
  clientInitials: 'gw',
  sentenceImposedAt: '2026-09-01',
  judgmentSignedAt: '2026-09-03',
  noticeOfAppealFiledAt: '2026-09-20',
};

const openMatter = async (body: MatterCreateInput = MATTER) => {
  const res = await fastify.inject({ method: 'POST', url: '/counsel/matters', headers: { cookie: proA.cookie, ...json }, payload: body });
  expect(res.statusCode).toBe(201);
  return res.json().caseId as string;
};

beforeAll(async () => {
  proA = await signup('a');
  proB = await signup('b');
  const ft = await prisma.tenant.create({ data: { name: `${run}_family` } });
  const fu = await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: ft.id, role: 'CLIENT' } });
  family = { userId: fu.id, tenantId: ft.id, cookie: await cookieFor(fu.id, ft.id) };
  await flag(proA.tenantId, true);
  await flag(proB.tenantId, true);
  await flag(family.tenantId, true);

  releasedCaseId = await openMatter();
  unreleasedCaseId = await openMatter({ ...MATTER, clientInitials: 'ab' });
  familyCaseId = (await prisma.case.create({ data: { title: `${run}_family_case`, tenantId: family.tenantId, status: 'READY', lane: 'TRIAL', accessList: { create: { userId: family.userId, role: 'ADMIN' } } } })).id;

  // The record: one labelled reporter's-record volume, digitised, with the chunk the findings cite.
  const doc = await prisma.document.create({
    data: { filename: 'RR_Vol3_of_7.pdf', caseId: releasedCaseId, s3Key: `cases/${releasedCaseId}/rr3.pdf`, volumeKind: 'REPORTER', volumeLabel: 'RR vol. 3 of 7', volumeIndex: 3, volumeCount: 7, volumeConfirmed: true },
  });
  for (const pageNo of [1, 2]) {
    await prisma.documentPage.create({ data: { documentId: doc.id, pageNo, contentHash: `${run}_${pageNo}`, billable: true, ocrConfidence: 0.95, ocrProvider: 'pdf-text' } });
  }
  const chunk = await prisma.documentChunk.create({ data: { documentId: doc.id, content: `${run} Objection, Your Honor, hearsay. THE COURT: Overruled.`, metadata: {} } });
  const analysisRun = await prisma.analysisRun.create({ data: { caseId: releasedCaseId, tenantId: proA.tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
  const good = await prisma.finding.create({
    data: {
      runId: analysisRun.id, caseId: releasedCaseId, tenantId: proA.tenantId, stableKey: `${run}_pe`, category: 'preserved_error', screen: 'preserved_error', severity: 'dispositive', confidence: 0.9,
      preserved: 'yes', harmStandard: 'constitutional', vehicle: 'direct_appeal',
      partAText: 'The judge let in a statement the lawyer objected to.', partBText: 'Hearsay objection overruled; preserved by objection and ruling.',
      citations: { create: { documentId: doc.id, chunkId: chunk.id, volume: 'RR3', page: 214, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.', excerptHash: createHash('sha256').update(chunk.content).digest('hex') } },
    },
  });
  // A finding whose citation anchor no longer matches the chunk: FR-7 drops it at render.
  const bad = await prisma.finding.create({
    data: {
      runId: analysisRun.id, caseId: releasedCaseId, tenantId: proA.tenantId, stableKey: `${run}_brady`, category: 'brady', screen: 'brady', severity: 'dispositive', confidence: 0.8,
      partAText: 'A report the defense never received.', partBText: 'Brady materiality.',
      citations: { create: { documentId: doc.id, chunkId: chunk.id, volume: 'RR2', page: 116, excerpt: 'withheld pending the DPS supplemental report', excerptHash: 'tampered' } },
    },
  });
  goodFindingId = good.id;
  badFindingId = bad.id;
  const snap = (f: typeof good) => ({ id: f.id, category: f.category, severity: f.severity, confidence: f.confidence, provenance: 'ai', partAText: f.partAText, partBText: f.partBText, preserved: f.preserved ?? undefined, harmStandard: f.harmStandard ?? undefined, vehicle: f.vehicle ?? undefined, dependsOn: [] });
  await prisma.report.create({
    data: {
      caseId: releasedCaseId, tenantId: proA.tenantId, runId: analysisRun.id, versionNo: 1, templateVersion: 'AB-v2', approvedBy: 'auto_qa',
      findingsSnapshot: {
        findings: [
          { ...snap(good), citations: [{ volume: 'RR3', page: 214, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.' }] },
          { ...snap(bad), citations: [{ volume: 'RR2', page: 116, line: null, excerpt: 'withheld pending the DPS supplemental report' }] },
        ],
      },
    },
  });
});

afterAll(async () => {
  const tenants = [proA.tenantId, proB.tenantId, family.tenantId];
  await prisma.featureFlagOverride.deleteMany({ where: { tenantId: { in: tenants } } });
  __invalidateFlagCache();
  await prisma.report.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId: { in: tenants } } } });
  await prisma.finding.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.analysisRun.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.documentChunk.deleteMany({ where: { document: { case: { tenantId: { in: tenants } } } } });
  await prisma.documentPage.deleteMany({ where: { document: { case: { tenantId: { in: tenants } } } } });
  await prisma.document.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.checklistItem.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.matter.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

const ids = (s: CounselPacketSection[]) => s.map((x) => x.id);

describe('E10 — counsel packet routes', () => {
  it('serves the sections as JSON for a released report: Part B first, dropped listed as dropped, no letter and no certificate', async () => {
    const res = await get(`/counsel/matters/${releasedCaseId}/packet.json`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { caseId: string; versionNo: number; templateVersion: string; sections: CounselPacketSection[] };
    expect(body).toMatchObject({ caseId: releasedCaseId, versionNo: 1, templateVersion: 'counsel-v1' });
    expect(ids(body.sections)).toEqual(['cover', 'tool_statement', 'inventory', 'trap_chain', 'part_b', 'anders_appendix', 'verification_log']);

    // The tool statement names what ran: the lane's screens in the vehicle's order, the pages read, the render re-verification.
    const tool = body.sections[1] as Extract<CounselPacketSection, { id: 'tool_statement' }>;
    expect(tool.heading).toBe('Tool statement');
    expect(tool.paragraphs[0]).toContain('read 2 digitized pages from 1 file');
    expect(tool.paragraphs[0]).toMatch(/ran these screens over them: Preserved error — objections and rulings; Jury selection; /);
    expect(tool.paragraphs[0]).toMatch(/1 excerpt verified; 1 failed re-verification/);
    expect(tool.paragraphs.join(' ')).toMatch(/Counsel decides every use of this packet/);
    const all = JSON.stringify(body);
    expect(all).not.toMatch(/I certify|Counsel has|\bApplies\b|procedurally defaulted|\bMissed\b/);

    const cover = body.sections[0] as Extract<CounselPacketSection, { id: 'cover' }>;
    expect(cover.title).toBe('GW — Direct appeal');
    expect(cover.identifiers).toEqual(expect.arrayContaining([{ label: 'Cause number', value: '1234567' }, { label: 'Client', value: 'GW (initials only)' }]));
    // The solo organisation the sign-up created, named by the professional — the cover names it.
    expect(cover.organisationName).toBe('Counsel a');
    // Never a client name or an email address anywhere on the packet.
    expect(JSON.stringify(body)).not.toMatch(/@example\.com/);

    const inventory = body.sections.find((s) => s.id === 'inventory') as Extract<CounselPacketSection, { id: 'inventory' }>;
    expect(inventory.volumes).toEqual([expect.objectContaining({ kind: 'REPORTER', files: 1, pages: 2, items: ['RR vol. 3 of 7 — 2 pages, OCR 95%'] })]);
    expect(inventory.missing).toEqual(['RR vol. 1 of 7', 'RR vol. 2 of 7', 'RR vol. 4 of 7', 'RR vol. 5 of 7', 'RR vol. 6 of 7', 'RR vol. 7 of 7']);
    expect(inventory.bucket).toBe('SHORT');

    const trap = body.sections.find((s) => s.id === 'trap_chain') as Extract<CounselPacketSection, { id: 'trap_chain' }>;
    expect(trap.vehicle).toBe('direct_appeal');
    expect(trap.steps.find((s) => s.id === 'noa')).toMatchObject({ due: '2026-10-01', status: 'done', filedAt: '2026-09-20', jurisdiction: 'jurisdictional' });
    expect(trap.disclaimer).toMatch(/^Deadline vectors proposed; counsel-signed vectors pending/);

    const partB = body.sections.find((s) => s.id === 'part_b') as Extract<CounselPacketSection, { id: 'part_b' }>;
    expect(partB.retainedCount).toBe(1);
    expect(partB.groups).toEqual([expect.objectContaining({ screen: 'preserved_error', findings: [expect.objectContaining({ id: goodFindingId, cite: 'RR3 · p. 214 · l. 8', verifiedAgainstRecord: true, confidence: 0.9 })] })]);
    expect(partB.dropped).toEqual({ count: 1, items: [{ id: badFindingId, category: 'brady', severity: 'dispositive', cite: 'RR2 · p. 116' }] });

    const log = body.sections.find((s) => s.id === 'verification_log') as Extract<CounselPacketSection, { id: 'verification_log' }>;
    expect(log.ruleStatus).toBe('Proposed; finalisation pending');
    expect(log.heading).toBe('Record citation list — proposed TRAP 9.1(d)');
    expect(log).not.toHaveProperty('representation');
    expect(log.entries.map((e) => [e.findingId, e.status])).toEqual([[goodFindingId, 'verified at render'], [badFindingId, 'dropped']]);
  });

  it('ignores the former clientLetter / wdtex switches and any unknown query parameter: same sections, never a 400, never a letter', async () => {
    for (const q of ['?clientLetter=1&wdtex=1', '?wdtex=true', '?clientLetter=1', '?foo=bar&version=1']) {
      const res = await get(`/counsel/matters/${releasedCaseId}/packet.json${q}`);
      expect(res.statusCode, q).toBe(200);
      const sections = res.json().sections as CounselPacketSection[];
      expect(ids(sections), q).toEqual(['cover', 'tool_statement', 'inventory', 'trap_chain', 'part_b', 'anders_appendix', 'verification_log']);
      expect(JSON.stringify(sections), q).not.toMatch(/The judge let in a statement the lawyer objected to|I certify|Certificate of Independent Verification/);
    }
    const pdf = await get(`/counsel/matters/${releasedCaseId}/packet.pdf?clientLetter=1&wdtex=1`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('streams the PDF and audits the download with ids only', async () => {
    const res = await get(`/counsel/matters/${releasedCaseId}/packet.pdf`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`counsel-packet-${releasedCaseId}-v1.pdf`);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.length).toBeGreaterThan(5000);

    const audit = await prisma.auditLog.findFirst({ where: { caseId: releasedCaseId, action: 'PACKET_DOWNLOAD' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toMatchObject({ tenantId: proA.tenantId, userId: proA.userId, details: { format: 'pdf', versionNo: 1, organisationId: proA.orgId } });
    expect(audit!.details).not.toHaveProperty('clientLetter');
    expect(audit!.details).not.toHaveProperty('wdtex');
    expect(JSON.stringify(audit!.details)).not.toMatch(/GW|1234567|Harris/);
  });

  it('a writ matter prints the Art. 11.07 posture as the recorded inputs and the rule — "not recorded; counsel to confirm" until counsel records the merits fact', async () => {
    const writCaseId = await openMatter({ ...MATTER, vehicle: '11.07', clientInitials: 'rw', priorWrits: 1 });
    // A released report with nothing in it: the posture section does not depend on findings.
    const run = await prisma.analysisRun.create({ data: { caseId: writCaseId, tenantId: proA.tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
    await prisma.report.create({ data: { caseId: writCaseId, tenantId: proA.tenantId, runId: run.id, versionNo: 1, templateVersion: 'AB-v2', approvedBy: 'auto_qa', findingsSnapshot: { findings: [] } } });

    const before = await get(`/counsel/matters/${writCaseId}/packet.json`);
    expect(before.statusCode).toBe(200);
    const sections = before.json().sections as CounselPacketSection[];
    expect(ids(sections)).toEqual(['cover', 'tool_statement', 'inventory', 'trap_chain', 'part_b', 'posture_1107', 'verification_log']);
    const posture = sections.find((s) => s.id === 'posture_1107') as Extract<CounselPacketSection, { id: 'posture_1107' }>;
    const line = (label: string) => posture.lines.find((l) => l.label === label)?.value;
    expect(line('Prior applications recorded')).toBe('1');
    expect(line('Whether they were decided on the merits')).toBe('not recorded; counsel to confirm');
    expect(line('The rule as read here')).toBe('Under Article 11.07 §4 a later application must plead one of the statutory exceptions unless the earlier one was dismissed without reaching the merits.');
    expect(JSON.stringify(posture)).not.toMatch(/\bApplies\b|Subsequent application|ordinarily lost/);

    // Counsel records the fact on the matter (Case.facts; no column) and the packet prints it.
    const patched = await fastify.inject({ method: 'PATCH', url: `/counsel/matters/${writCaseId}`, headers: { cookie: proA.cookie, ...json }, payload: { priorWritsDecidedOnMerits: false } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().matter.priorWritsDecidedOnMerits).toBe(false);
    const after = await get(`/counsel/matters/${writCaseId}/packet.json`);
    const posture2 = (after.json().sections as CounselPacketSection[]).find((s) => s.id === 'posture_1107') as Extract<CounselPacketSection, { id: 'posture_1107' }>;
    expect(posture2.lines.find((l) => l.label === 'Whether they were decided on the merits')?.value).toBe('no');
    expect(posture2.notes.join(' ')).not.toMatch(/counsel to confirm/);
  });

  it('409 before a report is released', async () => {
    for (const url of [`/counsel/matters/${unreleasedCaseId}/packet.json`, `/counsel/matters/${unreleasedCaseId}/packet.pdf`]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(409);
      expect(res.json()).toMatchObject({ reason: 'NO_RELEASED_REPORT' });
    }
  });

  it('403 for a FAMILY account; 404 for another organisation; 404 for a family case with no matter', async () => {
    expect((await get(`/counsel/matters/${releasedCaseId}/packet.json`, family.cookie)).statusCode).toBe(403);
    expect((await get(`/counsel/matters/${releasedCaseId}/packet.pdf`, family.cookie)).statusCode).toBe(403);
    expect((await get(`/counsel/matters/${releasedCaseId}/packet.json`, proB.cookie)).statusCode).toBe(404);
    expect((await get(`/counsel/matters/${releasedCaseId}/packet.pdf`, proB.cookie)).statusCode).toBe(404);
    expect((await get(`/counsel/matters/${familyCaseId}/packet.json`)).statusCode).toBe(404);
  });

  it('404 everywhere when the flag is off', async () => {
    await flag(proA.tenantId, false);
    try {
      expect((await get(`/counsel/matters/${releasedCaseId}/packet.json`)).statusCode).toBe(404);
      expect((await get(`/counsel/matters/${releasedCaseId}/packet.pdf`)).statusCode).toBe(404);
    } finally {
      await flag(proA.tenantId, true);
    }
  });

  it('the ops case file says which deliverable a case gets', async () => {
    expect((await getCaseFile(releasedCaseId))?.case.variant).toBe('counsel');
    expect((await getCaseFile(familyCaseId))?.case.variant).toBe('family');
  });
});
