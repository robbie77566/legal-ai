import { Worker, Job } from 'bullmq';
import prisma from '@hg/database';
import { enqueueGraphEntityExtraction } from '../services/queue';
import { EmbeddingService } from '../services/embedding.service';
import { createConnection } from '../lib/redis';

const connection = createConnection();

export const ingestionWorker = new Worker('ingestion', async (job: Job) => {
  const { documentId, s3Key, caseId } = job.data;
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  const publishLog = async (message: string) => {
    if (caseId) {
      await connection.publish(`case-progress:${caseId}`, JSON.stringify({ message, source: 'ingestion' }));
    }
  };

  console.log(`[Ingestion] Processing document ${documentId} from ${s3Key}`);
  await publishLog(`Processing uploaded file: ${s3Key.split('-').pop()}`);
  
  // 1. Mock Docling PDF parsing & hierarchical chunking
  // In reality, this would shell out to a Docling python worker or API
  const chunks = [
    { id: 'chunk_1', text: 'Detective Smith testified regarding the evidence found at the scene.' },
    { id: 'chunk_2', text: 'Medical records from 1998 indicate a severe concussion for the defendant.' }
  ];

  // 2. Generate Embeddings & Insert into pgvector
  await publishLog('Chunking document and generating pgvector embeddings...');
  for (const chunk of chunks) {
    let embedding: number[];
    try {
      embedding = await EmbeddingService.embed(chunk.text);
    } catch (err) {
      await publishLog(`Embedding failed for chunk ${chunk.id} — will retry`);
      throw err; // propagate so BullMQ retries the job
    }

    // $executeRaw with tagged template is parameterized and safe against injection.
    // The ::vector cast is required for pgvector; Prisma doesn't natively support the vector type.
    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk" (id, "documentId", content, metadata, embedding)
      VALUES (
        gen_random_uuid()::text,
        ${documentId},
        ${chunk.text},
        '{}'::jsonb,
        ${`[${embedding.join(',')}]`}::vector
      )
    `;
  }

  // 3. Trigger Neo4j Graph Extraction
  console.log(`[Ingestion] Enqueuing Graph Extraction for ${documentId}`);
  await delay(1500);
  await publishLog('Vector embeddings saved. Handing off to LLM entity extractor...');
  await enqueueGraphEntityExtraction(documentId, chunks, caseId);
  
  return { processed: chunks.length };
}, { connection });
