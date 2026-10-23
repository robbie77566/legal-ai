import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND, NOT_A_LAW_FIRM, AI_GENERATED_LABEL, STATUTORY_WORDS } from '@hg/case-lifecycle';

/**
 * PDFKit helpers shared by the family report (index.ts) and the counsel
 * packet (counsel-packet.ts): the palette, the page geometry, the footer
 * discipline and the brand header. Moved here verbatim from the family
 * renderer so that renderer's output is unchanged — nothing in this file
 * draws differently from what index.ts drew before the split.
 */

/** Brand palettes (color_research_landing.md §3) — semantic colors stay fixed. */
export const PALETTES = {
  amber: { accent: '#7a5f15', ink: '#1f2937' },
  harbor: { accent: '#1f5c99', ink: '#1a2433' },
  /** The brand (2026-09-13): ink headings, a highlighter rule as the signature. */
  snotnose: { accent: BRAND.colors.ink, ink: BRAND.colors.charcoal },
} as const;
export type ReportPalette = keyof typeof PALETTES;
export type PaletteColors = { accent: string; ink: string };

/** The logo file, when the PNG has been placed next to this package (docs/design/brand.md). */
export const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');
export function logoAvailable(): boolean {
  try { return fs.statSync(LOGO_PATH).isFile(); } catch { return false; }
}

export const SITE = 'snotnoselegal.com';
export const MARGIN = 54;

/**
 * The per-page footer's type size (UPL review 2026-10-23, E8/P7): raised
 * from 6.5 pt — unreadable in print — to 8.5 pt, and the footer wraps onto
 * up to three lines instead of being cut to one with an ellipsis.
 */
export const FOOTER_FONT_SIZE = 8.5;
const FOOTER_HEIGHT = 36;

/** The family PDF's per-page footer: the brand, the site, and the statement with the statutory words. */
export const FAMILY_FOOTER = `${BRAND.name} · ${SITE} · ${NOT_A_LAW_FIRM.en} No attorney-client relationship or privilege is created.`;

/** Appended to the counsel packet's work-product footer so every page carries the statutory words. */
export const STATUTORY_FOOTER_SENTENCE = `Not legal advice and ${STATUTORY_WORDS.en}.`;

/** Same reds/ambers the web report uses: urgent, review, muted. */
export const TONE_COLOR: Record<'urgent' | 'review' | 'muted', string> = { urgent: '#8a1c1c', review: '#8a4b00', muted: '#555555' };

export function severityLabel(s: string): string {
  return s === 'dispositive' ? 'Strong signal' : s === 'supportive' ? 'Possible issue' : 'Background';
}

export type Pdf = InstanceType<typeof PDFDocument>;

/** A letter-size document whose bytes resolve when `doc.end()` has flushed. */
export function createDocument(opts: { compress: boolean; info: { Title: string; Author: string; Subject: string } }): { doc: Pdf; done: Promise<Buffer> } {
  const doc = new PDFDocument({
    compress: opts.compress,
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN + 28, left: MARGIN, right: MARGIN },
    info: opts.info,
  });
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

/**
 * Footer discipline: save/restore covers graphics state but NOT the
 * text cursor — writing at the page bottom moves doc.y past the edge,
 * and if that happens while a text wrap is in flight, pdfkit adds a
 * page, which fires pageAdded, which writes a footer… (live 500 on the
 * first 73-finding report). Restore the cursor and guard re-entrancy.
 * Writes the footer on the current page and on every page added after.
 * The `height` option is what keeps pdfkit from adding a page when the
 * footer wraps: with a height set, the wrapper stops instead of paging.
 */
export function installFooter(doc: Pdf, text: string): void {
  let inFooter = false;
  const footer = () => {
    if (inFooter) return;
    inFooter = true;
    const { x, y } = doc;
    doc.save();
    doc.fontSize(FOOTER_FONT_SIZE).fillColor('#555555').font('Helvetica');
    doc.text(text, MARGIN, doc.page.height - MARGIN - 22, {
      width: doc.page.width - MARGIN * 2,
      height: FOOTER_HEIGHT,
      lineBreak: true,
      ellipsis: true,
    });
    doc.restore();
    doc.x = x;
    doc.y = y;
    inFooter = false;
  };
  footer();
  doc.on('pageAdded', footer);
}

/** Cover header: the logo when the file is present, else the lockup; then the highlighter stroke and the tagline. */
export function renderBrandHeader(doc: Pdf): void {
  if (logoAvailable()) {
    doc.image(LOGO_PATH, MARGIN, doc.y, { height: 64 });
    doc.y += 72;
  } else {
    doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND.colors.ink).text(BRAND.name);
  }
  // The highlighter stroke — the brand's signature mark, under the name.
  doc.save().rect(MARGIN, doc.y + 2, 150, 6).fill(BRAND.colors.highlight).restore();
  doc.y += 12;
  doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`${BRAND.tagline} · ${SITE}`);
}

/**
 * The cover statement (UPL review 2026-10-23, rec 1): the AI label and the
 * one statement at body size, under the brand header of both PDFs. Both
 * languages — the family may read either, and the PDF has no switch.
 */
export function renderCoverStatement(doc: Pdf): void {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555555').text(`${AI_GENERATED_LABEL.en} · ${AI_GENERATED_LABEL.es}`);
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor(BRAND.colors.charcoal).text(NOT_A_LAW_FIRM.en);
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor(BRAND.colors.charcoal).text(NOT_A_LAW_FIRM.es);
  doc.moveDown(0.4);
}

/** "RR3 p. 214" / "p. 214" / "" — the family wording for where a quote sits. */
export function citeWhere(c: { volume?: string | null; page?: number | null }): string {
  return [c.volume, c.page != null ? `p. ${c.page}` : null].filter(Boolean).join(' ');
}

/** Starts a new page when fewer than `need` points remain. */
export function ensureRoom(doc: Pdf, need: number): void {
  if (doc.y > doc.page.height - need) doc.addPage();
}
