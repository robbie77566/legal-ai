import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '@hg/database';
import { enqueueGraphEntityExtraction } from '../services/queue';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Simulates an Ollama local embedding (e.g., nomic-embed-text)
const generateMockEmbedding = () => {
  return Array.from({ length: 1536 }, () => Math.random());
};

export const ingestionWorker = new Worker('ingestion', async (job: Job) => {
  const { documentId, s3Key } = job.data;
  
  console.log(`[Ingestion] Processing document ${documentId} from ${s3Key}`);
  
  // 1. Mock Docling PDF parsing & hierarchical chunking
  // In reality, this would shell out to a Docling python worker or API
  const chunks = [
    { id: 'chunk_1', text: 'Detective Smith testified regarding the evidence found at the scene.' },
    { id: 'chunk_2', text: 'Medical records from 1998 indicate a severe concussion for the defendant.' }
  ];

  // 2. Generate Embeddings & Insert into pgvector
  for (const chunk of chunks) {
    const embedding = generateMockEmbedding();
    
    // We must use $executeRawUnsafe because Prisma doesn't natively support vector insertion
    // The cast `$3::vector` is crucial for pgvector
    await prisma.$executeRawUnsafe(`
      INSERT INTO "DocumentChunk" (id, "documentId", content, metadata, embedding)
      VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        '{}'::jsonb,
        $3::vector
      )
    `, documentId, chunk.text, `[${embedding.join(',')}]`);
  }

  // 3. Trigger Neo4j Graph Extraction
  console.log(`[Ingestion] Enqueuing Graph Extraction for ${documentId}`);
  await enqueueGraphEntityExtraction(documentId, chunks);
  
  return { processed: chunks.length };
}, { connection });
