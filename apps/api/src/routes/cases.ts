import { FastifyInstance } from 'fastify';
import IORedis from 'ioredis';
import { z } from 'zod';
import prisma from '@hg/database';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdfParse from 'pdf-parse';
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
    const providedTenantId = request.headers['x-tenant-id'] as string;
    const providedUserId = request.headers['x-user-id'] as string;
    
    // Fallback to system tenant if none provided
    let tenantId = providedTenantId;
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      if (!tenant) throw new Error("No tenant found in the database. Please run seed script.");
      tenantId = tenant.id;
    }

    const newCase = await prisma.case.create({
      data: {
        title,
        tenantId,
        ...(providedUserId ? {
          accessList: {
            create: {
              userId: providedUserId,
              role: 'ADMIN'
            }
          }
        } : {})
      }
    });
    
    return { success: true, caseId: newCase.id };
  });

  fastify.get('/', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'] as string;
    const userId = request.headers['x-user-id'] as string;

    if (!tenantId) {
      return reply.status(400).send({ error: 'x-tenant-id header is required' });
    }

    const cases = await prisma.case.findMany({
      where: {
        tenantId,
        ...(userId ? {
          accessList: {
            some: {
              userId
            }
          }
        } : {})
      },
      orderBy: {
        updatedAt: 'desc'
      },
      include: {
        accessList: {
          where: { userId },
          select: { role: true }
        }
      }
    });

    return cases;
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const caseData = await prisma.case.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            chunks: true
          }
        }
      }
    });

    if (!caseData) {
      return reply.status(404).send({ error: 'Case not found' });
    }

    return caseData;
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title } = request.body as { title: string };
    const userId = request.headers['x-user-id'] as string;

    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    // Ensure the user has ADMIN rights for this case
    const access = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId: id, userId } }
    });

    if (!access || access.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden: Requires ADMIN access' });
    }

    const updatedCase = await prisma.case.update({
      where: { id },
      data: { title }
    });

    return updatedCase;
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.headers['x-user-id'] as string;

    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    // Ensure the user has ADMIN rights for this case
    const access = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId: id, userId } }
    });

    if (!access || access.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden: Requires ADMIN access' });
    }

    // Prisma doesn't always handle deeply nested cascade deletes well if not configured on the schema
    // So we manually clean up dependencies to be safe
    const docs = await prisma.document.findMany({ where: { caseId: id }});
    const docIds = docs.map(d => d.id);
    
    await prisma.documentChunk.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.document.deleteMany({ where: { caseId: id } });
    await prisma.auditLog.deleteMany({ where: { caseId: id } });
    await prisma.caseAccess.deleteMany({ where: { caseId: id } });
    
    await prisma.case.delete({
      where: { id }
    });

    return { success: true };
  });

  fastify.get('/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const subscriber = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
    const channel = `case-progress:${id}`;
    
    await subscriber.subscribe(channel);
    
    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    // Cleanup on disconnect
    request.raw.on('close', () => {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });
  });
}
