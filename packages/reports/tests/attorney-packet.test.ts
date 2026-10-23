import { describe, it, expect } from 'vitest';
import { NOT_A_LAW_FIRM, preservedLabel, vehicleLabel, harmLabel } from '@hg/case-lifecycle';
import { renderReportPdf, renderAttorneyPacketPdf, attorneyPacketSections, FOR_YOUR_LAWYER_COPY, ATTORNEY_PACKET_COVER_LINE, type ReportFinding, type DeadlinePostureView } from '../index';
import { pdfText } from './pdf-text';

/**
 * UPL review 2026-10-23, E2 (U3-a/U3-b at the renderer): with Part B sealed
 * the family PDF carries no attorney block and one "For your lawyer"
 * section; the attorney packet carries everything the family PDF dropped,
 * with the cover line and the statutory statement, and prints exactly the
 * sections `attorneyPacketSections` returns.
 */
const flat = (s: string) => s.replace(/\s+/g, ' ');
// pdfkit writes built-in-font text in WinAnsi, so the em dash and curly quotes do not decode as UTF-8: assert on fragments without them.
const LABELS = `${preservedLabel('yes')} · ${vehicleLabel('direct_appeal')} · ${harmLabel('constitutional')}`;

const strong: ReportFinding = {
  id: 'f_strong', category: 'sentencing', severity: 'dispositive', confidence: 0.9,
  partAText: 'The record shows a fine was added to a life sentence.',
  partBText: 'Fine assessed alongside a life sentence; compare the judgment against the punishment range.',
  citations: [{ volume: 'RR9', page: 40, excerpt: 'The fine of $10,000 is assessed in addition to the life sentence.' }],
  preserved: 'unknown', harmStandard: 'none', vehicle: 'either', develop: 'Obtain the judgment and sentence for each count.',
};
const possible: ReportFinding = {
  id: 'f_possible', category: 'junk_science', severity: 'supportive', confidence: 0.7,
  partAText: 'The record shows bite-mark comparison testimony was admitted over an objection.',
  partBText: 'Bite-mark comparison admitted over objection; preserved under TRAP 33.1.',
  citations: [{ volume: 'RR3', page: 214, excerpt: 'The bite mark comparison testimony will be admitted.' }],
  preserved: 'yes', harmStandard: 'constitutional', vehicle: 'direct_appeal',
  develop: 'Obtain the bite-mark analyst\'s report and qualifications.', dependsOn: ['Volume 6 exhibits'],
};
const posture: DeadlinePostureView = {
  finalityDate: '2020-03-01', finalityBasis: 'judgment plus 30 days, no appeal',
  aedpa: { daysElapsed: 400, daysTolled: 35, daysRemaining: 0, expired: true, estimatedExpiryDate: '2021-04-05', tollingNow: false },
  lachesUrgency: true, asOf: '2026-10-23',
};

const familyInput = {
  caseTitle: 'Harris County · 2019', reportId: 'rep_1', versionNo: 1, templateVersion: 'AB-v2', renderedAt: new Date('2026-10-23T12:00:00Z'),
  subsequentWritMode: false, strongSignals: [strong], possibleIssues: [possible], droppedByReverification: 0, compress: false,
};

describe('family PDF with Part B sealed', () => {
  it('omits the attorney block, the labels line, "To develop" and the counsel sections; prints "For your lawyer" in both languages', async () => {
    const text = flat(pdfText(await renderReportPdf({ ...familyInput, sealedPartB: true })));
    expect(text).not.toContain('For an attorney');
    expect(text).not.toContain('To develop');
    expect(text).not.toContain('For counsel');
    expect(text).not.toContain('Investigation checklist');
    expect(text).not.toContain(strong.partBText);
    expect(text).not.toContain('Preserved');
    expect(text).toContain('For your family (plain English)');
    expect(text).toContain(strong.partAText);
    expect(text).toContain(FOR_YOUR_LAWYER_COPY.en.title);
    expect(text).toContain('separate document: the attorney packet');
    expect(text).toContain(FOR_YOUR_LAWYER_COPY.es.title);
    expect(text).toContain(FOR_YOUR_LAWYER_COPY.en.download);
    expect(text).toContain(FOR_YOUR_LAWYER_COPY.es.download);
    // What the family can act on themselves stays: the records not provided.
    expect(text).toContain('Depends on records not provided: Volume 6 exhibits');
  });

  it('with the flag on (not sealed) the layout is exactly today\'s', async () => {
    const text = flat(pdfText(await renderReportPdf({ ...familyInput, sealedPartB: false })));
    expect(text).toContain('For an attorney');
    expect(text).toContain('To develop');
    expect(text).toContain('issues by priority');
    expect(text).toContain('Investigation checklist');
    expect(text).not.toContain(FOR_YOUR_LAWYER_COPY.en.title);
    const legacy = flat(pdfText(await renderReportPdf(familyInput)));
    expect(legacy).toBe(text); // the option defaults to the pre-split layout
  });
});

describe('attorney packet', () => {
  const input = {
    caseTitle: 'Harris County · 2019', reportId: 'rep_1', versionNo: 1, reportTemplateVersion: 'AB-v2', renderedAt: new Date('2026-10-23T12:00:00Z'),
    subsequentWritMode: false, findings: [strong, possible], droppedByReverification: 1,
    caseSummary: [
      { key: 'defendant', label: 'Person', value: 'GARY W. DOE', source: 'record' as const, cite: { volume: 'RR1', page: 3, quote: 'THE STATE OF TEXAS VS. GARY W. DOE' } },
      { key: 'county', label: 'County', value: 'Harris County', source: 'family' as const },
      { key: 'offense', label: 'Offense', value: null, source: null },
    ],
    posture: '1 finding(s) rated dispositive, 1 supportive, 0 background.',
    deadlinePosture: posture,
    compress: false,
  };

  it('sections in packet order, with every attorney field the family PDF dropped', () => {
    const sections = attorneyPacketSections(input);
    expect(sections.map((s) => s.id)).toEqual(['cover', 'case_summary', 'posture', 'time_computation', 'part_b', 'priority', 'checklist']);
    const cover = sections[0] as Extract<(typeof sections)[number], { id: 'cover' }>;
    expect(cover.coverLine).toEqual(ATTORNEY_PACKET_COVER_LINE);
    expect(cover.statement).toBe(NOT_A_LAW_FIRM);
    const partB = sections.find((s) => s.id === 'part_b') as Extract<(typeof sections)[number], { id: 'part_b' }>;
    expect(partB.findings.map((f) => f.partBText)).toEqual([strong.partBText, possible.partBText]);
    expect(partB.findings[1].labels).toBe(LABELS);
    expect(partB.findings[1].develop).toBe(possible.develop);
    expect(partB.droppedByReverification).toBe(1);
    const priority = sections.find((s) => s.id === 'priority') as Extract<(typeof sections)[number], { id: 'priority' }>;
    expect(priority.items.map((i) => i.category)).toEqual(['sentencing', 'junk_science']);
    expect(priority.unknownPreservation).toBe(1);
    const checklist = sections.find((s) => s.id === 'checklist') as Extract<(typeof sections)[number], { id: 'checklist' }>;
    expect(checklist.items).toHaveLength(2);
    const time = sections.find((s) => s.id === 'time_computation') as Extract<(typeof sections)[number], { id: 'time_computation' }>;
    expect(time.lines.map((l) => l.label)).toContain('Finality date, as given');
    expect(time.lines.find((l) => l.label === 'Computed days remaining')?.value).toMatch(/computed window ended on the dates given/);
    expect(JSON.stringify(sections)).not.toMatch(/CLOSED|will win|should file/);
  });

  it('the PDF prints every section: cover line, statutory statement, Part B, labels, develop, priority, checklist, time lines', async () => {
    const text = flat(pdfText(await renderAttorneyPacketPdf(input)));
    expect(text).toContain('Attorney packet');
    expect(text).toContain(ATTORNEY_PACKET_COVER_LINE.en);
    expect(text).toContain(ATTORNEY_PACKET_COVER_LINE.es);
    expect(text).toContain(NOT_A_LAW_FIRM);
    expect(text).toContain('does not itself create an attorney-client relationship or privilege');
    expect(text).toContain('For an attorney');
    expect(text).toContain(strong.partBText);
    expect(text).toContain(possible.partBText);
    expect(text).toContain(`${preservedLabel('yes')} · ${vehicleLabel('direct_appeal')}`); // the harm label carries an em dash, which WinAnsi does not decode
    expect(text).toContain(`To develop: ${possible.develop}`);
    expect(text).toContain('issues by priority');
    expect(text).toContain('Investigation checklist');
    expect(text).toContain('Time computation (as of 2026-10-23)');
    expect(text).toContain('Finality date, as given: 2020-03-01');
    expect(text).toContain('GARY W. DOE (RR1 p. 3)');
    expect(text).toContain('as the family stated');
    expect(text).toContain('1 failed re-verification');
    expect(text).not.toContain('For your family (plain English)');
    expect(text).not.toContain(strong.partAText);
    // Every section the JSON lists is on the page, by its heading.
    const headings: Record<string, string> = { cover: 'Attorney packet', case_summary: 'About this case', posture: 'Posture', time_computation: 'Time computation', part_b: 'findings on the record', priority: 'issues by priority', checklist: 'Investigation checklist' };
    for (const s of attorneyPacketSections(input)) expect(text, s.id).toContain(headings[s.id]);
  });

  it('a snapshot without the v2 fields renders Part B without labels and without the priority or checklist sections', () => {
    const legacy = attorneyPacketSections({ ...input, findings: [{ ...strong, preserved: undefined, harmStandard: undefined, vehicle: undefined, develop: undefined }], deadlinePosture: null, caseSummary: null, posture: null });
    expect(legacy.map((s) => s.id)).toEqual(['cover', 'part_b']);
    expect((legacy[1] as Extract<(typeof legacy)[number], { id: 'part_b' }>).findings[0].labels).toBeNull();
  });
});
