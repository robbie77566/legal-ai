import crypto from 'crypto';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';

/**
 * Real digitization (M3, replacing the register's last mocked worker):
 * bytes → per-page text + confidence → the DocumentPage billable ledger
 * (ENG-3) → real DocumentChunks for analysis → doc.ocr_done events → the
 * E-1 low-confidence halt.
 *
 * Extraction is an injectable seam: production uses pdf-parse for
 * born-digital PDFs and falls back to Textract for scans/images
 * (per-page confidence is the NFR-6 signal); tests inject deterministic
 * extractors.
 */

export interface PageExtraction {
  text: string;
  /** 0..1; born-digital text is 1. */
  confidence: number;
}

export interface Extractor {
  extract(input: { bytes: Buffer; filename: string; s3Key: string }): Promise<PageExtraction[]>;
}

const LOW_CONFIDENCE = 0.6;
const HALT_SHARE = 0.3; // E-1: >30% low-confidence pages halts before Tier-2 spend
const CHUNK_CHARS = 1500;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Born-digital PDFs: pdf-parse per-page text; empty/thin text means "scan". */
export async function extractPdfText(bytes: Buffer): Promise<PageExtraction[] | null> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const res = await parser.getText();
    const pages: { text?: string }[] =
      (res as { pages?: { text?: string }[] }).pages ?? [{ text: res.text }];
    const extractions = pages.map((p) => ({ text: (p.text ?? '').trim(), confidence: 1 }));
    const avgChars =
      extractions.reduce((s, p) => s + p.text.length, 0) / Math.max(extractions.length, 1);
    // A "PDF" whose pages average <40 chars is a scan wearing a PDF coat.
    return avgChars >= 40 ? extractions : null;
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export function buildDefaultExtractor(): Extractor {
  return {
    async extract({ bytes, filename, s3Key }) {
      if (filename.toLowerCase().endsWith('.pdf')) {
        const born = await extractPdfText(bytes);
        if (born) return born;
      }
      // Scans and images → Textract. Async API for PDFs (S3-addressed),
      // sync for single images.
      const { TextractClient, DetectDocumentTextCommand, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } =
        await import('@aws-sdk/client-textract');
      const region = (process.env.AWS_REGION ?? 'us-east-2').replace(/"/g, '');
      const client = new TextractClient({ region });
      const bucket = (process.env.S3_BUCKET ?? '').replace(/"/g, '');

      if (filename.toLowerCase().endsWith('.pdf')) {
        const start = await client.send(
          new StartDocumentTextDetectionCommand({
            DocumentLocation: { S3Object: { Bucket: bucket, Name: s3Key } },
          })
        );
        // Poll (M4 moves this to delayed jobs; acceptable inside a worker now).
        // Transient throttles/stale-IAM denials on the poll must not burn the
        // whole OCR job — treat them as "still in progress" for a bounded
        // number of grace attempts.
        let pollGraceLeft = 12;
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const pageMap = new Map<number, { texts: string[]; confs: number[] }>();
          let next: string | undefined;
          let first;
          try {
            first = await client.send(
              new GetDocumentTextDetectionCommand({ JobId: start.JobId })
            );
          } catch (e) {
            const name = (e as { name?: string }).name ?? '';
            if (
              pollGraceLeft > 0 &&
              /AccessDenied|Throttling|ProvisionedThroughputExceeded|LimitExceeded/.test(name)
            ) {
              pollGraceLeft--;
              console.warn(`[digitize] poll blip (${name}) — retrying (${pollGraceLeft} grace left)`);
              continue;
            }
            throw e;
          }
          if (first.JobStatus === 'IN_PROGRESS') continue;
          if (first.JobStatus !== 'SUCCEEDED') throw new Error(`Textract ${first.JobStatus}`);
          let page = first;
          for (;;) {
            for (const b of page.Blocks ?? []) {
              if (b.BlockType === 'LINE' && b.Page) {
                const e = pageMap.get(b.Page) ?? { texts: [], confs: [] };
                e.texts.push(b.Text ?? '');
                if (typeof b.Confidence === 'number') e.confs.push(b.Confidence);
                pageMap.set(b.Page, e);
              }
            }
            next = page.NextToken;
            if (!next) break;
            page = await client.send(
              new GetDocumentTextDetectionCommand({ JobId: start.JobId, NextToken: next })
            );
          }
          const total = Math.max(...pageMap.keys(), 1);
          return Array.from({ length: total }, (_, i2) => {
            const e = pageMap.get(i2 + 1) ?? { texts: [], confs: [] };
            const conf = e.confs.length ? e.confs.reduce((s, c) => s + c, 0) / e.confs.length / 100 : 0;
            return { text: e.texts.join('\n'), confidence: conf };
          });
        }
        throw new Error('Textract polling timed out');
      }

      const res = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } }));
      const lines = (res.Blocks ?? []).filter((b) => b.BlockType === 'LINE');
      const conf = lines.length
        ? lines.reduce((s, b) => s + (b.Confidence ?? 0), 0) / lines.length / 100
        : 0;
      return [{ text: lines.map((b) => b.Text ?? '').join('\n'), confidence: conf }];
    },
  };
}

/**
 * Echo-back classification (US-2, UI spec §5.5): a deterministic first pass
 * over the extracted text proposes which checklist item this document is.
 * The Tier-1 model classifier (M4 remainder) will replace the heuristics;
 * the contract — suggestion + customer confirm/correct — stays.
 */
const KIND_PATTERNS: [string, RegExp][] = [
  ['rr_volume', /REPORTER'?S\s+RECORD/i],
  ['clerks_record', /CLERK'?S\s+RECORD/i],
  ['indictment', /\bINDICTMENT\b|THE GRAND JUR/i],
  ['appellate_opinion', /COURT OF APPEALS[\s\S]{0,200}?(OPINION|MEMORANDUM)/i],
  ['prior_writ_application', /APPLICATION FOR (A )?WRIT OF HABEAS CORPUS/i],
  ['admonishments', /ADMONISHMENT/i],
  ['judicial_confession', /JUDICIAL CONFESSION/i],
  ['plea_agreement', /PLEA (BARGAIN|AGREEMENT)/i],
  ['plea_papers', /WAIVER OF JURY|PLEA OF GUILTY/i],
  ['judgment', /JUDGMENT/i],
];

export function classifyKind(text: string): string | null {
  const head = text.slice(0, 6000);
  for (const [kind, re] of KIND_PATTERNS) {
    if (re.test(head)) return kind;
  }
  return null;
}

/** Malware-scan seam (ENG-4): clamd INSTREAM when CLAMD_HOST is set. */
export interface Scanner {
  scan(bytes: Buffer): Promise<{ clean: boolean; signature?: string }>;
}

export function buildDefaultScanner(): Scanner {
  const host = process.env.CLAMD_HOST;
  if (!host) {
    return {
      async scan() {
        // Launch gate 4a requires a real scanner in production; unscanned
        // dev uploads are logged, never silently treated as verified.
        console.warn('[scan] CLAMD_HOST not set — upload NOT malware-scanned');
        return { clean: true };
      },
    };
  }
  const [h, p] = host.split(':');
  return {
    scan(bytes: Buffer) {
      return new Promise((resolve, reject) => {
        // clamd INSTREAM protocol: zINSTREAM\0 + {size:u32be, chunk}* + zero-size
        const net = require('net') as typeof import('net');
        const sock = net.createConnection({ host: h, port: Number(p ?? 3310) });
        let out = '';
        sock.on('connect', () => {
          sock.write('zINSTREAM\0');
          const size = Buffer.alloc(4);
          size.writeUInt32BE(bytes.length);
          sock.write(size);
          sock.write(bytes);
          sock.write(Buffer.from([0, 0, 0, 0]));
        });
        sock.on('data', (d) => (out += d.toString()));
        sock.on('end', () => {
          const clean = out.includes('OK') && !out.includes('FOUND');
          resolve({ clean, signature: clean ? undefined : out.trim() });
        });
        sock.on('error', reject);
        sock.setTimeout(30_000, () => { sock.destroy(); reject(new Error('clamd timeout')); });
      });
    },
  };
}

export interface DigitizeSummary {
  pages: number;
  billable: number;
  duplicatesIgnored: number;
  lowConfidencePages: number;
  halted: boolean;
  quarantined?: boolean;
  suggestedKind?: string | null;
}

export async function digitizeDocument(
  documentId: string,
  opts: { bytes: Buffer; extractor: Extractor; s3Key: string; scanner?: Scanner }
): Promise<DigitizeSummary> {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { case: { select: { id: true, tenantId: true, ocrHalt: true } } },
  });
  const { id: caseId, tenantId } = doc.case;

  // ENG-4: scan before a single byte is parsed. Court-record CDs are a
  // classic malware vector; infected files quarantine with a plain-language
  // customer path, never reach digitization, and leave S3 immediately.
  if (opts.scanner) {
    const verdict = await opts.scanner.scan(opts.bytes);
    if (!verdict.clean) {
      await withTenant(tenantId, async (tx) => {
        await tx.document.update({ where: { id: documentId }, data: { quarantined: true } });
        await appendCaseEvent(tx, {
          caseId, tenantId, type: 'doc.quarantined',
          payload: { documentId }, actor: 'digitize',
        });
      });
      const { deleteCasePrefix: _unused, s3, bucket } = await import('./storage.service');
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: opts.s3Key })).catch(() => {});
      return { pages: 0, billable: 0, duplicatesIgnored: 0, lowConfidencePages: 0, halted: false, quarantined: true };
    }
  }

  const extracted = await opts.extractor.extract({
    bytes: opts.bytes,
    filename: doc.filename,
    s3Key: opts.s3Key,
  });

  return withTenant(tenantId, async (tx) => {
    // Re-run safety: this document's prior digitization is replaced whole.
    await tx.documentChunk.deleteMany({ where: { documentId } });
    await tx.documentPage.deleteMany({ where: { documentId } });

    // Exact-hash dedup ACROSS the case (§11a.3): duplicates leave billing
    // and analysis; empty pages get a per-page salt so they never collide.
    const existing = await tx.documentPage.findMany({
      where: { document: { caseId }, dedupKind: null },
      select: { contentHash: true },
    });
    const seen = new Set(existing.map((p) => p.contentHash));

    let billable = 0;
    let duplicates = 0;
    let lowConfidence = 0;
    const analysisPages: { pageNo: number; text: string }[] = [];

    for (let i = 0; i < extracted.length; i++) {
      const text = extracted[i].text.trim();
      const hash = text ? sha256(text) : sha256(`${documentId}:${i + 1}:empty`);
      const isDup = text.length > 0 && seen.has(hash);
      if (!isDup) seen.add(hash);
      if (isDup) duplicates++;
      else billable++;
      if (extracted[i].confidence < LOW_CONFIDENCE) lowConfidence++;

      await tx.documentPage.create({
        data: {
          documentId,
          pageNo: i + 1,
          contentHash: hash,
          billable: !isDup,
          dedupKind: isDup ? 'exact' : null,
          ocrConfidence: extracted[i].confidence,
          ocrProvider: extracted[i].confidence === 1 ? 'pdf-text' : 'textract',
        },
      });
      if (!isDup && text) analysisPages.push({ pageNo: i + 1, text });
    }

    // Real chunks with page provenance — the citation anchors' substrate.
    for (const p of analysisPages) {
      for (let off = 0; off < p.text.length; off += CHUNK_CHARS) {
        await tx.documentChunk.create({
          data: {
            documentId,
            content: p.text.slice(off, off + CHUNK_CHARS),
            metadata: { page: p.pageNo, filename: doc.filename },
          },
        });
      }
    }

    await appendCaseEvent(tx, {
      caseId,
      tenantId,
      type: 'doc.ocr_done',
      payload: { documentId, pages: extracted.length, lowConfidencePages: lowConfidence },
      actor: 'digitize',
    });

    // Echo-back: propose a checklist item and mark it UPLOADED; the customer
    // confirms or corrects (doc.confirmed / doc.corrected).
    const fullText = analysisPages.map((p) => p.text).join('\n');
    const kind = classifyKind(fullText);
    let suggestedKind: string | null = null;
    if (kind) {
      const item = await tx.checklistItem.findFirst({ where: { caseId, kind } });
      if (item) {
        suggestedKind = kind;
        await tx.document.update({
          where: { id: documentId },
          data: { suggestedChecklistItemId: item.id },
        });
        if (item.state === 'NEEDED') {
          await tx.checklistItem.update({ where: { id: item.id }, data: { state: 'UPLOADED' } });
        }
        await appendCaseEvent(tx, {
          caseId, tenantId, type: 'doc.classified',
          payload: { documentId, checklistItemId: item.id }, actor: 'digitize',
        });
      }
    }

    // E-1: halt on a bad-scan cohort BEFORE any Tier-2 spend.
    let halted = false;
    const casePages = await tx.documentPage.findMany({
      where: { document: { caseId }, billable: true },
      select: { ocrConfidence: true },
    });
    const lowShare =
      casePages.filter((p) => (p.ocrConfidence ?? 0) < LOW_CONFIDENCE).length /
      Math.max(casePages.length, 1);
    if (casePages.length >= 10 && lowShare > HALT_SHARE && !doc.case.ocrHalt) {
      await appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'ocr.halted',
        payload: { lowConfidenceShare: Number(lowShare.toFixed(3)) },
        actor: 'digitize',
        setHold: 'OCR_HALT',
      });
      halted = true;
    }

    return {
      pages: extracted.length,
      billable,
      duplicatesIgnored: duplicates,
      lowConfidencePages: lowConfidence,
      halted,
      suggestedKind,
    };
  });
}

/** The single billable-page authority (ENG-3): meter, billing, refunds all read this. */
export async function pageMeter(caseId: string, tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const billable = await tx.documentPage.count({
      where: { document: { caseId } , billable: true },
    });
    const duplicatesIgnored = await tx.documentPage.count({
      where: { document: { caseId }, billable: false },
    });
    return { billable, duplicatesIgnored, cap: 5000 };
  });
}
