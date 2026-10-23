/**
 * @hg/reports — the PDFs the product delivers.
 *
 *  - family-report.ts   the family case review (Part A + Part B, ENG-11)
 *  - attorney-packet.ts the sealed attorney packet of the family product (UPL review 2026-10-23, E2)
 *  - counsel-packet.ts  the counsel packet (Part B first; persona plan §5 E)
 *  - disclosures.ts     the court disclosure instruments the packet carries
 *  - pdf-helpers.ts     the PDFKit palette, footer and header both share
 */
export * from './family-report';
export { LOGO_PATH, logoAvailable, SITE, type ReportPalette } from './pdf-helpers';
export * from './attorney-packet';
export * from './counsel-packet';
export * from './disclosures';
