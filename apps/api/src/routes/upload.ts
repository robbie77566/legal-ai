import { FastifyInstance } from 'fastify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { withTenant, appendCaseEvent } from '@hg/database';
import crypto from 'crypto';
// The SHARED lazy client (storage.service), never a module-level one: import
// hoisting runs this module before index.ts's dotenv.config(), so a client
// built here reads an EMPTY env — that exact bug presigned us-east-1 URLs
// for a us-east-2 bucket and 301'd every browser upload (found live,
// 2026-09-01, by the bulk-ZIP E2E).
import { s3, bucket } from '../services/storage.service';

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
  // The caller must have CaseAccess to the case, inside their own tenant —
  // presigning for an arbitrary caseId would let anyone write into any case.
  const assertCaseAccess = async (request: { auth: { tenantId: string; userId: string } }, caseId: string) => {
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, (tx) =>
      tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId, userId } }
      })
    );
  };

  // Tighter limit on presign than the global default (SRE-6): presigned URLs
  // are the write path into S3.
  const presignLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  fastify.post('/url', presignLimit, async (request, reply) => {
    const { filename, caseId } = URLRequestSchema.parse(request.body);

    if (!(await assertCaseAccess(request, caseId))) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Generate secure randomized key to prevent collisions
    const s3Key = `cases/${caseId}/${crypto.randomUUID()}-${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: bucket(),
      Key: s3Key,
    });

    try {
      // Pre-signed URL valid for 1 hour allows 5GB uploads directly to S3
      const url = await getSignedUrl(s3(), command, { expiresIn: 3600 });
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

    if (!(await assertCaseAccess(request, caseId))) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    // US-11 interrogation fix: bind the key to THIS case's prefix — an
    // unbound client-supplied key could register another case's object
    // here and have the pipeline ingest it.
    if (!s3Key.startsWith(`cases/${caseId}/`)) {
      return reply.status(400).send({ error: 'Invalid document key' });
    }

    // Bulk ZIP path (bulk_zip_upload.md): the archive itself is a container,
    // not a Document — a background job unpacks it and registers each usable
    // entry as an ordinary document (scan → digitize → echo-back unchanged).
    if (/\.zip$/i.test(filename)) {
      try {
        const { enqueueZip } = await import('../services/queue');
        await enqueueZip(s3Key, caseId, request.auth.tenantId, request.auth.userId);
      } catch (e) {
        console.warn('[Queue] Failed to enqueue zip — Redis may be unavailable:', e);
        return reply.status(503).send({ error: 'Could not start unpacking — please try again' });
      }
      return { success: true, zip: true };
    }

    // Register the document + its lifecycle event in one RLS-scoped tx
    const document = await withTenant(request.auth.tenantId, async (tx) => {
      const doc = await tx.document.create({
        data: {
          filename,
          s3Key, // US-11: documents must be returnable
          caseId
        }
      });
      await appendCaseEvent(tx, {
        caseId,
        tenantId: request.auth.tenantId,
        type: 'doc.uploaded',
        payload: { documentId: doc.id },
        actor: request.auth.userId,
      });
      return doc;
    });
    
    // Lazy import: queue.ts creates IORedis connections at module level; importing it
    // here instead of at the top of the file prevents Redis connection attempts at startup.
    try {
      const { enqueueDocument } = await import('../services/queue');
      await enqueueDocument(document.id, s3Key, caseId);
    } catch (e) {
      console.warn('[Queue] Failed to enqueue document — Redis may be unavailable:', e);
    }
    
    return { success: true, documentId: document.id };
  });
}
