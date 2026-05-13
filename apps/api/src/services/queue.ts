import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// BullMQ requires maxRetriesPerRequest: null
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

// Queue for Docling text chunking and pgvector insertion
export const ingestionQueue = new Queue('ingestion', { connection });

// Queue for Neo4j entity extraction via LLM
export const graphQueue = new Queue('graph', { connection });

// Queue for heavy multimedia processing (FFmpeg/Whisper)
export const mediaQueue = new Queue('media', { connection });

export const enqueueDocument = async (documentId: string, s3Key: string, caseId: string) => {
  await ingestionQueue.add('document:process', { documentId, s3Key, caseId });
};

export const enqueueGraphEntityExtraction = async (documentId: string, chunks: { id: string; text: string }[], caseId: string) => {
  await graphQueue.add('entity:extract', { documentId, chunks, caseId });
};

export const enqueueMultimedia = async (documentId: string, s3Key: string, caseId: string) => {
  await mediaQueue.add('media:process', { documentId, s3Key, caseId });
};
