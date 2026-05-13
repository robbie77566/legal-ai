import { FastifyInstance } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import prisma from '@hg/database';
import { enqueueDocument } from '../services/queue';
import crypto from 'crypto';

const s3Config: any = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: true
};

// Only explicitly pass credentials if they are provided in .env
// Otherwise, allow the AWS SDK to resolve via ~/.aws/credentials or IAM roles
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
}

const s3 = new S3Client(s3Config);

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
    
    try {
      // Pre-signed URL valid for 1 hour allows 5GB uploads directly to S3
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      return { url, s3Key };
    } catch (err: any) {
      if (err.name === 'CredentialsProviderError') {
        fastify.log.error("Missing AWS Credentials. Please add AWS_ACCESS_KEY_ID to .env");
        return reply.status(500).send({ error: "AWS credentials not configured on the backend server." });
      }
      throw err;
    }
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
    try {
      await enqueueDocument(document.id, s3Key, caseId);
    } catch (e) {
      console.warn("Failed to enqueue document, redis may be down:", e);
    }
    
    return { success: true, documentId: document.id };
  });
}
