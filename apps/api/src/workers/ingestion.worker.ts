import { Worker, Job } from 'bullmq';
import { createConnection } from '../lib/redis';
import { digitizeDocument, buildDefaultExtractor, buildDefaultScanner, buildDefaultClassifier } from '../services/digitize.service';
import { getObjectBytes } from '../services/storage.service';

/**
 * Real digitization worker (M3 — retires the register's last mocked worker):
 * S3 fetch → pdf-parse (born-digital) or Textract (scans) → DocumentPage
 * billable ledger + real chunks + doc.ocr_done events + the E-1 halt.
 * Honest failure: an unreachable object leaves the document unprocessed and
 * the job retrying — never fixture text.
 */
const connection = createConnection();

export const ingestionWorker = new Worker(
  'ingestion',
  async (job: Job) => {
    const { documentId, s3Key, caseId } = job.data as {
      documentId: string;
      s3Key: string;
      caseId: string;
    };

    const bytes = await getObjectBytes(s3Key); // throws → BullMQ retry/backoff
    const summary = await digitizeDocument(documentId, {
      bytes,
      s3Key,
      extractor: buildDefaultExtractor(),
      scanner: buildDefaultScanner(),
      classifier: buildDefaultClassifier(),
    });

    // M1 exit criterion: the SSE channel is fed by the outbox EXCLUSIVELY —
    // digitization progress reaches customers via doc.ocr_done events.
    console.log(`[digitize] doc ${documentId}:`, summary);
    return summary;
  },
  { connection: createConnection(), concurrency: 2 }
);
