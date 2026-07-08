import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 20000, // generous timeout: later DB tests run in-memory migrations on first use
    hookTimeout: 20000, // beforeEach makeTestDb() does the same in-memory migration work as testTimeout covers
    // Each DB-backed test file spins up its own PGlite (WASM Postgres) instance. Running
    // files in parallel starves them of CPU under the default thread pool and produces
    // nondeterministic hookTimeout failures (confirmed empirically while adding more DB
    // test files in Task 2A-8). Serializing files trades wall time for a deterministic gate.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
