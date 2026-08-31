import { defineConfig } from 'tsup';

/**
 * Production build (go_live_readiness P0-1/2): workspace packages are
 * TypeScript source (`main: index.ts`), so they MUST be bundled — an
 * external @hg/* import crashes `node dist/index.js` on raw TS. Their
 * third-party deps stay external and are declared as real dependencies
 * of the api package so pnpm places them resolvably.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  noExternal: [/^@hg\//],
  clean: true,
});
