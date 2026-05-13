import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@hg/database';
import { ingestionWorker } from '../src/workers/ingestion.worker';
import * as queueService from '../src/services/queue';
import { Job } from 'bullmq';

// Mock dependencies
vi.mock('@hg/database', () => {
  return {
    default: {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    }
  };
});

vi.mock('../src/services/queue', () => {
  return {
    enqueueGraphEntityExtraction: vi.fn().mockResolvedValue(true)
  };
});

// Mock IORedis to avoid connecting to localhost:6379 during tests
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => ({
      on: vi.fn(),
      status: 'ready'
    }))
  };
});

describe('Document Ingestion Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process a job, extract chunks, insert vectors, and queue graph extraction', async () => {
    // Access the processor function of the BullMQ worker
    const processor = (ingestionWorker as any).processFn;
    
    // Create a mock BullMQ Job
    const mockJob = {
      data: {
        documentId: 'doc_123',
        s3Key: 'uploads/case/doc.pdf'
      }
    } as Job;

    const result = await processor(mockJob);

    // Verify it processed 2 mock chunks
    expect(result).toEqual({ processed: 2 });

    // Verify Prisma pgvector insertion was called twice
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    
    // Verify parameters passed to raw SQL
    const firstCallArgs = (prisma.$executeRawUnsafe as any).mock.calls[0];
    expect(firstCallArgs[0]).toContain('INSERT INTO "DocumentChunk"');
    expect(firstCallArgs[1]).toBe('doc_123'); // $1 documentId
    expect(firstCallArgs[2]).toBe('Detective Smith testified regarding the evidence found at the scene.'); // $2 chunk text
    expect(firstCallArgs[3]).toMatch(/^\[.*\]$/); // $3 vector string

    // Verify graph extraction was queued
    expect(queueService.enqueueGraphEntityExtraction).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueGraphEntityExtraction).toHaveBeenCalledWith(
      'doc_123', 
      expect.any(Array) // The chunks array
    );
  });
});
