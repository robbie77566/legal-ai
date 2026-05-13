import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/api',
  'packages/database',
  'packages/ai',
  'apps/web'
]);
