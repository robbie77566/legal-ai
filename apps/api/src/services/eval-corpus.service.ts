import path from 'path';
import { CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { withTenant, appendCaseEvent } from '@hg/database';
import { s3, bucket } from './storage.service';
import { suggestVolume, volumeFields } from './inventory.service';

/**
 * The reference record for a ledger, from the encrypted eval-corpus bucket
 * into an eval case — exactly what `scripts/dev-seed.ts --corpus <folder>`
 * did by hand on a developer box (ENG-10: the corpora live ONLY in that
 * bucket, never in git). Top-level PDFs only; the folders also hold media
 * the pipeline does not ingest. The copied volumes then walk the REAL
 * digitization path (pdf-parse for born-digital text, Textract only for
 * scans — no re-OCR of a record that already carries text) and the volume
 * meter labels them from their filenames like any upload.
 */

/**
 * Ledger → `corpus/<folder>/` in EVAL_CORPUS_BUCKET
 * (docs/architecture/eval_corpus_manifest.json). A ledger not listed here
 * uses its own name capitalised, so a new ledger whose folder matches needs
 * no code change.
 */
export const CORPUS_FOLDER_FOR_LEDGER: Readonly<Record<string, string>> = Object.freeze({
  gary: 'Gary',
  brian: 'Brian Spinks',
});

export function corpusFolderFor(ledger: string): string {
  return CORPUS_FOLDER_FOR_LEDGER[ledger] ?? ledger.charAt(0).toUpperCase() + ledger.slice(1);
}

export const evalCorpusBucket = () => (process.env.EVAL_CORPUS_BUCKET ?? '').replace(/"/g, '');

export interface CorpusIngest {
  folder: string;
  documents: number;
  bytes: number;
}

/**
 * Copies the folder's top-level PDFs into `cases/<caseId>/` of the case
 * bucket, creates one Document per volume (volume kind suggested from the
 * filename, unconfirmed — like an upload) and queues each for digitization.
 * Throws when the bucket is not configured or the folder is empty: an eval
 * run on no record must fail loudly, never score an empty case green.
 */
export async function ingestCorpus(caseId: string, tenantId: string, ledger: string, actor: string): Promise<CorpusIngest> {
  const evalBucket = evalCorpusBucket();
  if (!evalBucket) throw new Error('EVAL_CORPUS_BUCKET is not set on this service');
  const folder = corpusFolderFor(ledger);
  const prefix = `corpus/${folder}/`;
  const client = s3();

  const pdfs: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: evalBucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      if (!o.Key || !o.Key.toLowerCase().endsWith('.pdf')) continue;
      if (o.Key.slice(prefix.length).includes('/')) continue; // top-level volumes only
      pdfs.push({ key: o.Key, size: o.Size ?? 0 });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (pdfs.length === 0) throw new Error(`No PDF volumes under s3://${evalBucket}/${prefix}`);
  pdfs.sort((a, b) => a.key.localeCompare(b.key));

  const { enqueueDocument } = await import('./queue');
  const docsBucket = bucket();
  let bytes = 0;
  for (const obj of pdfs) {
    const filename = path.basename(obj.key);
    const destKey = `cases/${caseId}/${filename}`;
    await client.send(new CopyObjectCommand({ Bucket: docsBucket, Key: destKey, CopySource: `/${evalBucket}/${encodeURIComponent(obj.key)}` }));
    const suggestion = suggestVolume(filename);
    const doc = await withTenant(tenantId, async (tx) => {
      const d = await tx.document.create({
        data: { filename, s3Key: destKey, caseId, ...volumeFields({ kind: suggestion.kind, index: suggestion.index, count: suggestion.count }, false) },
      });
      await appendCaseEvent(tx, { caseId, tenantId, type: 'doc.uploaded', payload: { documentId: d.id }, actor });
      return d;
    });
    await enqueueDocument(doc.id, destKey, caseId);
    bytes += obj.size;
  }
  return { folder, documents: pdfs.length, bytes };
}
