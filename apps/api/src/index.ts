import * as dotenv from 'dotenv';
import path from 'path';
// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify'
import cors from '@fastify/cors'
import uploadRoutes from './routes/upload'
import casesRoutes from './routes/cases'

// Import workers to ensure they start processing queues
import './workers/ingestion.worker';
import './workers/entity.worker';
import './workers/media.worker';

export const fastify = Fastify({
  logger: true
})

fastify.register(cors, {
  origin: true // Allow Next.js frontend to communicate in dev
})

fastify.register(uploadRoutes, { prefix: '/upload' })
fastify.register(casesRoutes, { prefix: '/cases' })

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
