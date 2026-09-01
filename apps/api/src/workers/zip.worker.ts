import { Worker, Job } from 'bullmq';
import { createConnection } from '../lib/redis';
import { ingestZip } from '../services/zip-ingest.service';

/**
 * Bulk ZIP unpack worker (bulk_zip_upload.md): one job per uploaded archive.
 * Concurrency 1 — adm-zip holds the archive in memory, and two 250MB zips
 * at once would OOM the Render starter instance.
 */
export const zipWorker = new Worker(
  'zip',
  async (job: Job) => {
    const { zipKey, caseId, tenantId, actor } = job.data as {
      zipKey: string;
      caseId: string;
      tenantId: string;
      actor: string;
    };
    const result = await ingestZip({ zipKey, caseId, tenantId, actor });
    console.log(`[zip] ${caseId}:`, result);
    return result;
  },
  { connection: createConnection(), concurrency: 1 }
);
