/**
 * Counsel packet (persona_rollout_plan.md §5 E, January slice).
 *  E7  the Gary-shaped direct-appeal fixture renders every section, in order;
 *      the client letter and the W.D. Tex. certificate appear only when
 *      requested; the work-product footer is on every page
 *  E8  dropped findings are listed as dropped with their count and never
 *      appear in Part B; the verified mark is true for every retained
 *      finding; the 9.1(d) log lists each cite once
 *  E9  the TRAP section prints the proposed-vectors disclaimer when any
 *      vector is unsigned (today: always); the Anders appendix is omitted
 *      for an 11.07 matter while the posture section appears
 */
import { describe, it, expect } from 'vitest';
import { computeTrapClock, trapInputsForMatter, posture1107, ANDERS_CHECKLIST, unsignedVectors } from '@hg/case-lifecycle';
import { renderCounselPacketPdf, counselPacketSections, COUNSEL_TEMPLATE_VERSION, WORK_PRODUCT_FOOTER, type CounselPacketInput, type CounselPacketFinding, type CounselPacketSection } from '../index';
import { pdfText, pdfPageCount } from './pdf-text';

const finding = (id: string, screen: string, severity: string, cite: { volume: string; page: number; line?: number; excerpt: string }, extra: Partial<CounselPacketFinding> = {}): CounselPacketFinding => ({
  id,
  category: screen,
  screen,
  severity,
  confidence: 0.86,
  partAText: `Plain-English explanation for the family about ${screen}.`,
  partBText: `Precise statement for counsel about ${screen}, with the harm standard and preservation posture.`,
  citations: [{ volume: cite.volume, page: cite.page, line: cite.line ?? null, excerpt: cite.excerpt }],
  preserved: 'yes',
  harmStandard: 'constitutional',
  vehicle: 'direct_appeal',
  ...extra,
});

/** The Gary-shaped record (test-fixtures README: a 2019 Harris County trial, direct appeal). */
const RETAINED: CounselPacketFinding[] = [
  finding('f_pe', 'preserved_error', 'dispositive', { volume: 'RR4', page: 112, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.' }, { develop: 'Obtain the trial court\'s written ruling on the running objection.' }),
  finding('f_js', 'junk_science', 'supportive', { volume: 'RR3', page: 214, excerpt: 'The bite mark comparison testimony will be admitted.' }, { dependsOn: ['Volume 6 exhibits'] }),
  finding('f_iac', 'iac', 'background', { volume: 'RR5', page: 40, line: 3, excerpt: 'No motion to suppress was filed before trial.' }, { preserved: 'unknown', harmStandard: 'none', vehicle: 'writ' }),
];
const DROPPED: CounselPacketFinding[] = [
  finding('f_brady', 'brady', 'dispositive', { volume: 'RR2', page: 116, excerpt: 'withheld pending the DPS supplemental report' }),
];

const INVENTORY: CounselPacketInput['inventory'] = {
  volumes: [
    { kind: 'REPORTER', pages: 612, ocrConfidence: 0.97, docs: [
      { label: 'RR vol. 1 of 7', filename: 'rr1.pdf', pages: 80, digitised: true, ocrConfidence: 0.98 },
      { label: 'RR vol. 3 of 7', filename: 'rr3.pdf', pages: 532, digitised: true, ocrConfidence: 0.96 },
    ] },
    { kind: 'CLERK', pages: 140, ocrConfidence: 0.91, docs: [{ label: "Clerk's record", filename: 'cr.pdf', pages: 140, digitised: true, ocrConfidence: 0.91 }] },
    { kind: 'EXHIBIT', pages: 0, ocrConfidence: null, docs: [] },
    { kind: 'UNKNOWN', pages: 12, ocrConfidence: 0.7, docs: [{ label: null, filename: 'scan_0012.pdf', pages: 12, digitised: true, ocrConfidence: 0.7 }] },
  ],
  missing: [{ label: 'RR vol. 2 of 7' }],
  unknownCount: 1,
  meteredPages: { reporter: 612, clerk: 140, exhibit: 0, unknown: 12, total: 764 },
  bucket: 'EXTENDED',
  bucketNote: '12 pages are in files not yet labelled; they count toward the bucket only once they are.',
};

const directAppeal = (): CounselPacketInput => ({
  matter: { vehicle: 'direct_appeal', county: 'Harris', court: '176th District Court', causeNumber: '1234567', clientInitials: 'GW', priorWrits: 0, subsequentWrit: false, lane: 'TRIAL' },
  organisationName: 'Bexar County Public Defender — Appellate Division',
  reportId: 'rep_gary',
  versionNo: 2,
  reportTemplateVersion: 'AB-v2',
  renderedAt: new Date('2026-10-19T15:00:00Z'),
  changeNotes: ['Every issue now opens with a weight line.'],
  findings: RETAINED,
  droppedFindings: DROPPED,
  inventory: INVENTORY,
  trapClock: computeTrapClock(trapInputsForMatter({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-09-01', judgmentSignedAt: '2026-09-03', noticeOfAppealFiledAt: '2026-09-20' }, '2026-10-19')),
  compress: false,
});

const writ = (): CounselPacketInput => ({
  ...directAppeal(),
  matter: { vehicle: '11.07', county: 'Harris', court: null, causeNumber: null, clientInitials: 'GW', priorWrits: 1, subsequentWrit: true, lane: 'TRIAL' },
  trapClock: computeTrapClock(trapInputsForMatter({ vehicle: '11.07', judgmentSignedAt: '2019-03-01' }, '2026-10-19')),
  posture: posture1107({ vehicle: '11.07', priorWrits: 1 }),
});

const clientLetter = (): NonNullable<CounselPacketInput['clientLetter']> => ({
  caseTitle: 'GW — Direct appeal',
  reportId: 'rep_gary',
  versionNo: 2,
  templateVersion: 'AB-v2',
  renderedAt: new Date('2026-10-19T15:00:00Z'),
  subsequentWritMode: false,
  strongSignals: RETAINED.filter((f) => f.severity === 'dispositive'),
  possibleIssues: RETAINED.filter((f) => f.severity !== 'dispositive'),
  droppedByReverification: DROPPED.length,
  bottomLine: { headline: 'There is a real reason to talk to a lawyer.', body: ['One strong signal was confirmed against the record.'] },
});

const ids = (s: CounselPacketSection[]) => s.map((x) => x.id);
const section = <K extends CounselPacketSection['id']>(s: CounselPacketSection[], id: K) => s.find((x): x is Extract<CounselPacketSection, { id: K }> => x.id === id)!;
const order = (text: string, needles: string[]) => {
  let last = -1;
  for (const n of needles) {
    const at = text.indexOf(n, last + 1);
    expect(at, `"${n}" after position ${last}`).toBeGreaterThan(last);
    last = at;
  }
};

describe('E7 — Gary packet renders every section', () => {
  it('sections come in packet order, Part B first and the letter last', () => {
    const base = counselPacketSections(directAppeal());
    expect(ids(base)).toEqual(['cover', 'disclosure_47_2e', 'inventory', 'trap_chain', 'part_b', 'anders_appendix', 'verification_log']);
    const full = counselPacketSections({ ...directAppeal(), includeWdTexCertificate: true, includeClientLetter: true, clientLetter: clientLetter() });
    expect(ids(full)).toEqual(['cover', 'disclosure_47_2e', 'inventory', 'trap_chain', 'part_b', 'anders_appendix', 'verification_log', 'wd_tex_certificate', 'client_letter']);
    // The letter is off unless both the switch and the input are given.
    expect(ids(counselPacketSections({ ...directAppeal(), includeClientLetter: true }))).not.toContain('client_letter');
  });

  it('the cover carries the identifiers (initials only), the organisation, the prepared line and the template version', () => {
    const cover = section(counselPacketSections(directAppeal()), 'cover');
    expect(cover.title).toBe('GW — Direct appeal');
    expect(cover.identifiers).toEqual([
      { label: 'Vehicle', value: 'Direct appeal' },
      { label: 'County', value: 'Harris' },
      { label: 'Court', value: '176th District Court' },
      { label: 'Cause number', value: '1234567' },
      { label: 'Client', value: 'GW (initials only)' },
    ]);
    expect(cover.templateVersion).toBe(COUNSEL_TEMPLATE_VERSION);
    expect(cover.templateVersion).toBe('counsel-v1');
    expect(cover.reportTemplateVersion).toBe('AB-v2');
    expect(cover.preparedLine).toMatch(/Prepared at counsel's direction for counsel's use/);
    expect(cover.footer).toBe(WORK_PRODUCT_FOOTER);
    expect(cover.renderedAt).toBe('2026-10-19');
  });

  it('the 47.2(e) block names the tool, the render re-verification and the absence of legal authorities, and is marked draft', () => {
    const d = section(counselPacketSections(directAppeal()), 'disclosure_47_2e');
    expect(d.heading).toBe('Use of Generative Artificial Intelligence');
    expect(d.rule).toMatch(/N\.D\. Tex\. L\.Cr\.R\. 47\.2\(e\)/);
    expect(d.status).toMatch(/DRAFT/);
    expect(d.reviewedBy).toBeNull();
    const text = d.paragraphs.join(' ');
    expect(text).toContain('Snot Nose Legal case review');
    expect(text).toMatch(/re-verified, character for character, against the digitized record/);
    expect(text).toMatch(/cites no judicial decisions or other legal authorities/);
    expect(text).toContain('3 citation group(s) verified; 1 failed re-verification');
  });

  it('the inventory lists volumes, pages per kind, missing volumes, unlabelled files, OCR confidence and the bucket', () => {
    const inv = section(counselPacketSections(directAppeal()), 'inventory');
    expect(inv.volumes.map((v) => [v.kind, v.files, v.pages, v.ocrConfidence])).toEqual([
      ['REPORTER', 2, 612, 0.97],
      ['CLERK', 1, 140, 0.91],
      ['UNKNOWN', 1, 12, 0.7],
    ]);
    expect(inv.volumes[0].items[0]).toBe('RR vol. 1 of 7 — 80 pages, OCR 98%');
    expect(inv.missing).toEqual(['RR vol. 2 of 7']);
    expect(inv.unlabelled).toEqual({ count: 1, files: ['scan_0012.pdf'] });
    expect(inv.meteredPages.total).toBe(764);
    expect(inv.bucket).toBe('EXTENDED');
  });

  it('the TRAP chain prints each step with rule, due, status and the jurisdictional label', () => {
    const t = section(counselPacketSections(directAppeal()), 'trap_chain');
    expect(t.vehicleLabel).toBe('Direct appeal');
    expect(t.asOf).toBe('2026-10-19');
    expect(t.steps.length).toBeGreaterThan(2);
    const noa = t.steps.find((s) => s.rule.startsWith('TRAP 26.2'))!;
    expect(noa).toMatchObject({ due: '2026-10-01', status: 'done', late: false, filedAt: '2026-09-20', jurisdiction: 'jurisdictional', confidence: 'proposed' });
    expect(t.steps.every((s) => ['jurisdictional', 'discretionary'].includes(s.jurisdiction))).toBe(true);
  });

  it('the Anders appendix maps findings onto checklist items and says "no finding on this record" elsewhere', () => {
    const a = section(counselPacketSections(directAppeal()), 'anders_appendix');
    expect(a.items.map((i) => i.id)).toEqual(ANDERS_CHECKLIST.map((i) => i.id));
    expect(a.items.find((i) => i.id === 'expert_testimony')!.findings).toEqual([{ id: 'f_js', category: 'junk_science', cite: 'RR3 · p. 214' }]);
    expect(a.items.find((i) => i.id === 'jury_charge')!.findings.map((f) => f.id)).toEqual(['f_pe']);
    expect(a.items.find((i) => i.id === 'jury_selection')!.findings.map((f) => f.id)).toEqual(['f_pe']);
    expect(a.items.find((i) => i.id === 'plea_voluntariness')!.note).toBe('No finding on this record.');
    expect(a.items.find((i) => i.id === 'motion_to_withdraw')!.note).toMatch(/Process item/);
    expect(a.items.every((i) => i.confidence === 'proposed')).toBe(true);
    expect(a.proposedCount).toBe(ANDERS_CHECKLIST.length);
    // The dropped Brady finding never reaches the appendix.
    expect(a.items.flatMap((i) => i.findings.map((f) => f.id))).not.toContain('f_brady');
  });

  it('the PDF carries the sections in order, the optional pages only when asked, and the footer on every page', async () => {
    const base = await renderCounselPacketPdf(directAppeal());
    expect(base.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(base);
    order(text, ['Counsel packet', 'GW', 'Use of Generative Artificial Intelligence', 'Record inventory', 'TRAP chain', 'Part B', 'Anders appendix', 'Verification log']);
    expect(text).not.toContain('Certificate of Independent Verification');
    expect(text).not.toContain('client letter');
    expect(text).not.toContain('For your family');
    expect(text).toContain('counsel-v1');
    // The work-product footer on every page: the footer is written once per page.
    const pages = pdfPageCount(base);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(text.match(/ATTORNEY WORK PRODUCT/g)?.length).toBe(pages);

    const full = await renderCounselPacketPdf({ ...directAppeal(), includeWdTexCertificate: true, includeClientLetter: true, clientLetter: clientLetter() });
    const fullText = pdfText(full);
    order(fullText, ['Verification log', 'Certificate of Independent Verification', 'client letter', 'The bottom line', 'For your family (plain English)']);
    expect(fullText).toContain('Plain-English explanation for the family about preserved_error');
    const fullPages = pdfPageCount(full);
    expect(fullPages).toBeGreaterThan(pages);
    expect(fullText.match(/ATTORNEY WORK PRODUCT/g)?.length).toBe(fullPages);
    // No family footer leaks onto the packet pages.
    expect(fullText).not.toContain('does not create an attorney-client relationship');
  });

  it('never prints a case citation: doctrine categories and record cites only', () => {
    const text = JSON.stringify(counselPacketSections(directAppeal()));
    expect(text).not.toMatch(/\d+ S\.W\.\d?d \d+/);
    expect(text).not.toMatch(/\d+ U\.S\. \d+/);
  });
});

describe('E8 — dropped findings and the verified mark', () => {
  it('lists dropped findings as dropped with the count and never in Part B; every retained finding carries the mark', async () => {
    const s = counselPacketSections(directAppeal());
    const b = section(s, 'part_b');
    const retainedIds = b.groups.flatMap((g) => g.findings.map((f) => f.id));
    expect(retainedIds).toEqual(['f_pe', 'f_js', 'f_iac']); // vehicle order: preserved_error … junk_science … iac (direct_appeal weights)
    expect(retainedIds).not.toContain('f_brady');
    expect(b.retainedCount).toBe(3);
    expect(b.dropped).toEqual({ count: 1, items: [{ id: 'f_brady', category: 'brady', severity: 'dispositive', cite: 'RR2 · p. 116' }] });
    expect(b.groups.flatMap((g) => g.findings).every((f) => f.verifiedAgainstRecord === true)).toBe(true);
    expect(b.groups.map((g) => g.label)).toEqual(['Preserved error — objections and rulings', 'Scientific evidence', 'Ineffective assistance of counsel']);
    expect(b.groups[0].findings[0].cite).toBe('RR4 · p. 112 · l. 8');

    const text = pdfText(await renderCounselPacketPdf(directAppeal()));
    expect(text).toContain('Dropped at verification (1)');
    expect(text).toMatch(/brady .*Strong signal .*RR2 . p\. 116 .*dropped/);
    // The failed excerpt is never reproduced; the verified ones are.
    expect(text).not.toContain('withheld pending the DPS supplemental report');
    expect(text).toContain('The bite mark comparison testimony will be admitted.');
    expect((text.match(/Verified against record at render/g) ?? []).length).toBe(3);
  });

  it('the 9.1(d) log lists each cite once, verified or dropped, headed proposed', () => {
    const log = section(counselPacketSections(directAppeal()), 'verification_log');
    expect(log.ruleStatus).toBe('Proposed; finalisation pending');
    expect(log.heading).toMatch(/9\.1\(d\)/);
    expect(log.representation).toMatch(/Record citations are not fabricated/);
    expect(log.entries).toEqual([
      { findingId: 'f_pe', category: 'preserved_error', cite: 'RR4 · p. 112 · l. 8', volume: 'RR4', page: 112, line: 8, status: 'verified at render' },
      { findingId: 'f_js', category: 'junk_science', cite: 'RR3 · p. 214', volume: 'RR3', page: 214, line: null, status: 'verified at render' },
      { findingId: 'f_iac', category: 'iac', cite: 'RR5 · p. 40 · l. 3', volume: 'RR5', page: 40, line: 3, status: 'verified at render' },
      { findingId: 'f_brady', category: 'brady', cite: 'RR2 · p. 116', volume: 'RR2', page: 116, line: null, status: 'dropped' },
    ]);
    expect(log.verifiedCount).toBe(3);
    expect(log.droppedCount).toBe(1);
    // A finding citing the same passage twice is logged once.
    const twice = { ...directAppeal(), findings: [{ ...RETAINED[0], citations: [RETAINED[0].citations[0], { ...RETAINED[0].citations[0] }] }], droppedFindings: [] };
    expect(section(counselPacketSections(twice), 'verification_log').entries).toHaveLength(1);
  });

  it('an empty packet still says so: zero retained, zero dropped, no citations', async () => {
    const empty = { ...directAppeal(), findings: [], droppedFindings: [] };
    const s = counselPacketSections(empty);
    expect(section(s, 'part_b')).toMatchObject({ groups: [], retainedCount: 0, dropped: { count: 0, items: [] } });
    expect(section(s, 'verification_log').entries).toEqual([]);
    const text = pdfText(await renderCounselPacketPdf(empty));
    expect(text).toContain('Dropped at verification (0)');
    expect(text).toContain('No record citations in this packet.');
  });
});

describe('E9 — proposed vectors and the writ posture', () => {
  it('prints the proposed-vectors disclaimer whenever a step is unsigned (today: every step)', async () => {
    expect(unsignedVectors().length).toBeGreaterThan(0);
    const t = section(counselPacketSections(directAppeal()), 'trap_chain');
    expect(t.unsignedCount).toBe(t.steps.length);
    expect(t.disclaimer).toMatch(/^Deadline vectors proposed; counsel-signed vectors pending/);
    expect(pdfText(await renderCounselPacketPdf(directAppeal()))).toContain('Deadline vectors proposed; counsel-signed vectors pending');
    // Signed everywhere → no disclaimer (the clock's count drives it, not the vehicle).
    const signed = { ...directAppeal(), trapClock: { ...directAppeal().trapClock, unsignedCount: 0 } };
    expect(section(counselPacketSections(signed), 'trap_chain').disclaimer).toBeNull();
  });

  it('omits the Anders appendix for an 11.07 matter and prints the posture section instead', async () => {
    const s = counselPacketSections(writ());
    expect(ids(s)).toEqual(['cover', 'disclosure_47_2e', 'inventory', 'trap_chain', 'part_b', 'posture_1107', 'verification_log']);
    const p = section(s, 'posture_1107');
    expect(p.confidence).toBe('proposed');
    expect(p.lines.find((l) => l.label === 'Subsequent-application bar')!.value).toMatch(/^Applies/);
    expect(p.lines.find((l) => l.label === 'Authority')!.value).toBe('Tex. Code Crim. Proc. art. 11.07 §4');
    expect(p.exceptions.map((e) => e.id)).toEqual(['4(a)(1)', '4(a)(2)']);
    const text = pdfText(await renderCounselPacketPdf(writ()));
    expect(text).toContain('Art. 11.07 posture');
    expect(text).not.toContain('Anders appendix');
    expect(text).toContain('Deadline vectors proposed; counsel-signed vectors pending');
    // The 11.07 vehicle groups Part B with its own weights: iac before preserved_error.
    expect(section(s, 'part_b').groups.map((g) => g.screen)).toEqual(['iac', 'junk_science', 'preserved_error']);
  });

  it('omits the §2254 map without grounds data and prints it when the matter has some', () => {
    expect(ids(counselPacketSections(directAppeal()))).not.toContain('exhaustion_2254');
    const withMap = {
      ...writ(),
      exhaustion: { grounds: [{ id: 'g1', status: 'exhausted' as const, basis: 'Raised in an Art. 11.07 application and decided on the merits.' }], summary: { exhausted: 1, unexhausted: 0, procedurallyDefaulted: 0 }, mixedPetition: false, rule: 'rule text', confidence: 'proposed' as const },
    };
    const e = section(counselPacketSections(withMap), 'exhaustion_2254');
    expect(e.summary.exhausted).toBe(1);
  });
});
