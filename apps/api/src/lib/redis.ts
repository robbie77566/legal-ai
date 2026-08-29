import IORedis from 'ioredis';

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Creates a BullMQ-compatible IORedis connection with a single-warn error handler.
 *  Without this, every reconnection attempt (dozens per minute) prints a stack trace. */
export function createConnection(): IORedis {
  const client = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  let warned = false;
  client.on('error', (err: Error) => {
    if (!warned) {
      warned = true;
      console.warn(
        `[Redis] ${err.message}\n` +
        `  Queue workers are disabled until Redis is available.\n` +
        `  Start it with: docker compose up redis -d`
      );
    }
  });
  client.on('connect', () => {
    warned = false;
  });
  return client;
}
