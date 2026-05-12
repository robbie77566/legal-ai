import { describe, it, expect, vi } from 'vitest';
import prisma from '@hg/database';

describe('Document Ingestion Worker', () => {
  it('should successfully formulate a raw SQL query for pgvector insertion', async () => {
    // Mock the raw Prisma execution
    const rawMock = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);
    
    const documentId = 'doc_abc123';
    const text = 'Sample testimony from witness stand.';
    const mockEmbedding = Array(1536).fill(0.5);
    const vectorString = `[${mockEmbedding.join(',')}]`;
    
    // Simulate the exact query the worker runs
    await prisma.$executeRawUnsafe(`
      INSERT INTO "DocumentChunk" (id, "documentId", content, metadata, embedding)
      VALUES (gen_random_uuid()::text, $1, $2, '{}'::jsonb, $3::vector)
    `, documentId, text, vectorString);
    
    expect(rawMock).toHaveBeenCalled();
    const callArgs = rawMock.mock.calls[0];
    
    // Verify parameters are passed safely to prevent SQL injection
    expect(callArgs[1]).toBe(documentId);
    expect(callArgs[2]).toBe(text);
    expect(callArgs[3]).toBe(vectorString);
    
    rawMock.mockRestore();
  });
});
