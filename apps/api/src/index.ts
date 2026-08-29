import * as dotenv from 'dotenv';
import path from 'path';
// Load root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify'
import cors from '@fastify/cors'
import * as Sentry from '@sentry/node'
import uploadRoutes from './routes/upload'
import casesRoutes from './routes/cases'
import permissionsRoutes from './routes/permissions'
import fastifyMultipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import IORedis from 'ioredis';
import { REDIS_URL } from './lib/redis';
import { registerAuth } from './plugins/auth';

// Observability baseline (M0). No DSN → no-op; workers share this process so
// one init covers API + queue workers.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}

export const fastify = Fastify({
  // Structured logging with PII scrubbing: credentials and cookies never land
  // in logs (data class C1/C2 rule, system design §11a.1).
  logger: {
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  },
})

fastify.addHook('onError', async (_request, _reply, error) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(error)
})

// CORS pinned to the web origin (never `origin: true` — credentials flow here)
fastify.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  credentials: true
})

// Every route below requires a verified NextAuth session (plugins/auth.ts).
registerAuth(fastify)

// Rate limiting (launch gate 4a / SRE-6). Redis-backed so limits hold across
// instances; enableOfflineQueue:false + skipOnError:true make it fail-open
// when Redis is down (dev graceful-degradation path) instead of hanging.
const useRedisStore = process.env.NODE_ENV !== 'test';
const rateLimitRedis = useRedisStore
  ? new IORedis(REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: null })
  : undefined;
rateLimitRedis?.on('error', () => {}); // limiter skips on error; don't spam logs
fastify.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  skipOnError: true,
  ...(rateLimitRedis ? { redis: rateLimitRedis } : {}),
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
    ]);

    // Transactional-outbox publisher (M1): tails unpublished CaseEvents and
    // publishes the customer-visible view to case-progress:{caseId}. The
    // legacy workers still publish their own ad-hoc messages; those move to
    // appendCaseEvent when M3/M4 replace them.
    const { startCaseEventOutbox } = await import('@hg/database');
    const { createConnection } = await import('./lib/redis');
    const stopOutbox = startCaseEventOutbox(createConnection(), {
      onError: (e) => fastify.log.error({ err: e }, 'case-event outbox publish failed'),
    });
    process.on('SIGTERM', stopOutbox);
    process.on('SIGINT', stopOutbox);

    // Register Bull Board (requires active queue connections)
    const { createBullBoard } = await import('@bull-board/api');
    const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
    const { FastifyAdapter } = await import('@bull-board/fastify');
    const { ingestionQueue, graphQueue } = await import('./services/queue');

    const serverAdapter = new FastifyAdapter();
    createBullBoard({
      queues: [
        new BullMQAdapter(ingestionQueue),
        new BullMQAdapter(graphQueue)
      ],
      serverAdapter,
    });
    serverAdapter.setBasePath('/admin/queues');
    fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' });
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
