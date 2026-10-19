import { BRAND } from '@hg/case-lifecycle';

/**
 * Court-facing disclosure instruments the counsel packet carries so the
 * lawyer's compliance cost is zero (attorney_offering_and_pricing.md,
 * "the verification posture should ship in the packet"). Each is DRAFT
 * text awaiting counsel review: `reviewedBy` is empty today and the packet
 * prints every block with its review status. Stored once, here, so the PDF,
 * the JSON sections and the tests read the same words.
 *
 * None of these cite a legal authority. The packet emits record citations
 * and doctrine categories only — the posture that keeps it on the right
 * side of every sanction the research found.
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

/**
 * First-page "Use of Generative Artificial Intelligence" block in the
 * N.D. Tex. Local Criminal Rule 47.2(e) format: names the tool, states that
 * every record citation was re-verified against the record at render, and
 * that no legal authorities are cited (so there is nothing to verify against
 * a reporter). Counsel adds the signature line of the filing it goes on.
 */
export const ND_TEX_47_2_E_DISCLOSURE: DraftInstrument & { paragraphs(ctx: { renderedAt: string; retained: number; dropped: number }): string[] } = {
  id: 'nd_tex_47_2_e',
  heading: 'Use of Generative Artificial Intelligence',
  rule: 'N.D. Tex. L.Cr.R. 47.2(e) format',
  status: 'draft',
  reviewedBy: undefined,
  paragraphs: ({ renderedAt, retained, dropped }) => [
    `Generative artificial intelligence was used in preparing this document. The tool used was ${TOOL_NAME}, which reads a digitized court record and reports passages of that record by volume, page and line, with the verbatim excerpt relied on.`,
    `Every record citation in this document was mechanically re-verified, character for character, against the digitized record at the time the document was rendered (${renderedAt}): ${retained} citation group(s) verified; ${dropped} failed re-verification and are listed as dropped, not relied on. Counsel has independently verified each citation against the official record before filing.`,
    'This document cites no judicial decisions or other legal authorities; the rules of appellate procedure named in its deadline chain identify filing deadlines, not arguments. The tool emits record citations and doctrine categories only; any authority in a filing built from it was located, read and verified by counsel.',
  ],
};

/**
 * The per-citation verification log, drafted to the Supreme Court of
 * Texas's PROPOSED TRAP 9.1(d) — the representation that "record citations
 * are not fabricated". Labelled "Proposed; finalisation pending" until a
 * final order issues (plan §7: 9.1(d) wording matched to the rule in force
 * at the Deepen gate).
 */
export const TRAP_9_1_D_LOG: DraftInstrument & { ruleStatus: string; representation: string; note: string } = {
  id: 'trap_9_1_d_log',
  heading: 'Verification log — proposed TRAP 9.1(d)',
  rule: 'Tex. R. App. P. 9.1(d) (proposed)',
  status: 'draft',
  reviewedBy: undefined,
  ruleStatus: 'Proposed; finalisation pending',
  representation: 'Record citations are not fabricated: each citation below names the volume, page and line of the digitized record it was re-verified against at render.',
  note: 'The rule is proposed, not in force. This log is drafted to the proposed text and will be matched to the rule in force when a final order issues.',
};

/**
 * Optional certificate of independent verification in the W.D. Tex. standing
 * order format (Judge Gonzalez). Off by default: it is counsel's certificate,
 * printed only when asked for, with blanks for counsel to complete.
 */
export const WD_TEX_CERTIFICATE: DraftInstrument & { paragraphs(ctx: { renderedAt: string }): string[]; signatureLines: string[] } = {
  id: 'wd_tex_certificate',
  heading: 'Certificate of Independent Verification',
  rule: 'W.D. Tex. standing order on the use of artificial intelligence (Judge Gonzalez) format',
  status: 'draft',
  reviewedBy: undefined,
  paragraphs: ({ renderedAt }) => [
    `I certify that generative artificial intelligence (${TOOL_NAME}) was used to locate and excerpt passages of the appellate record in preparing this filing, and that the record citations it produced were re-verified against the digitized record by the tool on ${renderedAt}.`,
    'I further certify that I have personally and independently verified every record citation and every quotation in this filing against the official record, and every legal authority against the reporter in which it appears, and that each is accurate.',
    'No part of this filing was signed in reliance on the tool\'s output without that independent verification.',
  ],
  signatureLines: ['Counsel: ______________________________', 'State Bar No.: ________________________', 'Date: _________________________________'],
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
