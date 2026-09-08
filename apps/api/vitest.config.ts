import { defineConfig } from 'vitest/config';

// The api suites are live-Postgres integration tests; each file boots the
// Fastify app with its own Prisma pools. Bound the parallelism so the whole
// workspace stays well under Postgres's connection cap (see
// packages/database/index.ts withTestPoolCap).
export default defineConfig({
  test: {
    poolOptions: { threads: { maxThreads: 6, minThreads: 1 } },
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
