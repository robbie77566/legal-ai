import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { withTenant, appendCaseEvent } from '@hg/database';
import { s3, bucket, getObjectBytes } from './storage.service';

/**
 * Bulk ZIP ingestion (bulk_zip_upload.md): the customer uploads ONE zip of
 * everything they collected; we unpack it server-side and register every
 * usable file as an ordinary Document, so the scan → digitize → echo-back →
 * checklist auto-check pipeline applies to each entry unchanged.
 *
 * Safety model (all caps hit → the entry/zip is SKIPPED, never a crash):
 *  - extension allowlist (what the picker accepts for single files)
 *  - junk pruning: directories, __MACOSX, dotfiles, 0-byte entries
 *  - zip-bomb bounds: entry count, per-entry uncompressed size, total
 *    uncompressed size. adm-zip holds the archive in memory, so the
 *    compressed cap protects the process (Render starter = 512MB; raise
 *    instance before raising caps — external_services.md upgrade trigger).
 *  - no nested zips (one level, deliberately)
 *  - zip-slip is structurally impossible: entry names never become paths —
 *    every accepted entry gets a fresh `cases/<caseId>/<uuid>-<basename>` key.
 */
export const ZIP_LIMITS = {
  maxCompressedBytes: 250 * 1024 * 1024,
  maxEntries: 300,
  maxEntryBytes: 150 * 1024 * 1024,
  maxTotalUncompressedBytes: 1_500 * 1024 * 1024,
} as const;

const ALLOWED_EXT = /\.(pdf|jpe?g|png|tiff?|heic)$/i;

export interface ZipEntryMeta {
  name: string; // full path inside the archive
  isDirectory: boolean;
  uncompressedBytes: number;
}

export interface ZipPlan {
  accepted: { name: string; basename: string }[];
  skippedUnsupported: number;
  skippedTooLarge: number;
  skippedJunk: number;
  truncatedAtEntryCap: boolean;
}

/** Pure selection logic — unit-tested without S3 or a real archive. */
export function planZipEntries(entries: ZipEntryMeta[]): ZipPlan {
  const plan: ZipPlan = {
    accepted: [],
    skippedUnsupported: 0,
    skippedTooLarge: 0,
    skippedJunk: 0,
    truncatedAtEntryCap: false,
  };
  let totalBytes = 0;
  for (const e of entries) {
    const basename = e.name.split('/').pop() ?? '';
    if (e.isDirectory || !basename || basename.startsWith('.') || e.name.includes('__MACOSX')) {
      plan.skippedJunk++;
      continue;
    }
    if (e.uncompressedBytes === 0) {
      plan.skippedJunk++;
      continue;
    }
    if (!ALLOWED_EXT.test(basename)) {
      plan.skippedUnsupported++; // .zip inside .zip lands here too — one level only
      continue;
    }
    if (
      e.uncompressedBytes > ZIP_LIMITS.maxEntryBytes ||
      totalBytes + e.uncompressedBytes > ZIP_LIMITS.maxTotalUncompressedBytes
    ) {
      plan.skippedTooLarge++;
      continue;
    }
    if (plan.accepted.length >= ZIP_LIMITS.maxEntries) {
      plan.truncatedAtEntryCap = true;
      break;
    }
    totalBytes += e.uncompressedBytes;
    plan.accepted.push({ name: e.name, basename });
  }
  return plan;
}

export interface ZipIngestResult {
  accepted: number;
  skippedUnsupported: number;
  skippedTooLarge: number;
  skippedJunk: number;
  failed: number;
}

/**
 * Unpack the archive at `zipKey`, register every accepted entry as a
 * Document, enqueue each for digitization, and append one `zip.ingested`
 * event the checklist UI reads back. Idempotency: BullMQ jobId is the
 * zipKey, so a retried job re-runs at most once after a crash — the worst
 * duplicate is a re-registered file, which the page-ledger duplicate
 * detection already prices at zero.
 */
export async function ingestZip(opts: {
  zipKey: string;
  caseId: string;
  tenantId: string;
  actor: string;
}): Promise<ZipIngestResult> {
  const { zipKey, caseId, tenantId, actor } = opts;
  const bytes = await getObjectBytes(zipKey); // throws → BullMQ retry
  if (bytes.length > ZIP_LIMITS.maxCompressedBytes) {
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'zip.ingested',
        payload: { accepted: 0, skippedUnsupported: 0, skippedTooLarge: 1, skippedJunk: 0, failed: 0 },
        actor,
      })
    );
    return { accepted: 0, skippedUnsupported: 0, skippedTooLarge: 1, skippedJunk: 0, failed: 0 };
  }

  const zip = new AdmZip(bytes);
  const plan = planZipEntries(
    zip.getEntries().map((e) => ({
      name: e.entryName,
      isDirectory: e.isDirectory,
      uncompressedBytes: e.header.size,
    }))
  );

  let failed = 0;
  const { enqueueDocument } = await import('./queue');
  for (const entry of plan.accepted) {
    try {
      const data = zip.getEntry(entry.name)?.getData();
      if (!data || data.length === 0) {
        failed++;
        continue;
      }
      const s3Key = `cases/${caseId}/${crypto.randomUUID()}-${entry.basename}`;
      await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: s3Key, Body: data }));
      const doc = await withTenant(tenantId, async (tx) => {
        const d = await tx.document.create({ data: { filename: entry.basename, s3Key, caseId } });
        await appendCaseEvent(tx, {
          caseId,
          tenantId,
          type: 'doc.uploaded',
          payload: { documentId: d.id },
          actor,
        });
        return d;
      });
      await enqueueDocument(doc.id, s3Key, caseId);
    } catch (err) {
      failed++;
      console.warn(`[zip] entry failed (${caseId}):`, (err as Error).message);
    }
  }

  const result: ZipIngestResult = {
    accepted: plan.accepted.length - failed,
    skippedUnsupported: plan.skippedUnsupported,
    skippedTooLarge: plan.skippedTooLarge,
    skippedJunk: plan.skippedJunk,
    failed,
  };
  await withTenant(tenantId, (tx) =>
    appendCaseEvent(tx, { caseId, tenantId, type: 'zip.ingested', payload: { ...result }, actor })
  );
  return result;
}
