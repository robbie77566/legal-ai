/**
 * Test helper: the text of an UNCOMPRESSED PDFKit document, in drawing
 * order. PDFKit writes built-in-font text as hex glyph strings inside
 * `[<…> n] TJ` arrays between BT/ET; the standard fonts use WinAnsi, so
 * the pairs decode as latin1. Each TJ array becomes one line.
 */
export function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const lines: string[] = [];
  for (const block of raw.matchAll(/BT([\s\S]*?)ET/g)) {
    for (const tj of block[1].matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const parts: string[] = [];
      for (const hex of tj[1].matchAll(/<([0-9a-fA-F]*)>/g)) parts.push(Buffer.from(hex[1], 'hex').toString('latin1'));
      lines.push(parts.join(''));
    }
  }
  return lines.join('\n');
}

/** Number of pages in the document (page objects, not the page tree). */
export function pdfPageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type \/Page(?![s])/g) ?? []).length;
}
