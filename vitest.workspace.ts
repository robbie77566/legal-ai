import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/api',
  'packages/database',
  'packages/case-lifecycle',
  'packages/ai',
  'packages/reports',
  'packages/email',
  'apps/web'
]);
