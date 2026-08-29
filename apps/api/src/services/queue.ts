import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { createConnection } from '../lib/redis';
dotenv.config();

const connection = createConnection();

// Queue for Docling text chunking and pgvector insertion
export const ingestionQueue = new Queue('ingestion', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200
  }
});

// Queue for Neo4j entity extraction via LLM
export const graphQueue = new Queue('graph', { connection });

// Analysis orchestration (M4): triggered by records-complete.
export const analysisQueue = new Queue('analysis', {
  connection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 30_000 } }
});

export const enqueueAnalysis = async (caseId: string, tenantId: string) => {
  // Job id = caseId: a duplicate records-complete race can never double-run.
  await analysisQueue.add('analysis:run', { caseId, tenantId }, { jobId: `analysis-${caseId}` });
};

// The `media` queue and its worker were deleted (implementation plan §5.1):
// never enqueued, and the worker wrote 1536-dim vectors into a 768-dim
// column. The v1.1 A/V add-on rebuilds this on the Phase-5 design.

export const enqueueDocument = async (documentId: string, s3Key: string, caseId: string) => {
  await ingestionQueue.add('document:process', { documentId, s3Key, caseId });
};

export const enqueueGraphEntityExtraction = async (documentId: string, chunks: { id: string; text: string }[], caseId: string) => {
  await graphQueue.add('entity:extract', { documentId, chunks, caseId });
};

