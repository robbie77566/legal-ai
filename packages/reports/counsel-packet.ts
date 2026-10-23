import {
  BRAND,
  VEHICLES,
  ANDERS_CHECKLIST,
  andersItemsForScreen,
  preservedLabel,
  harmLabel,
  vehicleLabel,
  hasStructuredFields,
  type CounselVehicle,
  type ScreenId,
  type TrapClock,
  type TrapStep,
  type Posture1107,
  type ExhaustionMap,
} from '@hg/case-lifecycle';
import { renderFamilyReportBody, type ReportFinding, type ReportPdfInput } from './family-report';
import { PALETTES, SITE, MARGIN, TONE_COLOR, severityLabel, createDocument, installFooter, renderBrandHeader, renderCoverStatement, ensureRoom, STATUTORY_FOOTER_SENTENCE, type Pdf } from './pdf-helpers';
import {
  ND_TEX_47_2_E_DISCLOSURE,
  TRAP_9_1_D_LOG,
  WD_TEX_CERTIFICATE,
  WORK_PRODUCT_FOOTER,
  PREPARED_LINE,
  instrumentStatusLine,
} from './disclosures';

/**
 * The counsel packet (persona_rollout_plan.md §3 writ practitioner / PD
 * appellate attorney, §5 E, January slice): a deliverable built for a
 * brief, not a family letter. Part B first; the optional Part A client
 * letter LAST, rendered by the family renderer's own content path so the
 * lawyer decides whether to hand it over.
 *
 * Like the family renderer this never touches the database. The caller
 * (apps/api counsel-packet.service) runs the FR-7 re-verification and hands
 * over two lists: the findings that verified at this render and the ones
 * that did not. The verified-against-record mark is derived from WHICH list
 * a finding is in — never from a flag a caller could set — and a dropped
 * finding is listed as dropped with its count, never silently removed.
 *
 * `counselPacketSections(input)` is the same content as structured JSON,
 * in packet order; the PDF and the web page render the same sections.
 *
 * The packet emits record citations and doctrine categories, never case
 * citations (attorney_offering_and_pricing.md). The disclosure text, the
 * 9.1(d) wording and the TRAP vectors are proposed/draft pending counsel
 * review and the packet says so where each appears.
 *
 * February slice (not here): grounds grouping with the §4 tag, affidavit
 * topics, the TRAP 48.4 checklist.
 */

export const COUNSEL_TEMPLATE_VERSION = 'counsel-v1';

export interface CounselPacketMatter {
  vehicle: CounselVehicle;
  county: string;
  court: string | null;
  causeNumber: string | null;
  /** Initials only — the packet never carries a client name. */
  clientInitials: string;
  priorWrits: number;
  subsequentWrit: boolean;
  lane?: 'TRIAL' | 'PLEA' | null;
}

/** The record inventory (apps/api inventory.service `Inventory` is structurally this). */
export interface CounselPacketInventory {
  volumes: Array<{
    kind: string;
    pages: number;
    ocrConfidence: number | null;
    docs: Array<{ label: string | null; filename: string; pages: number; digitised: boolean; ocrConfidence: number | null }>;
  }>;
  missing: Array<{ label: string }>;
  unknownCount: number;
  meteredPages: { reporter: number; clerk: number; exhibit: number; unknown: number; total: number };
  bucket: string;
  bucketNote: string | null;
}

export interface CounselPacketCitation {
  volume: string | null;
  page: number | null;
  line?: number | null;
  excerpt: string;
}

export interface CounselPacketFinding extends ReportFinding {
  /** The screen that grounded it (Finding.screen); the category stands in when absent. */
  screen?: string | null;
  citations: CounselPacketCitation[];
}

export interface CounselPacketInput {
  matter: CounselPacketMatter;
  organisationName: string;
  reportId: string;
  versionNo: number;
  /** The released report's template (AB-v2 …); the packet's own is COUNSEL_TEMPLATE_VERSION. */
  reportTemplateVersion: string;
  renderedAt: Date | string;
  changeNotes?: string[];
  /** Findings that passed FR-7 re-verification at this render — the only ones Part B prints. */
  findings: CounselPacketFinding[];
  /** Findings in the released snapshot that failed re-verification — listed as dropped, never silently removed. */
  droppedFindings: CounselPacketFinding[];
  inventory: CounselPacketInventory;
  trapClock: TrapClock;
  /** For writ vehicles (11.07 family); omitted otherwise. */
  posture?: Posture1107 | null;
  /** When the matter has grounds data (February); omitted otherwise. */
  exhaustion?: ExhaustionMap | null;
  /** Off by default: counsel's own certificate, printed only when asked for. */
  includeWdTexCertificate?: boolean;
  /** Off by default: the Part A letter, last, in the family voice. */
  includeClientLetter?: boolean;
  /** The family report input the letter is rendered from (required when includeClientLetter). */
  clientLetter?: ReportPdfInput | null;
  /** Test hook: uncompressed streams so assertions can read the text. */
  compress?: boolean;
}

// ── Sections (the JSON shape) ───────────────────────────────────────────────

export interface PartBFinding {
  id: string;
  category: string;
  screen: string;
  severity: string;
  severityLabel: string;
  confidence?: number;
  /** "RR3 · p. 214 · l. 12" for the primary citation. */
  cite: string;
  citations: Array<CounselPacketCitation & { where: string }>;
  partBText: string;
  harmStandard: string | null;
  preservation: string | null;
  vehicle: string | null;
  develop: string | null;
  dependsOn: string[];
  /** True only because the finding verified at this render (FR-7) — see the module note. */
  verifiedAgainstRecord: true;
}

export interface DroppedFinding {
  id: string;
  category: string;
  severity: string;
  /** Where the failed citation pointed; the excerpt is not reproduced. */
  cite: string;
}

export type CounselPacketSection =
  | {
      id: 'cover';
      title: string;
      identifiers: Array<{ label: string; value: string }>;
      organisationName: string;
      preparedLine: string;
      templateVersion: string;
      reportTemplateVersion: string;
      reportId: string;
      versionNo: number;
      renderedAt: string;
      changeNotes: string[];
      footer: string;
    }
  | { id: 'disclosure_47_2e'; heading: string; rule: string; status: string; reviewedBy: string | null; paragraphs: string[] }
  | {
      id: 'inventory';
      volumes: Array<{ kind: string; label: string; files: number; pages: number; ocrConfidence: number | null; items: string[] }>;
      missing: string[];
      unlabelled: { count: number; files: string[] };
      meteredPages: CounselPacketInventory['meteredPages'];
      bucket: string;
      bucketNote: string | null;
    }
  | {
      id: 'trap_chain';
      vehicle: CounselVehicle;
      vehicleLabel: string;
      asOf: string;
      steps: Array<{
        id: string;
        rule: string;
        label: string;
        due: string | null;
        status: TrapStep['status'];
        late: boolean;
        filedAt: string | null;
        jurisdiction: 'jurisdictional' | 'discretionary';
        confidence: TrapStep['confidence'];
        basis: string;
      }>;
      nextDue: TrapClock['nextDue'] | null;
      missedJurisdictional: boolean;
      unsignedCount: number;
      disclaimer: string | null;
      notes: string[];
    }
  | {
      id: 'part_b';
      groups: Array<{ screen: string; label: string; findings: PartBFinding[] }>;
      retainedCount: number;
      dropped: { count: number; items: DroppedFinding[] };
    }
  | {
      id: 'anders_appendix';
      items: Array<{
        id: string;
        phase: string;
        text: string;
        confidence: 'proposed' | 'signed';
        findings: Array<{ id: string; category: string; cite: string }>;
        note: string | null;
      }>;
      proposedCount: number;
      disclaimer: string;
    }
  | { id: 'posture_1107'; lines: Array<{ label: string; value: string }>; exceptions: Array<{ id: string; label: string; text: string }>; notes: string[]; confidence: 'proposed' | 'signed' }
  | { id: 'exhaustion_2254'; rule: string; grounds: ExhaustionMap['grounds']; summary: ExhaustionMap['summary']; mixedPetition: boolean; confidence: 'proposed' | 'signed' }
  | {
      id: 'verification_log';
      heading: string;
      rule: string;
      ruleStatus: string;
      representation: string;
      note: string;
      entries: Array<{ findingId: string; category: string; cite: string; volume: string | null; page: number | null; line: number | null; status: 'verified at render' | 'dropped' }>;
      verifiedCount: number;
      droppedCount: number;
    }
  | { id: 'wd_tex_certificate'; heading: string; rule: string; status: string; paragraphs: string[]; signatureLines: string[] }
  | { id: 'client_letter'; note: string; caseTitle: string; findings: Array<{ id: string; category: string; severity: string; partAText: string }> };

export type CounselPacketSectionId = CounselPacketSection['id'];

// ── Labels and helpers ──────────────────────────────────────────────────────

const SCREEN_IDS: readonly ScreenId[] = ['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification', 'plea_lane'];
const isScreenId = (s: unknown): s is ScreenId => typeof s === 'string' && (SCREEN_IDS as readonly string[]).includes(s);

/** Doctrine categories as a brief heads them — never a case name. */
export const SCREEN_LABELS: Record<ScreenId, string> = {
  preserved_error: 'Preserved error — objections and rulings',
  iac: 'Ineffective assistance of counsel',
  brady: 'Undisclosed evidence (Brady)',
  junk_science: 'Scientific evidence',
  sentencing: 'Sentencing and judgment',
  voir_dire: 'Jury selection',
  identification: 'Identification',
  plea_lane: 'The plea',
};

const VOLUME_KIND_LABEL: Record<string, string> = {
  REPORTER: "Reporter's record",
  CLERK: "Clerk's record",
  EXHIBIT: 'Exhibits',
  UNKNOWN: 'Not labelled',
};

/** "RR3 · p. 214 · l. 12" — the record cite a brief prints; "record (page not stated)" when nothing is known. */
export function recordCite(c: { volume?: string | null; page?: number | null; line?: number | null }): string {
  const parts = [c.volume ?? null, c.page != null ? `p. ${c.page}` : null, c.line != null ? `l. ${c.line}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'record (page not stated)';
}

const SEVERITY_RANK: Record<string, number> = { dispositive: 0, supportive: 1, background: 2 };

/** The screen a finding is grouped under: Finding.screen, else the category when it names a screen, else 'other'. */
export function screenOf(f: { screen?: string | null; category: string }): ScreenId | 'other' {
  if (isScreenId(f.screen)) return f.screen;
  if (isScreenId(f.category)) return f.category;
  return 'other';
}

/** Group order: the vehicle's weighted screens first, then the rest, then 'other'. */
function screenOrder(vehicle: CounselVehicle): Array<ScreenId | 'other'> {
  const weighted = VEHICLES[vehicle].weightedScreens;
  return [...weighted, ...SCREEN_IDS.filter((s) => !weighted.includes(s)), 'other'];
}

const civil = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const pct = (n: number | null) => (n == null ? 'not digitised' : `${Math.round(n * 100)}%`);

export const TRAP_UNSIGNED_DISCLAIMER = (unsigned: number, total: number) =>
  `Deadline vectors proposed; counsel-signed vectors pending (${unsigned} of ${total} step${total === 1 ? '' : 's'} unsigned). Every date is an estimate computed from the dates on the matter under the rule as recalled; counsel must verify each against the rules in force before relying on it.`;

export const ANDERS_DISCLAIMER =
  'A record of process supporting counsel\'s own reading of the record — never a certification that the record shows no error. Items are proposed until an appellate lawyer signs the checklist.';

const CLIENT_LETTER_NOTE =
  'Optional. The family-voice report for the client, in plain English, rendered by the same path the family product uses. Counsel decides whether, and in what form, to hand it over; it is not addressed to the client by the operator.';

function partBFinding(f: CounselPacketFinding): PartBFinding {
  const structured = hasStructuredFields(f);
  return {
    id: f.id,
    category: f.category,
    screen: screenOf(f),
    severity: f.severity,
    severityLabel: severityLabel(f.severity),
    ...(typeof f.confidence === 'number' ? { confidence: f.confidence } : {}),
    cite: f.citations.length ? recordCite(f.citations[0]) : recordCite({}),
    citations: f.citations.map((c) => ({ ...c, line: c.line ?? null, where: recordCite(c) })),
    partBText: f.partBText,
    harmStandard: structured ? harmLabel(f.harmStandard) : null,
    preservation: structured ? preservedLabel(f.preserved) : null,
    vehicle: structured ? vehicleLabel(f.vehicle) : null,
    develop: f.develop ?? null,
    dependsOn: f.dependsOn ?? [],
    verifiedAgainstRecord: true,
  };
}

// ── The sections ────────────────────────────────────────────────────────────

export function counselPacketSections(input: CounselPacketInput): CounselPacketSection[] {
  const { matter } = input;
  const spec = VEHICLES[matter.vehicle];
  const renderedAt = civil(input.renderedAt);
  const retained = input.findings;
  const dropped = input.droppedFindings;
  const out: CounselPacketSection[] = [];

  // (a) Cover
  out.push({
    id: 'cover',
    title: `${matter.clientInitials.toUpperCase()} — ${spec.label}`,
    identifiers: [
      { label: 'Vehicle', value: spec.label },
      { label: 'County', value: matter.county },
      { label: 'Court', value: matter.court ?? 'not recorded' },
      { label: 'Cause number', value: matter.causeNumber ?? 'not recorded' },
      { label: 'Client', value: `${matter.clientInitials.toUpperCase()} (initials only)` },
    ],
    organisationName: input.organisationName,
    preparedLine: PREPARED_LINE,
    templateVersion: COUNSEL_TEMPLATE_VERSION,
    reportTemplateVersion: input.reportTemplateVersion,
    reportId: input.reportId,
    versionNo: input.versionNo,
    renderedAt,
    changeNotes: input.changeNotes ?? [],
    footer: WORK_PRODUCT_FOOTER,
  });

  // (b) 47.2(e) block
  out.push({
    id: 'disclosure_47_2e',
    heading: ND_TEX_47_2_E_DISCLOSURE.heading,
    rule: ND_TEX_47_2_E_DISCLOSURE.rule,
    status: instrumentStatusLine(ND_TEX_47_2_E_DISCLOSURE),
    reviewedBy: ND_TEX_47_2_E_DISCLOSURE.reviewedBy ?? null,
    paragraphs: ND_TEX_47_2_E_DISCLOSURE.paragraphs({ renderedAt, retained: retained.length, dropped: dropped.length }),
  });

  // (c) Record inventory
  const inv = input.inventory;
  const unlabelled = inv.volumes.filter((v) => v.kind === 'UNKNOWN').flatMap((v) => v.docs.map((d) => d.filename));
  out.push({
    id: 'inventory',
    volumes: inv.volumes
      .filter((v) => v.docs.length > 0)
      .map((v) => ({
        kind: v.kind,
        label: VOLUME_KIND_LABEL[v.kind] ?? v.kind,
        files: v.docs.length,
        pages: v.pages,
        ocrConfidence: v.ocrConfidence,
        items: v.docs.map((d) => `${d.label ?? d.filename} — ${d.digitised ? `${d.pages} page${d.pages === 1 ? '' : 's'}, OCR ${pct(d.ocrConfidence)}` : 'not digitised'}`),
      })),
    missing: inv.missing.map((m) => m.label),
    unlabelled: { count: inv.unknownCount, files: unlabelled },
    meteredPages: inv.meteredPages,
    bucket: inv.bucket,
    bucketNote: inv.bucketNote,
  });

  // (d) TRAP chain
  const clock = input.trapClock;
  out.push({
    id: 'trap_chain',
    vehicle: clock.vehicle,
    vehicleLabel: VEHICLES[clock.vehicle].label,
    asOf: clock.asOf,
    steps: clock.steps.map((s) => ({
      id: s.id,
      rule: `${s.rule}${s.subdivision ?? ''}`,
      label: s.label,
      due: s.due,
      status: s.status,
      late: s.late,
      filedAt: s.filedAt ?? null,
      jurisdiction: s.jurisdictional ? 'jurisdictional' : 'discretionary',
      confidence: s.confidence,
      basis: s.basis,
    })),
    nextDue: clock.nextDue ?? null,
    missedJurisdictional: clock.missedJurisdictional,
    unsignedCount: clock.unsignedCount,
    disclaimer: clock.unsignedCount > 0 ? TRAP_UNSIGNED_DISCLAIMER(clock.unsignedCount, clock.steps.length) : null,
    notes: clock.notes,
  });

  // (e) Part B — grouped by screen, the vehicle's weighted screens first
  const byScreen = new Map<ScreenId | 'other', CounselPacketFinding[]>();
  for (const f of retained) {
    const s = screenOf(f);
    byScreen.set(s, [...(byScreen.get(s) ?? []), f]);
  }
  const groups = screenOrder(matter.vehicle)
    .filter((s) => byScreen.has(s))
    .map((s) => ({
      screen: s,
      label: s === 'other' ? 'Other findings' : SCREEN_LABELS[s],
      findings: [...(byScreen.get(s) ?? [])]
        .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
        .map(partBFinding),
    }));
  out.push({
    id: 'part_b',
    groups,
    retainedCount: retained.length,
    dropped: {
      count: dropped.length,
      items: dropped.map((f) => ({ id: f.id, category: f.category, severity: f.severity, cite: f.citations.length ? recordCite(f.citations[0]) : recordCite({}) })),
    },
  });

  // (f) Anders appendix — direct appeal only
  if (matter.vehicle === 'direct_appeal') {
    const onItem = new Map<string, Array<{ id: string; category: string; cite: string }>>();
    for (const f of retained) {
      const s = screenOf(f);
      if (s === 'other') continue;
      for (const item of andersItemsForScreen(s)) {
        onItem.set(item.id, [...(onItem.get(item.id) ?? []), { id: f.id, category: f.category, cite: f.citations.length ? recordCite(f.citations[0]) : recordCite({}) }]);
      }
    }
    const items = ANDERS_CHECKLIST.map((item) => {
      const findings = onItem.get(item.id) ?? [];
      const note = item.screenIds.length === 0 ? 'Process item — counsel\'s own step; no screen maps to it.' : findings.length === 0 ? 'No finding on this record.' : null;
      // The checklist's `source` (its provenance for the signer) is not printed: the packet carries no case citations.
      return { id: item.id, phase: item.phase, text: item.text, confidence: item.confidence, findings, note };
    });
    out.push({ id: 'anders_appendix', items, proposedCount: items.filter((i) => i.confidence !== 'signed').length, disclaimer: ANDERS_DISCLAIMER });
  }

  // (g) 11.07 posture; §2254 exhaustion map when grounds exist
  if (input.posture) {
    const p = input.posture;
    out.push({
      id: 'posture_1107',
      lines: [
        { label: 'Vehicle', value: VEHICLES[p.vehicle].label },
        { label: 'Authority', value: p.authority },
        { label: 'Prior applications on this conviction', value: String(matter.priorWrits) },
        { label: 'Subsequent application', value: p.subsequentWrit ? 'Yes — a prior application on this conviction was decided on the merits' : 'No' },
        { label: 'Subsequent-application bar', value: p.section4Bar ? 'Applies — the application must plead one of the exceptions below' : 'Does not apply' },
        { label: 'One-shot', value: p.oneShot ? 'First application: every ground not raised now is ordinarily lost' : 'Not the first application' },
        { label: 'Complete inventory', value: 'Treat the record inventory above as the inventory of what was reviewed; anything not listed there was not reviewed.' },
        { label: 'Premature filing', value: p.prematureFiling ? 'The direct appeal is pending: an application filed before the mandate issues is dismissed, not held' : 'No direct appeal recorded as pending' },
        { label: 'Rehearing', value: `${p.noRehearing.rule}: ${p.noRehearing.text}` },
        { label: 'Confidence', value: p.confidence },
      ],
      exceptions: p.exceptions,
      notes: p.notes,
      confidence: p.confidence,
    });
  }
  if (input.exhaustion) {
    const e = input.exhaustion;
    out.push({ id: 'exhaustion_2254', rule: e.rule, grounds: e.grounds, summary: e.summary, mixedPetition: e.mixedPetition, confidence: e.confidence });
  }

  // (h) Verification log — every record citation in the packet, once
  const seen = new Set<string>();
  const entries: Extract<CounselPacketSection, { id: 'verification_log' }>['entries'] = [];
  const addEntries = (list: CounselPacketFinding[], status: 'verified at render' | 'dropped') => {
    for (const f of list) {
      for (const c of f.citations) {
        const key = `${f.id}|${c.volume ?? ''}|${c.page ?? ''}|${c.line ?? ''}|${c.excerpt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ findingId: f.id, category: f.category, cite: recordCite(c), volume: c.volume, page: c.page, line: c.line ?? null, status });
      }
    }
  };
  addEntries(retained, 'verified at render');
  addEntries(dropped, 'dropped');
  out.push({
    id: 'verification_log',
    heading: TRAP_9_1_D_LOG.heading,
    rule: TRAP_9_1_D_LOG.rule,
    ruleStatus: TRAP_9_1_D_LOG.ruleStatus,
    representation: TRAP_9_1_D_LOG.representation,
    note: TRAP_9_1_D_LOG.note,
    entries,
    verifiedCount: entries.filter((e) => e.status === 'verified at render').length,
    droppedCount: entries.filter((e) => e.status === 'dropped').length,
  });

  // (i) W.D. Tex. certificate — optional
  if (input.includeWdTexCertificate) {
    out.push({
      id: 'wd_tex_certificate',
      heading: WD_TEX_CERTIFICATE.heading,
      rule: WD_TEX_CERTIFICATE.rule,
      status: instrumentStatusLine(WD_TEX_CERTIFICATE),
      paragraphs: WD_TEX_CERTIFICATE.paragraphs({ renderedAt }),
      signatureLines: WD_TEX_CERTIFICATE.signatureLines,
    });
  }

  // (j) Part A client letter — optional, last
  if (input.includeClientLetter && input.clientLetter) {
    const letter = input.clientLetter;
    out.push({
      id: 'client_letter',
      note: CLIENT_LETTER_NOTE,
      caseTitle: letter.caseTitle,
      findings: [...letter.strongSignals, ...letter.possibleIssues].map((f) => ({ id: f.id, category: f.category, severity: f.severity, partAText: f.partAText })),
    });
  }

  return out;
}

// ── The PDF ─────────────────────────────────────────────────────────────────

const INK: string = PALETTES.harbor.ink;
const ACCENT: string = PALETTES.harbor.accent;
const BODY = '#222222';
const MUTED = '#555555';

function h1(doc: Pdf, text: string) {
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(text);
  doc.moveDown(0.3);
}
function h2(doc: Pdf, text: string, color = INK) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(text);
  doc.moveDown(0.15);
}
function body(doc: Pdf, text: string, size = 9.5, color = BODY) {
  doc.font('Helvetica').fontSize(size).fillColor(color).text(text);
}
function muted(doc: Pdf, text: string, size = 8.5) {
  doc.font('Helvetica-Oblique').fontSize(size).fillColor(MUTED).text(text);
}
function kv(doc: Pdf, label: string, value: string, size = 9.5) {
  doc.font('Helvetica-Bold').fontSize(size).fillColor(INK).text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor(BODY).text(value);
}
function draftBanner(doc: Pdf, status: string) {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TONE_COLOR.review).text(status);
  doc.moveDown(0.2);
}

export function renderCounselPacketPdf(input: CounselPacketInput): Promise<Buffer> {
  const sections = counselPacketSections(input);
  const cover = sections[0] as Extract<CounselPacketSection, { id: 'cover' }>;
  const { doc, done } = createDocument({
    compress: input.compress ?? true,
    info: {
      Title: `${BRAND.name} — counsel packet — ${cover.title}`,
      Author: `${BRAND.name} (${SITE})`,
      Subject: `Counsel packet for report ${input.reportId} v${input.versionNo} (template ${COUNSEL_TEMPLATE_VERSION} over ${input.reportTemplateVersion}) — ${SITE}`,
    },
  });
  // UPL review 2026-10-23 (P7): the work-product footer plus the statutory
  // words on every page, and the statement with the AI label on the cover.
  installFooter(doc, `${WORK_PRODUCT_FOOTER} ${STATUTORY_FOOTER_SENTENCE}`);
  renderBrandHeader(doc);
  renderCoverStatement(doc);

  for (const s of sections) {
    switch (s.id) {
      case 'cover': {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text('Counsel packet');
        doc.font('Helvetica').fontSize(12).fillColor(INK).text(s.title);
        doc.moveDown(0.4);
        for (const i of s.identifiers) kv(doc, i.label, i.value);
        doc.moveDown(0.4);
        kv(doc, 'Prepared for', s.organisationName);
        body(doc, s.preparedLine, 9.5, MUTED);
        doc.moveDown(0.3);
        body(
          doc,
          `Report ${s.reportId} · version ${s.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · packet template ${s.templateVersion} · report template ${s.reportTemplateVersion}`,
          8.5,
          MUTED,
        );
        if (s.changeNotes.length) {
          doc.moveDown(0.2);
          muted(doc, `New since the prior version: ${s.changeNotes.join(' ')}`);
        }
        doc.moveDown(1);
        break;
      }
      case 'disclosure_47_2e': {
        // First page, under the cover block: the court-facing disclosure.
        doc.save().rect(MARGIN, doc.y, doc.page.width - MARGIN * 2, 0.75).fill('#999999').restore();
        doc.y += 8;
        h2(doc, s.heading);
        muted(doc, `${s.rule} · ${s.status}`);
        doc.moveDown(0.2);
        for (const p of s.paragraphs) {
          body(doc, p, 9);
          doc.moveDown(0.25);
        }
        doc.moveDown(0.8);
        break;
      }
      case 'inventory': {
        ensureRoom(doc, 220);
        h1(doc, 'Record inventory');
        muted(doc, 'What was reviewed, by volume, as the uploader labelled it. Anything not listed here was not reviewed.');
        doc.moveDown(0.3);
        for (const v of s.volumes) {
          h2(doc, `${v.label} — ${v.files} file${v.files === 1 ? '' : 's'}, ${v.pages} billable page${v.pages === 1 ? '' : 's'}, OCR confidence ${pct(v.ocrConfidence)}`);
          for (const line of v.items) body(doc, `• ${line}`, 9);
          doc.moveDown(0.3);
        }
        if (s.volumes.length === 0) body(doc, 'No documents on this matter.', 9.5, MUTED);
        kv(doc, 'Missing volumes', s.missing.length ? s.missing.join(', ') : 'none detected in the numbered sequence', 9);
        kv(doc, 'Unlabelled files', s.unlabelled.count ? `${s.unlabelled.count} — ${s.unlabelled.files.join(', ')}` : 'none', 9);
        kv(
          doc,
          'Metered pages',
          `reporter's record ${s.meteredPages.reporter} · clerk's record ${s.meteredPages.clerk} · exhibits ${s.meteredPages.exhibit} · unlabelled ${s.meteredPages.unknown} · total ${s.meteredPages.total}`,
          9,
        );
        kv(doc, 'Bucket', s.bucket + (s.bucketNote ? ` — ${s.bucketNote}` : ''), 9);
        doc.moveDown(1);
        break;
      }
      case 'trap_chain': {
        ensureRoom(doc, 220);
        h1(doc, `TRAP chain — ${s.vehicleLabel} (as of ${s.asOf})`);
        if (s.disclaimer) draftBanner(doc, s.disclaimer);
        if (s.steps.length === 0) body(doc, 'No TRAP steps are modelled for this vehicle.', 9.5, MUTED);
        for (const st of s.steps) {
          ensureRoom(doc, 80);
          const color = st.status === 'missed' ? TONE_COLOR.urgent : st.status === 'open' ? TONE_COLOR.review : BODY;
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(color).text(`${st.rule} — ${st.label}`, { continued: true });
          doc.font('Helvetica').fillColor(color).text(`  · due ${st.due ?? 'not yet'} · ${st.status.replace('_', ' ')}${st.late ? ' (late)' : ''} · ${st.jurisdiction} · ${st.confidence}`);
          muted(doc, st.basis, 8);
          doc.moveDown(0.2);
        }
        if (s.nextDue) kv(doc, 'Next due', `${s.nextDue.rule} on ${s.nextDue.due} (${s.nextDue.daysLeft} day${s.nextDue.daysLeft === 1 ? '' : 's'})`, 9);
        if (s.missedJurisdictional) doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TONE_COLOR.urgent).text('A jurisdictional step appears missed on the dates recorded — verify at once.');
        for (const n of s.notes) muted(doc, n, 8);
        doc.moveDown(1);
        break;
      }
      case 'part_b': {
        doc.addPage();
        h1(doc, 'Part B — findings on the record');
        muted(
          doc,
          `${s.retainedCount} finding${s.retainedCount === 1 ? '' : 's'} verified against the record at render; ${s.dropped.count} dropped at verification (listed at the end). Grouped by screen, the vehicle's weighted screens first. Record citations and doctrine categories only; no legal authorities.`,
        );
        doc.moveDown(0.5);
        let n = 1;
        for (const g of s.groups) {
          ensureRoom(doc, 160);
          h2(doc, g.label, ACCENT);
          for (const f of g.findings) {
            ensureRoom(doc, 140);
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TONE_COLOR[f.severity === 'dispositive' ? 'urgent' : f.severity === 'supportive' ? 'review' : 'muted']).text(`${n++}. ${f.category.replace(/_/g, ' ')} — ${f.severityLabel}`);
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1f6b2e').text('Verified against record at render', { continued: true });
            doc.font('Helvetica').fillColor(MUTED).text(`  · ${f.cite}${typeof f.confidence === 'number' ? ` · confidence ${Math.round(f.confidence * 100)}%` : ''}`);
            doc.moveDown(0.15);
            body(doc, f.partBText, 9.5);
            if (f.harmStandard || f.preservation) {
              doc.moveDown(0.15);
              body(doc, [f.preservation, f.vehicle, f.harmStandard].filter(Boolean).join(' · '), 8.5, '#444444');
            }
            if (f.develop) {
              doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444444').text('To develop: ', { continued: true }).font('Helvetica').text(f.develop);
            }
            if (f.dependsOn.length) muted(doc, `Depends on records not provided: ${f.dependsOn.join('; ')}`, 8.5);
            for (const c of f.citations) {
              doc.moveDown(0.15);
              doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(`${c.where}: “${c.excerpt}”`, { indent: 12 });
            }
            doc.moveDown(0.7);
          }
        }
        if (s.retainedCount === 0) body(doc, 'No finding on this record met the reporting threshold and verified at render.', 9.5, MUTED);
        ensureRoom(doc, 120);
        doc.moveDown(0.5);
        h2(doc, `Dropped at verification (${s.dropped.count})`, TONE_COLOR.review);
        if (s.dropped.count === 0) body(doc, 'None — every finding in the released snapshot re-verified against the record at this render.', 9, MUTED);
        for (const d of s.dropped.items) {
          body(doc, `• ${d.category.replace(/_/g, ' ')} — ${severityLabel(d.severity)} — ${d.cite} — dropped: the excerpt did not re-verify against the record at render and is not reproduced.`, 9);
        }
        doc.moveDown(1);
        break;
      }
      case 'anders_appendix': {
        doc.addPage();
        h1(doc, 'Anders appendix');
        draftBanner(doc, `${s.disclaimer} (${s.proposedCount} of ${s.items.length} items proposed.)`);
        for (const item of s.items) {
          ensureRoom(doc, 90);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${item.phase} · ${item.id.replace(/_/g, ' ')} · ${item.confidence}`);
          body(doc, item.text, 9);
          if (item.note) muted(doc, item.note, 8.5);
          for (const f of item.findings) body(doc, `• ${f.category.replace(/_/g, ' ')} — ${f.cite}`, 9, '#444444');
          doc.moveDown(0.5);
        }
        doc.moveDown(1);
        break;
      }
      case 'posture_1107': {
        ensureRoom(doc, 220);
        h1(doc, 'Art. 11.07 posture');
        draftBanner(doc, `Confidence: ${s.confidence} — the §4 reading is proposed until signed.`);
        for (const l of s.lines) kv(doc, l.label, l.value, 9);
        for (const e of s.exceptions) body(doc, `• Exception ${e.id} — ${e.label}: ${e.text}`, 9);
        for (const n of s.notes) muted(doc, n, 8);
        doc.moveDown(1);
        break;
      }
      case 'exhaustion_2254': {
        ensureRoom(doc, 200);
        h1(doc, '§2254 exhaustion map');
        draftBanner(doc, `Confidence: ${s.confidence}.`);
        muted(doc, s.rule, 8.5);
        for (const g of s.grounds) body(doc, `• ${g.id}: ${g.status.replace(/_/g, ' ')} — ${g.basis}`, 9);
        kv(doc, 'Summary', `${s.summary.exhausted} exhausted · ${s.summary.unexhausted} unexhausted · ${s.summary.procedurallyDefaulted} procedurally defaulted${s.mixedPetition ? ' · mixed petition' : ''}`, 9);
        doc.moveDown(1);
        break;
      }
      case 'verification_log': {
        doc.addPage();
        h1(doc, s.heading);
        draftBanner(doc, `${s.ruleStatus} — ${s.rule}`);
        body(doc, s.representation, 9);
        muted(doc, s.note, 8.5);
        doc.moveDown(0.4);
        for (const e of s.entries) {
          ensureRoom(doc, 40);
          doc.font('Helvetica').fontSize(9).fillColor(e.status === 'dropped' ? TONE_COLOR.review : BODY).text(`${e.cite} — ${e.category.replace(/_/g, ' ')} — ${e.status}`);
        }
        if (s.entries.length === 0) body(doc, 'No record citations in this packet.', 9, MUTED);
        doc.moveDown(0.4);
        kv(doc, 'Totals', `${s.verifiedCount} verified at render · ${s.droppedCount} dropped`, 9);
        doc.moveDown(1);
        break;
      }
      case 'wd_tex_certificate': {
        doc.addPage();
        h1(doc, s.heading);
        muted(doc, `${s.rule} · ${s.status}`);
        doc.moveDown(0.4);
        for (const p of s.paragraphs) {
          body(doc, p, 10);
          doc.moveDown(0.4);
        }
        doc.moveDown(0.8);
        for (const l of s.signatureLines) body(doc, l, 10);
        doc.moveDown(1);
        break;
      }
      case 'client_letter': {
        doc.addPage();
        h1(doc, 'Part A — client letter (optional)');
        muted(doc, s.note);
        doc.moveDown(0.4);
        doc.font('Helvetica').fontSize(10);
        renderFamilyReportBody(doc, { ...(input.clientLetter as ReportPdfInput), compress: input.compress });
        break;
      }
    }
  }

  doc.end();
  return done;
}
