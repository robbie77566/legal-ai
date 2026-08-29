import {
  S3Client,
  GetObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

/** The one S3 client + case-storage operations (system design §3.3, OPS-4). */

const region = () => (process.env.AWS_REGION ?? 'us-east-2').replace(/"/g, '');
export const bucket = () => (process.env.S3_BUCKET ?? 'legal-ai-transcripts').replace(/"/g, '');

let clientSingleton: S3Client | undefined;
export function s3(): S3Client {
  if (!clientSingleton) {
    clientSingleton = new S3Client({
      region: region(),
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }
  return clientSingleton;
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/**
 * OPS-4 hard delete: every object AND every version under cases/{caseId}/ —
 * versioning is on, so a plain delete would leave recoverable versions.
 * Backup/version expiry (≤35d lifecycle) bounds the rest (§11a.2).
 */
export async function deleteCasePrefix(caseId: string): Promise<number> {
  const Prefix = `cases/${caseId}/`;
  let removed = 0;
  let KeyMarker: string | undefined;
  let VersionIdMarker: string | undefined;
  for (;;) {
    const page = await s3().send(
      new ListObjectVersionsCommand({ Bucket: bucket(), Prefix, KeyMarker, VersionIdMarker })
    );
    const targets = [
      ...(page.Versions ?? []).map((v) => ({ Key: v.Key!, VersionId: v.VersionId })),
      ...(page.DeleteMarkers ?? []).map((v) => ({ Key: v.Key!, VersionId: v.VersionId })),
    ];
    if (targets.length > 0) {
      await s3().send(
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: targets, Quiet: true } })
      );
      removed += targets.length;
    }
    if (!page.IsTruncated) break;
    KeyMarker = page.NextKeyMarker;
    VersionIdMarker = page.NextVersionIdMarker;
  }
  return removed;
}
