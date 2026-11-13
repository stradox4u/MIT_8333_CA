import { defineConfig } from 'vitest/config';
import e2e from './vitest.config.e2e.js';

export default defineConfig({
  ...e2e,
  test: {
    ...e2e.test,
    include: ['test/**/*.postgres-spec.ts'],
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
