import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 20000, // generous timeout: later DB tests run in-memory migrations on first use
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
