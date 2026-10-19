import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '@hg/case-lifecycle';

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
 */
export function installFooter(doc: Pdf, text: string): void {
  let inFooter = false;
  const footer = () => {
    if (inFooter) return;
    inFooter = true;
    const { x, y } = doc;
    doc.save();
    doc.fontSize(6.5).fillColor('#666666').font('Helvetica');
    doc.text(text, MARGIN, doc.page.height - MARGIN - 14, {
      width: doc.page.width - MARGIN * 2,
      height: 24,
      lineBreak: false,
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

/** "RR3 p. 214" / "p. 214" / "" — the family wording for where a quote sits. */
export function citeWhere(c: { volume?: string | null; page?: number | null }): string {
  return [c.volume, c.page != null ? `p. ${c.page}` : null].filter(Boolean).join(' ');
}

/** Starts a new page when fewer than `need` points remain. */
export function ensureRoom(doc: Pdf, need: number): void {
  if (doc.y > doc.page.height - need) doc.addPage();
}
