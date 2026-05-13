import * as dotenv from 'dotenv';
import path from 'path';
// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify'
import cors from '@fastify/cors'
import uploadRoutes from './routes/upload'
import casesRoutes from './routes/cases'
import permissionsRoutes from './routes/permissions'

// Import workers to ensure they start processing queues
import './workers/ingestion.worker';
import './workers/entity.worker';
import './workers/media.worker';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { ingestionQueue, graphQueue, mediaQueue } from './services/queue';

import fastifyMultipart from '@fastify/multipart';

export const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true // Allow Next.js frontend to communicate in dev
})

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
})

fastify.register(uploadRoutes, { prefix: '/upload' })
fastify.register(casesRoutes, { prefix: '/cases' })
fastify.register(permissionsRoutes, { prefix: '/permissions' })

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

fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

const start = async () => {
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
