import { FastifyInstance } from 'fastify';
import IORedis from 'ioredis';
import { z } from 'zod';
import prisma from '@hg/database';

const CreateCaseSchema = z.object({
  title: z.string(),
  defendant: z.string().optional(),
  jurisdiction: z.string().optional()
});

export default async function casesRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const { title } = CreateCaseSchema.parse(request.body);
    
    // Using a system tenant for the MVP since we haven't wired full Auth
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      throw new Error("No tenant found in the database. Please run seed script.");
    }

    const newCase = await prisma.case.create({
      data: {
        title,
        tenantId: tenant.id
      }
    });
    
    return { success: true, caseId: newCase.id };
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const caseData = await prisma.case.findUnique({
      where: { id },
      include: {
        documents: true
      }
    });

    if (!caseData) {
      return reply.status(404).send({ error: 'Case not found' });
    }

    return caseData;
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
