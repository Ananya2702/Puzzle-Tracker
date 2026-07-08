import { defineConfig } from '@playwright/test';

// E2E needs a real Postgres. Either:
//   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
//   E2E_DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks
// or point E2E_DATABASE_URL at a disposable Neon branch.
// Run migrations first: DATABASE_URL=$E2E_DATABASE_URL npx drizzle-kit migrate
const dbUrl = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:pg@localhost:5433/puzzlegeeks';

export default defineConfig({
  testDir: './e2e',
  // Single worker: the dev server (Turbopack) JIT-compiles each route on first
  // hit, and two workers hitting distinct cold routes concurrently can push
  // navigation past the default expect timeout.
  workers: 1,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    env: { DATABASE_URL: dbUrl, AUTH_SECRET: 'e2e-secret-not-for-prod-0123456789' },
  },
});
