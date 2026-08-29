import * as dotenv from 'dotenv';
import path from 'path';
// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify'
import cors from '@fastify/cors'
import uploadRoutes from './routes/upload'
import casesRoutes from './routes/cases'
import permissionsRoutes from './routes/permissions'
import fastifyMultipart from '@fastify/multipart';
import IORedis from 'ioredis';
import { REDIS_URL } from './lib/redis';

export const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true // Allow Next.js frontend to communicate in dev
})

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB — accommodates ZIP archives containing PDFs and transcripts
  }
})

fastify.register(uploadRoutes, { prefix: '/upload' })
fastify.register(casesRoutes, { prefix: '/cases' })
fastify.register(permissionsRoutes, { prefix: '/permissions' })

fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

async function probeRedis(): Promise<boolean> {
  const probe = new IORedis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: null,
    retryStrategy: () => null // one attempt only — no reconnect loop
  });
  probe.on('error', () => {}); // suppress events; we only care about the connect() outcome
  try {
    await probe.connect();
    await probe.quit();
    return true;
  } catch {
    probe.disconnect(false);
    return false;
  }
}

const start = async () => {
  const redisAvailable = await probeRedis();

  if (redisAvailable) {
    // Start queue workers (they connect to Redis on import)
    await Promise.all([
      import('./workers/ingestion.worker'),
      import('./workers/entity.worker'),
      import('./workers/media.worker'),
    ]);

    // Register Bull Board (requires active queue connections)
    const { createBullBoard } = await import('@bull-board/api');
    const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
    const { FastifyAdapter } = await import('@bull-board/fastify');
    const { ingestionQueue, graphQueue, mediaQueue } = await import('./services/queue');

    const serverAdapter = new FastifyAdapter();
    createBullBoard({
      queues: [
        new BullMQAdapter(ingestionQueue),
        new BullMQAdapter(graphQueue),
        new BullMQAdapter(mediaQueue)
      ],
      serverAdapter,
    });
    serverAdapter.setBasePath('/admin/queues');
    fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues', basePath: '/admin/queues' });
  } else {
    console.warn(
      `[Redis] Not reachable at ${REDIS_URL} — queue workers and /admin/queues disabled.\n` +
      `  Start services: docker compose up redis -d`
    );
  }

  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  start()
}
