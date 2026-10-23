import { BRAND } from '@hg/case-lifecycle';

/**
 * The statements the counsel packet carries, stored once so the PDF, the
 * JSON sections and the tests read the same words.
 *
 * UPL review 2026-10-23 (docs/compliance/upl_review_2026-10-23.md, P4,
 * recommendation 7): the court-facing templates that spoke in counsel's
 * name — the N.D. Tex. 47.2(e) block ("Counsel has independently verified…")
 * and the W.D. Tex. certificate ("I certify…") — are WITHHELD until Texas
 * counsel rules on them. In their place the packet prints one third-person
 * "Tool statement": what the software did, what it did not do, and that
 * counsel decides every use of it. Counsel may quote it or ignore it; nothing
 * in it speaks as counsel or says what counsel has done.
 *
 * None of these cite a legal authority. The packet emits record citations
 * and doctrine categories only.
 */

/** The tool, named the way a filing names it: the product, never a model. */
export const TOOL_NAME = `${BRAND.name} case review (${BRAND.site})`;

export interface DraftInstrument {
  id: string;
  heading: string;
  /** The rule or order the format follows, as the packet prints it. */
  rule: string;
  /** 'draft' until a lawyer sets `reviewedBy`; the packet marks the block for counsel review while it is. */
  status: 'draft' | 'reviewed';
  /** Name and bar number of the lawyer who reviewed the text; empty today. */
  reviewedBy?: string;
}

export interface ToolStatementContext {
  /** Civil date of the render. */
  renderedAt: string;
  /** Digitised pages the software read, and the files they came from. */
  pagesRead: number;
  filesRead: number;
  /** The screens that ran, as the packet labels them. */
  screens: string[];
  /** Quoted excerpts re-verified at render, and the ones that failed. */
  retained: number;
  dropped: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The first-page tool statement. Third person throughout: the subject of
 * every sentence is the software or counsel-as-decider, never "I" or
 * "counsel has". Written so counsel can lift it into a filing or leave it.
 */
export const TOOL_STATEMENT = {
  id: 'tool_statement' as const,
  heading: 'Tool statement',
  paragraphs: (ctx: ToolStatementContext): string[] => [
    `This packet was produced by ${TOOL_NAME}, software that reads a digitized court record and reports passages of it by volume, page and line. ` +
      `For this packet the software read ${plural(ctx.pagesRead, 'digitized page')} from ${plural(ctx.filesRead, 'file')} of the record as uploaded, ` +
      `ran these screens over them: ${ctx.screens.length ? ctx.screens.join('; ') : 'none recorded'}; ` +
      `and, at the time of rendering (${ctx.renderedAt}), re-verified each quoted excerpt, character for character, against the page it is cited to: ` +
      `${plural(ctx.retained, 'excerpt')} verified; ${ctx.dropped} failed re-verification and ${ctx.dropped === 1 ? 'is' : 'are'} listed as dropped, not relied on.`,
    'The software did not cite any legal authority, did not reach any legal conclusion, and did not prepare any filing. It reports what the record says and where the record says it; it does not say what the record means. The rules named in the deadline chain identify filing periods, not arguments.',
    "Counsel decides every use of this packet, including whether any part of it is read, relied on, disclosed to a court or shown to a client. Nothing in it is a statement by counsel, and nothing in it describes counsel's own work.",
  ],
};

/**
 * The per-citation list, drafted to the Supreme Court of Texas's PROPOSED
 * TRAP 9.1(d). Labelled "Proposed; finalisation pending" until a final order
 * issues (plan §7: 9.1(d) wording matched to the rule in force at the Deepen
 * gate). It lists; it makes no representation on anyone's behalf.
 */
export const TRAP_9_1_D_LOG: DraftInstrument & { ruleStatus: string; note: string } = {
  id: 'trap_9_1_d_log',
  heading: 'Record citation list — proposed TRAP 9.1(d)',
  rule: 'Tex. R. App. P. 9.1(d) (proposed)',
  status: 'draft',
  reviewedBy: undefined,
  ruleStatus: 'Proposed; finalisation pending',
  note: 'The rule is proposed, not in force. This list names the volume, page and line of the digitized record each citation was re-verified against at render; it will be matched to the rule in force when a final order issues.',
};

/**
 * Templates held back from the packet. Each is kept here, unrendered, so a
 * founder-merged change can restore it once counsel has ruled; nothing in
 * `counselPacketSections` reads them while `enabled` is false.
 */
export const WITHHELD_PENDING_COUNSEL = {
  // UPL review 2026-10-23: counsel decision pending (question 9)
  ndTex47_2e: {
    enabled: false as boolean,
    instrument: {
      id: 'nd_tex_47_2_e',
      heading: 'Use of Generative Artificial Intelligence',
      rule: 'N.D. Tex. L.Cr.R. 47.2(e) format',
      status: 'draft',
      reviewedBy: undefined,
    } satisfies DraftInstrument,
    paragraphs: ({ renderedAt, retained, dropped }: { renderedAt: string; retained: number; dropped: number }): string[] => [
      `Generative artificial intelligence was used in preparing this document. The tool used was ${TOOL_NAME}, which reads a digitized court record and reports passages of that record by volume, page and line, with the verbatim excerpt relied on.`,
      `Every record citation in this document was mechanically re-verified, character for character, against the digitized record at the time the document was rendered (${renderedAt}): ${retained} citation group(s) verified; ${dropped} failed re-verification and are listed as dropped, not relied on. Counsel has independently verified each citation against the official record before filing.`,
      'This document cites no judicial decisions or other legal authorities; the rules of appellate procedure named in its deadline chain identify filing deadlines, not arguments. The tool emits record citations and doctrine categories only; any authority in a filing built from it was located, read and verified by counsel.',
    ],
  },
  // UPL review 2026-10-23: counsel decision pending (question 9)
  wdTexCertificate: {
    enabled: false as boolean,
    instrument: {
      id: 'wd_tex_certificate',
      heading: 'Certificate of Independent Verification',
      rule: 'W.D. Tex. standing order on the use of artificial intelligence (Judge Gonzalez) format',
      status: 'draft',
      reviewedBy: undefined,
    } satisfies DraftInstrument,
    paragraphs: ({ renderedAt }: { renderedAt: string }): string[] => [
      `I certify that generative artificial intelligence (${TOOL_NAME}) was used to locate and excerpt passages of the appellate record in preparing this filing, and that the record citations it produced were re-verified against the digitized record by the tool on ${renderedAt}.`,
      'I further certify that I have personally and independently verified every record citation and every quotation in this filing against the official record, and every legal authority against the reporter in which it appears, and that each is accurate.',
      "No part of this filing was signed in reliance on the tool's output without that independent verification.",
    ],
    signatureLines: ['Counsel: ______________________________', 'State Bar No.: ________________________', 'Date: _________________________________'],
  },
  // UPL review 2026-10-23: counsel decision pending (question 8)
  clientLetter: {
    enabled: false as boolean,
    note: 'Optional. The family-voice report for the client, in plain English, rendered by the same path the family product uses. Counsel decides whether, and in what form, to hand it over; it is not addressed to the client by the operator.',
  },
};

/**
 * The work-product footer on every page of the counsel packet. The packet
 * is prepared at counsel's direction for counsel's use; it carries no
 * legal advice from the operator and no privilege of the operator's own.
 */
export const WORK_PRODUCT_FOOTER =
  "ATTORNEY WORK PRODUCT — prepared at counsel's direction for counsel's use. " +
  `${BRAND.name} · ${BRAND.site} · information about the contents of a court record, not legal advice; ` +
  'record citations and doctrine categories only, no legal authorities; every citation re-verified against the record at render.';

/** The one line on the cover under the matter identifiers. */
export const PREPARED_LINE = "Prepared at counsel's direction for counsel's use.";

/** What the packet prints next to any instrument that has not been reviewed. */
export function instrumentStatusLine(i: DraftInstrument): string {
  return i.reviewedBy ? `Reviewed by ${i.reviewedBy}` : 'DRAFT — for counsel review before use';
}
