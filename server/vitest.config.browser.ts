import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { browserTestEnvironment } from './test/browser/environment.js';

export default defineConfig({
  envDir: false,
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/browser/*.browser-fixture.ts'],
    globalSetup: ['./test/browser/setup.ts'],
    env: browserTestEnvironment,
    hookTimeout: 30_000,
  },
});
