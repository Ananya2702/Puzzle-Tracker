import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 20000, // pglite migration setup can be slow on first run
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
