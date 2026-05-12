import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '@hg/database';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Simulates an Ollama local embedding (e.g., nomic-embed-text)
const generateMockEmbedding = () => {
  return Array.from({ length: 1536 }, () => Math.random());
};

export const mediaWorker = new Worker('media', async (job: Job) => {
  const { documentId, s3Key } = job.data;
  
  console.log(`[Media Worker] Processing video ${documentId} from ${s3Key}`);
  
  // Simulate FFmpeg audio extraction and Whisper transcription
  const whisperChunks = [
    { id: 'ts_1', text: '[00:15:32] OFFICER: Put your hands up. Turn around.' },
    { id: 'ts_2', text: '[00:15:45] SUSPECT: I didn\'t do anything, I swear.' }
  ];

  // Generate Embeddings & Insert into pgvector
  for (const chunk of whisperChunks) {
    const embedding = generateMockEmbedding();
    
    // Inject the timestamped audio transcript into the exact same pgvector 
    // schema used for written text, tagging the metadata as 'bodycam_audio'.
    await prisma.$executeRawUnsafe(`
      INSERT INTO "DocumentChunk" (id, "documentId", content, metadata, embedding)
      VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        '{"type": "bodycam_audio"}'::jsonb,
        $3::vector
      )
    `, documentId, chunk.text, `[${embedding.join(',')}]`);
  }
  
  return { processedAudioChunks: whisperChunks.length };
}, { connection });
