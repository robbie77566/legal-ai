import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
      '**/.next/**'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  },
  esbuild: {
    jsxInject: `import React from 'react'`
  }
});
