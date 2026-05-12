import { FastifyInstance } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import prisma from '@hg/database';
import { enqueueDocument } from '../services/queue';
import crypto from 'crypto';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock'
  },
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: true
});

const URLRequestSchema = z.object({
  filename: z.string(),
  caseId: z.string()
});

const CompleteRequestSchema = z.object({
  caseId: z.string(),
  filename: z.string(),
  s3Key: z.string()
});

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post('/url', async (request, reply) => {
    // Note: Production implementation will enforce session RLS via NextAuth token
    const { filename, caseId } = URLRequestSchema.parse(request.body);
    
    // Generate secure randomized key to prevent collisions
    const s3Key = `cases/${caseId}/${crypto.randomUUID()}-${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET || 'legal-ai-transcripts',
      Key: s3Key,
    });
    
    // Pre-signed URL valid for 1 hour allows 5GB uploads directly to S3
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    return { url, s3Key };
  });

  fastify.post('/complete', async (request, reply) => {
    const { caseId, filename, s3Key } = CompleteRequestSchema.parse(request.body);
    
    // Register the document in PostgreSQL
    const document = await prisma.document.create({
      data: {
        filename,
        caseId
      }
    });
    
    // Enqueue the heavy Docling/pgvector extraction pipeline
    await enqueueDocument(document.id, s3Key);
    
    return { success: true, documentId: document.id };
  });
}
