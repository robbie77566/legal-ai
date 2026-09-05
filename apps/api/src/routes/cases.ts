import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma, { withTenant } from '@hg/database';
import { createConnection } from '../lib/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';

// pdf-parse v2 replaced the v1 call-style default export with a class API.
const pdfParse = async (buffer: Buffer): Promise<{ text: string }> => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
};
import AdmZip from 'adm-zip';

const CreateCaseSchema = z.object({
  title: z.string(),
  defendant: z.string().optional(),
  jurisdiction: z.string().optional()
});

export default async function casesRoutes(fastify: FastifyInstance) {
  fastify.post('/preview-metadata', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      let text = '';

      // If ZIP, extract the first relevant file (PDF or TXT)
      if (data.mimetype === 'application/zip' || data.mimetype === 'application/x-zip-compressed' || data.filename.endsWith('.zip')) {
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();
        const firstEntry = zipEntries.find((e: any) => !e.isDirectory && (e.entryName.endsWith('.pdf') || e.entryName.endsWith('.txt')));
        
        if (firstEntry) {
          const entryBuffer = firstEntry.getData();
          if (firstEntry.entryName.endsWith('.pdf')) {
            const pdfData = await pdfParse(entryBuffer);
            text = pdfData.text;
          } else {
            text = entryBuffer.toString('utf-8');
          }
        }
      } else if (data.mimetype === 'application/pdf' || data.filename.endsWith('.pdf')) {
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else {
        text = buffer.toString('utf-8');
      }

      // Truncate to first 10,000 characters to save tokens/time
      text = text.substring(0, 10000);

      // Call Gemini for extraction
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `
        You are a legal AI assistant. Read the following excerpt from a legal document and extract the case metadata.
        Return ONLY a JSON object with the following keys:
        - name: The name of the case (e.g. 'State v. Smith'). If not found, make a reasonable guess or return an empty string.
        - defendant: The name of the defendant. If not found, return an empty string.
        - jurisdiction: The jurisdiction (e.g. 'SDNY', 'California Superior Court'). If not found, return an empty string.
        
        Document excerpt:
        ${text}
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
      
      const parsed = JSON.parse(responseText);
      
      return reply.send({
        name: parsed.name || '',
        defendant: parsed.defendant || '',
        jurisdiction: parsed.jurisdiction || ''
      });
      
    } catch (e: any) {
      fastify.log.error(e);
      return reply.status(500).send({ error: "Failed to parse document preview" });
    }
  });

  fastify.post('/', async (request, reply) => {
    const { title } = CreateCaseSchema.parse(request.body);
    const { tenantId, userId } = request.auth;

    const newCase = await withTenant(tenantId, (tx) =>
      tx.case.create({
        data: {
          title,
          tenantId,
          accessList: {
            create: {
              userId,
              role: 'ADMIN'
            }
          }
        }
      })
    );

    return { success: true, caseId: newCase.id };
  });

  fastify.get('/', async (request) => {
    const { tenantId, userId } = request.auth;

    const cases = await withTenant(tenantId, (tx) =>
      tx.case.findMany({
        where: {
          tenantId,
          accessList: {
            some: { userId }
          }
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          accessList: {
            where: { userId },
            select: { role: true }
          }
        }
      })
    );

    return cases;
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId: id, userId } }
      });

      if (!access) return reply.status(403).send({ error: 'Forbidden' });

      const caseData = await tx.case.findUnique({
        where: { id },
        include: {
          documents: {
            include: { chunks: true }
          }
        }
      });

      if (!caseData) return reply.status(404).send({ error: 'Case not found' });

      return caseData;
    });
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title } = request.body as { title: string };
    const { tenantId, userId } = request.auth;

    // RLS-scoped like every other tenant query (bare prisma here bypassed RLS)
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId: id, userId } }
      });

      if (!access || access.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Forbidden: Requires ADMIN access' });
      }

      return tx.case.update({
        where: { id },
        data: { title }
      });
    });
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId: id, userId } }
      });

      if (!access || access.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Forbidden: Requires ADMIN access' });
      }

      const docs = await tx.document.findMany({ where: { caseId: id } });
      const docIds = docs.map(d => d.id);

      await tx.documentChunk.deleteMany({ where: { documentId: { in: docIds } } });
      await tx.document.deleteMany({ where: { caseId: id } });
      // AuditLog rows are append-only by trigger and deliberately survive the
      // case (retention matrix, system design §11a.2) — deleting them here
      // used to throw. The full scoped-deletion workflow is OPS-4 (M6).
      await tx.caseAccess.deleteMany({ where: { caseId: id } });
      await tx.case.delete({ where: { id } });

      return { success: true };
    });
  });

  fastify.get('/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    // Tenant + case-access check BEFORE the stream opens (ENG-4): progress
    // events must never leak across cases or tenants.
    const access = await withTenant(tenantId, (tx) =>
      tx.caseAccess.findUnique({
        where: { caseId_userId: { caseId: id, userId } }
      })
    );
    if (!access) return reply.status(403).send({ error: 'Forbidden' });

    // Hijacking the raw response skips Fastify's send, so headers the CORS
    // plugin set on the reply (Access-Control-Allow-Origin/-Credentials,
    // Vary) never reached the wire — the browser killed the stream with a
    // CORS error in production (2026-09-05). Forward them; the plugin's
    // origin allowlist still decides what they contain.
    for (const [k, v] of Object.entries(reply.getHeaders())) {
      if (v !== undefined) reply.raw.setHeader(k, v as string | number | string[]);
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const subscriber = createConnection();
    const channel = `case-progress:${id}`;

    await subscriber.subscribe(channel);

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    // Heartbeat comment defeats idle-proxy timeouts (sse_streaming.md)
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });
  });
}
