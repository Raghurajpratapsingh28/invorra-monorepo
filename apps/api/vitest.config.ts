import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/mongo-env.ts', './tests/setup.ts'],
  },
});
