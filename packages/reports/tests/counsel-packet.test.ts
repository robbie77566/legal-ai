/**
 * Counsel packet (persona_rollout_plan.md §5 E, January slice), as revised by
 * the UPL review of 2026-10-23 (docs/compliance/upl_review_2026-10-23.md,
 * P4 P5 P6 P8 P9; workstream U5).
 *  E7  the Gary-shaped direct-appeal fixture renders every section, in order;
 *      the work-product footer is on every page
 *  E8  dropped findings are listed as dropped with their count and never
 *      appear in Part B; the verified mark is true for every retained
 *      finding; the record citation list names each cite once
 *  E9  the TRAP section prints the proposed-vectors disclaimer when any
 *      vector is unsigned (today: always); the Anders appendix is omitted
 *      for an 11.07 matter while the posture section appears
 *  U5-a the packet describes and never speaks as counsel: a third-person
 *      tool statement on the first page; no first-person counsel text, no
 *      "Counsel has", no "I certify", no "Applies", no "procedurally
 *      defaulted", no case names in the printed Anders text; no client
 *      letter section; no exhaustion section; the 11.07 posture prints the
 *      recorded inputs and the rule; "missed" prints as "Appears missed on
 *      the dates given"
 */
import { describe, it, expect } from 'vitest';
import { computeTrapClock, trapInputsForMatter, posture1107, ANDERS_CHECKLIST, unsignedVectors, STEP_STATUS_LABEL } from '@hg/case-lifecycle';
import { renderCounselPacketPdf, counselPacketSections, COUNSEL_TEMPLATE_VERSION, WORK_PRODUCT_FOOTER, WITHHELD_PENDING_COUNSEL, type CounselPacketInput, type CounselPacketFinding, type CounselPacketSection } from '../index';
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
  finding('f_pe', 'preserved_error', 'dispositive', { volume: 'RR4', page: 112, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.' }, { develop: "Obtain the trial court's written ruling on the running objection." }),
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

const writ = (decided: boolean | null = null): CounselPacketInput => ({
  ...directAppeal(),
  matter: { vehicle: '11.07', county: 'Harris', court: null, causeNumber: null, clientInitials: 'GW', priorWrits: 1, subsequentWrit: true, priorWritsDecidedOnMerits: decided, lane: 'TRIAL' },
  trapClock: computeTrapClock(trapInputsForMatter({ vehicle: '11.07', judgmentSignedAt: '2019-03-01' }, '2026-10-19')),
  posture: posture1107({ vehicle: '11.07', priorWrits: 1, priorWritsDecidedOnMerits: decided }),
});

/** The family report input the withheld Part A letter would be rendered from. */
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

/** Case names that appear in the Anders checklist's `text` / `source` and must never reach the packet. */
const CASE_NAMES = ['Anders v.', 'High v.', 'Kelly v.', 'Schulman', 'Bledsoe', 'Dears', 'Batson', 'Daubert', 'Almanza', 'Jackson v.', 'Brooks v.', 'Malik', 'Strickland', 'Thompson v.', 'Taylor v.', 'Bray v.', 'Olivo', 'Slaton', 'Verburgt', 'Torres', 'Johnson', 'Coleman', 'Nobles', 'Rose v.', 'Rhines', 'Richardson', 'Myers', 'Fearance', 'Gardner', 'Harrington', 'Martinez', 'Trevino', 'Bagley'];

describe('E7 — Gary packet renders every section', () => {
  it('sections come in packet order: cover, tool statement, inventory, clock, Part B, Anders, citation list — nothing else', () => {
    const base = counselPacketSections(directAppeal());
    expect(ids(base)).toEqual(['cover', 'tool_statement', 'inventory', 'trap_chain', 'part_b', 'anders_appendix', 'verification_log']);
    // The withheld paths are never emitted, even when the letter input is supplied.
    expect(ids(counselPacketSections({ ...directAppeal(), clientLetter: clientLetter() }))).toEqual(ids(base));
    expect(WITHHELD_PENDING_COUNSEL.clientLetter.enabled).toBe(false);
    expect(WITHHELD_PENDING_COUNSEL.wdTexCertificate.enabled).toBe(false);
    expect(WITHHELD_PENDING_COUNSEL.ndTex47_2e.enabled).toBe(false);
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
    expect(cover.footer).toBe(WORK_PRODUCT_FOOTER);
    expect(cover.renderedAt).toBe('2026-10-19');
  });

  it('the tool statement is third person: what the software did, what it did not do, and that counsel decides', () => {
    const t = section(counselPacketSections(directAppeal()), 'tool_statement');
    expect(t.heading).toBe('Tool statement');
    const text = t.paragraphs.join(' ');
    expect(text).toContain('Snot Nose Legal case review');
    // What it did: pages and files read, the screens, the render re-verification with counts.
    expect(text).toContain('read 764 digitized pages from 4 files');
    expect(text).toMatch(/ran these screens over them: Preserved error — objections and rulings; Jury selection; Identification; Sentencing and judgment; Scientific evidence; Ineffective assistance of counsel; Undisclosed evidence \(Brady\)/);
    expect(text).toMatch(/at the time of rendering \(2026-10-19\), re-verified each quoted excerpt, character for character, against the page it is cited to: 3 excerpts verified; 1 failed re-verification and is listed as dropped/);
    // What it did not do.
    expect(text).toMatch(/did not cite any legal authority, did not reach any legal conclusion, and did not prepare any filing/);
    // Counsel decides.
    expect(text).toMatch(/Counsel decides every use of this packet/);
    expect(text).toMatch(/Nothing in it is a statement by counsel, and nothing in it describes counsel's own work/);
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

  it('the TRAP chain prints each step with rule, due, status label and the jurisdictional label', () => {
    const t = section(counselPacketSections(directAppeal()), 'trap_chain');
    expect(t.vehicleLabel).toBe('Direct appeal');
    expect(t.asOf).toBe('2026-10-19');
    expect(t.steps.length).toBeGreaterThan(2);
    const noa = t.steps.find((s) => s.rule.startsWith('TRAP 26.2'))!;
    expect(noa).toMatchObject({ due: '2026-10-01', status: 'done', statusLabel: 'Filed', late: false, filedAt: '2026-09-20', jurisdiction: 'jurisdictional', confidence: 'proposed' });
    expect(t.steps.every((s) => ['jurisdictional', 'discretionary'].includes(s.jurisdiction))).toBe(true);
    expect(t.missedBanner).toBeNull();
  });

  it('a step past its due date prints "Appears missed on the dates given", never "Missed", and the banner says to verify with the rules in force', async () => {
    const late = { ...directAppeal(), trapClock: computeTrapClock(trapInputsForMatter({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-06-01' }, '2026-10-19')) };
    const t = section(counselPacketSections(late), 'trap_chain');
    const missed = t.steps.filter((s) => s.status === 'missed');
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((s) => s.statusLabel === 'Appears missed on the dates given')).toBe(true);
    expect(STEP_STATUS_LABEL.missed).toBe('Appears missed on the dates given');
    expect(t.missedJurisdictional).toBe(true);
    expect(t.missedBanner).toBe('A jurisdictional step appears missed on the dates given — verify at once with the rules in force.');
    const text = pdfText(await renderCounselPacketPdf(late));
    expect(text).toContain('Appears missed on the dates given');
    expect(text).toContain('verify at once with the rules in force');
    expect(text).not.toMatch(/· missed ·/);
    expect(text).not.toMatch(/\bMissed\b/);
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
    expect(a.disclaimer).toMatch(/what the software looked for and what it found on each item/);
    // The dropped Brady finding never reaches the appendix.
    expect(a.items.flatMap((i) => i.findings.map((f) => f.id))).not.toContain('f_brady');
  });

  it('the printed Anders text names no case: the signer-facing text and sources stay in the data', () => {
    const a = section(counselPacketSections(directAppeal()), 'anders_appendix');
    const printed = JSON.stringify(a);
    expect(printed).not.toMatch(/\bv\./);
    expect(printed).not.toMatch(/S\.W\./);
    expect(printed).not.toMatch(/U\.S\./);
    for (const name of CASE_NAMES) expect(printed, name).not.toContain(name);
    // The data still carries the sources for the signer; the printed text is a different field.
    expect(ANDERS_CHECKLIST.some((i) => /v\./.test(i.source) || /v\./.test(i.text))).toBe(true);
    for (const item of ANDERS_CHECKLIST) expect(a.items.find((i) => i.id === item.id)!.text).toBe(item.printedText);
  });

  it('the PDF carries the sections in order and the footer on every page; nothing withheld leaks in', async () => {
    const base = await renderCounselPacketPdf({ ...directAppeal(), clientLetter: clientLetter() });
    expect(base.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(base);
    order(text, ['Counsel packet', 'GW', 'Tool statement', 'Record inventory', 'TRAP chain', 'Part B', 'Anders appendix', 'Record citation list']);
    expect(text).not.toContain('Certificate of Independent Verification');
    expect(text).not.toContain('Use of Generative Artificial Intelligence');
    expect(text).not.toContain('client letter');
    expect(text).not.toContain('For your family');
    expect(text).not.toContain('The bottom line');
    expect(text).not.toContain('Plain-English explanation for the family');
    expect(text).not.toContain('does not create an attorney-client relationship');
    expect(text).toContain('counsel-v1');
    // The work-product footer on every page: the footer is written once per page.
    const pages = pdfPageCount(base);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(text.match(/ATTORNEY WORK PRODUCT/g)?.length).toBe(pages);
  });

  it('never prints a case citation: doctrine categories and record cites only', () => {
    const text = JSON.stringify(counselPacketSections(directAppeal()));
    expect(text).not.toMatch(/\d+ S\.W\.\d?d \d+/);
    expect(text).not.toMatch(/\d+ U\.S\. \d+/);
    expect(text).not.toMatch(/\bv\. /);
  });
});

describe('U5-a — the packet describes; it never speaks as counsel or concludes', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['first-person counsel text', /\bI certify\b|\bI further certify\b|\bI have personally\b/],
    ['what counsel has done', /\bCounsel has\b|\bcounsel has\b|\bCounsel personally\b|\bI have\b/],
    ['a bar "Applies"', /\bApplies\b/],
    ['"procedurally defaulted"', /procedurally defaulted/i],
    ['the lost-grounds verdict', /ordinarily lost/],
    ['"Subsequent application: Yes"', /Subsequent application/],
    ['"Missed" as a verdict', /\bMissed\b/],
    ['"exhausted" as a verdict', /\bexhausted\b/i],
  ];
  for (const fixture of [directAppeal, () => writ(), () => writ(true), () => writ(false)]) {
    it(`JSON and PDF for ${fixture().matter.vehicle} (decided: ${String(fixture().matter.priorWritsDecidedOnMerits ?? 'not recorded')})`, async () => {
      const sections = counselPacketSections(fixture());
      const json = JSON.stringify(sections);
      const text = pdfText(await renderCounselPacketPdf(fixture()));
      for (const [what, re] of FORBIDDEN) {
        expect(json, `${what} in JSON`).not.toMatch(re);
        expect(text, `${what} in PDF`).not.toMatch(re);
      }
      expect(ids(sections)).not.toContain('client_letter');
      expect(ids(sections)).not.toContain('exhaustion_2254');
      expect(ids(sections)).not.toContain('wd_tex_certificate');
      expect(ids(sections)).not.toContain('disclosure_47_2e');
      expect(ids(sections)[1]).toBe('tool_statement');
    });
  }
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

  it('the record citation list names each cite once, verified or dropped, headed proposed, with no representation', () => {
    const log = section(counselPacketSections(directAppeal()), 'verification_log');
    expect(log.ruleStatus).toBe('Proposed; finalisation pending');
    expect(log.heading).toBe('Record citation list — proposed TRAP 9.1(d)');
    expect(log).not.toHaveProperty('representation');
    expect(JSON.stringify(log)).not.toMatch(/not fabricated/);
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
    expect(section(s, 'tool_statement').paragraphs[0]).toContain('0 excerpts verified; 0 failed re-verification');
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

  it('omits the Anders appendix for an 11.07 matter and prints the posture as recorded inputs and the rule', async () => {
    const s = counselPacketSections(writ());
    expect(ids(s)).toEqual(['cover', 'tool_statement', 'inventory', 'trap_chain', 'part_b', 'posture_1107', 'verification_log']);
    const p = section(s, 'posture_1107');
    expect(p.confidence).toBe('proposed');
    const line = (label: string) => p.lines.find((l) => l.label === label)!.value;
    expect(line('Rule')).toBe('Tex. Code Crim. Proc. art. 11.07 §4');
    expect(line('Prior applications recorded')).toBe('1');
    expect(line('Whether they were decided on the merits')).toBe('not recorded; counsel to confirm');
    expect(line('The rule as read here')).toBe('Under Article 11.07 §4 a later application must plead one of the statutory exceptions unless the earlier one was dismissed without reaching the merits.');
    expect(p.lines.map((l) => l.label)).not.toContain('Subsequent-application bar');
    expect(p.lines.map((l) => l.label)).not.toContain('One-shot');
    // The statute's exceptions are printed as the rule's words, not as a verdict that they must be met.
    expect(p.exceptions.map((e) => e.id)).toEqual(['4(a)(1)', '4(a)(2)']);
    expect(p.notes.join(' ')).toMatch(/not recorded on this matter; counsel to confirm/);
    // (pdf-text drops em dashes and splits a label from its value, so the PDF assertions read around both.)
    const text = pdfText(await renderCounselPacketPdf(writ()));
    expect(text).toContain('Art. 11.07 posture');
    expect(text).toContain('recorded inputs and the rule');
    expect(text).toMatch(/Prior applications recorded:\s*1/);
    expect(text).toContain('not recorded; counsel to confirm');
    expect(text).not.toContain('Anders appendix');
    expect(text).toContain('Deadline vectors proposed; counsel-signed vectors pending');
    // The 11.07 vehicle groups Part B with its own weights: iac before preserved_error.
    expect(section(s, 'part_b').groups.map((g) => g.screen)).toEqual(['iac', 'junk_science', 'preserved_error']);
  });

  it('prints the recorded merits fact when counsel has recorded it — "yes" or "no" — with no note to confirm', () => {
    const yes = section(counselPacketSections(writ(true)), 'posture_1107');
    expect(yes.lines.find((l) => l.label === 'Whether they were decided on the merits')!.value).toBe('yes');
    expect(yes.notes.join(' ')).not.toMatch(/counsel to confirm/);
    const no = section(counselPacketSections(writ(false)), 'posture_1107');
    expect(no.lines.find((l) => l.label === 'Whether they were decided on the merits')!.value).toBe('no');
  });

  it('has no exhaustion section: the §2254 map is not part of the packet', () => {
    expect(ids(counselPacketSections(directAppeal()))).not.toContain('exhaustion_2254');
    expect(ids(counselPacketSections(writ()))).not.toContain('exhaustion_2254');
    expect(JSON.stringify(counselPacketSections(writ()))).not.toMatch(/exhaustion/i);
  });
});
