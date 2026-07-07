# Puzzle Geeks Revamp — Plan 1 of 3: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new Next.js app (in `web/`) with database schema, auth (credentials + Google), the two-theme system, the app shell, and a landing page — deployable to Vercel.

**Architecture:** Next.js 15 App Router + TypeScript app living in `web/` beside the untouched Flask app. Drizzle ORM over Postgres (Neon serverless driver in prod, node-postgres locally, PGlite in unit tests — all Postgres dialect). Auth.js v5 with JWT sessions: a Credentials provider that verifies the existing Python bcrypt hashes, plus optional Google OAuth that upserts into our own `users`/`oauth_accounts` tables (no adapter).

**Tech Stack:** Next.js 15 (App Router, `src/` dir, `@/*` alias), TypeScript strict, vanilla CSS with custom properties (NO Tailwind), drizzle-orm + drizzle-kit, @neondatabase/serverless, pg, @electric-sql/pglite (tests), next-auth@5 (Auth.js), bcryptjs, zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-07-puzzle-geeks-revamp-design.md`. Plans 2 (core features: logging, history, dashboard, analytics, goals/awards) and 3 (cockpit timer, PWA, migration, cutover) follow after this plan is executed.

## Global Constraints

- All work happens under `web/` unless a task says otherwise. Never modify `app.py`, `templates/`, `static/`, `render.yaml`, `Procfile`, `requirements.txt`.
- Node 20+, npm (not pnpm/yarn). TypeScript `strict: true` (create-next-app default — do not weaken).
- NO Tailwind, NO CSS-in-JS. Styling = `globals.css` custom properties + plain CSS files imported by components.
- Theme names are exactly `midnight` (default) and `cozy`, applied as `data-theme` on `<html>`; localStorage key is `pg-theme`.
- All durations are integer **seconds**; all dates are `YYYY-MM-DD` strings.
- Product name in UI copy: **Puzzle Geeks**.
- Every task: run `npm run lint` and `npx tsc --noEmit` (from `web/`) before its commit; both must be clean.
- Commit messages: conventional (`feat:`, `test:`, `chore:`), ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure (end state of this plan)

```
web/
  drizzle/                      # generated SQL migrations (committed)
  drizzle.config.ts
  vitest.config.ts
  playwright.config.ts
  .env.example
  e2e/auth.spec.ts
  src/
    middleware.ts
    auth.ts                     # full Auth.js config (server-only)
    auth.config.ts              # edge-safe partial config (middleware)
    types/next-auth.d.ts
    db/
      schema.ts                 # all tables
      index.ts                  # getDb(): neon-http | node-postgres
      test-db.ts                # makeTestDb(): pglite + migrations
    lib/
      time.ts                   # formatDuration/parseDuration
      password.ts               # bcryptjs hash/verify
      users.ts                  # createUser/verifyCredentials/findOrCreateGoogleUser/setTheme
      __tests__/                # vitest unit tests
    components/
      ThemeProvider.tsx
      ThemePicker.tsx
      Sidebar.tsx
      shell.css
    app/
      layout.tsx                # root layout + no-flash theme script
      globals.css               # theme tokens + base styles
      page.tsx                  # landing (logged-out) / redirect to /dashboard
      login/page.tsx
      register/page.tsx
      api/auth/[...nextauth]/route.ts
      api/register/route.ts
      api/me/theme/route.ts
      (app)/
        layout.tsx              # shell: sidebar + bottom tabs
        dashboard/page.tsx  timer/page.tsx  log/page.tsx  history/page.tsx
        analytics/page.tsx  goals/page.tsx  awards/page.tsx  settings/page.tsx
```

---

### Task 1: Scaffold Next.js app + Vitest + first utility (TDD)

**Files:**
- Create: `web/` (via create-next-app), `web/vitest.config.ts`, `web/src/lib/time.ts`, `web/src/lib/__tests__/time.test.ts`

**Interfaces:**
- Produces: `formatDuration(totalSeconds: number): string` and `parseDuration(input: string): number | null` in `@/lib/time` — used by every later plan (timer, history, charts).

- [ ] **Step 1: Scaffold the app**

From the repo root:

```bash
npx create-next-app@15 web --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --turbopack --yes
```

Expected: `web/` created; `cd web && npm run dev` serves the starter page (Ctrl-C after checking).

- [ ] **Step 2: Install and configure Vitest**

```bash
cd web && npm i -D vitest
```

Create `web/vitest.config.ts`:

```ts
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
```

Add to `web/package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 3: Write the failing test**

Create `web/src/lib/__tests__/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDuration, parseDuration } from '@/lib/time';

describe('formatDuration', () => {
  it('formats hours, minutes, seconds', () => {
    expect(formatDuration(6127)).toBe('1:42:07');
  });
  it('formats minutes and seconds without hours', () => {
    expect(formatDuration(754)).toBe('12:34');
  });
  it('formats sub-minute times', () => {
    expect(formatDuration(59)).toBe('0:59');
  });
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
  it('floors fractional seconds', () => {
    expect(formatDuration(61.9)).toBe('1:01');
  });
});

describe('parseDuration', () => {
  it('parses h:mm:ss', () => {
    expect(parseDuration('1:42:07')).toBe(6127);
  });
  it('parses m:ss', () => {
    expect(parseDuration('12:34')).toBe(754);
  });
  it('parses bare minutes', () => {
    expect(parseDuration('42')).toBe(2520);
  });
  it('trims whitespace', () => {
    expect(parseDuration(' 1:00:00 ')).toBe(3600);
  });
  it('rejects garbage', () => {
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:99')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — cannot resolve `@/lib/time`.

- [ ] **Step 5: Implement**

Create `web/src/lib/time.ts`:

```ts
/** 6127 -> "1:42:07"; 754 -> "12:34"; 59 -> "0:59" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** Accepts "h:mm:ss", "m:ss", or bare minutes "42". Returns total seconds or null. */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60;
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  const [a, b, c] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (b > 59 || c > 59) return null;
  if (nums.length === 3 && nums[0] > 0 && nums[1] > 59) return null;
  return a * 3600 + b * 60 + c;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: scaffold Next.js app with vitest and duration utils

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Drizzle schema, migrations, and DB clients

**Files:**
- Create: `web/src/db/schema.ts`, `web/src/db/index.ts`, `web/src/db/test-db.ts`, `web/drizzle.config.ts`, `web/drizzle/` (generated), `web/src/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces: all table objects from `@/db/schema` (`users`, `oauthAccounts`, `puzzles`, `solves`, `splits`, `goals`, `achievements`, `settings`); `getDb(): Db` from `@/db`; `makeTestDb(): Promise<Db>` from `@/db/test-db`; type `Db` (works for all three drivers).
- Consumes: nothing.

- [ ] **Step 1: Install dependencies**

```bash
cd web && npm i drizzle-orm @neondatabase/serverless pg && npm i -D drizzle-kit @electric-sql/pglite @types/pg
```

- [ ] **Step 2: Write the failing test**

Create `web/src/db/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { users, solves } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('schema', () => {
  it('round-trips a user and a solve', async () => {
    const db = await makeTestDb();
    const [u] = await db
      .insert(users)
      .values({ username: 'maya', email: 'maya@example.com', passwordHash: 'x' })
      .returning();
    expect(u.theme).toBe('midnight'); // default
    expect(u.xp).toBe(0);

    const [s] = await db
      .insert(solves)
      .values({
        userId: u.id,
        date: '2026-07-07',
        pieces: 1000,
        timeSeconds: 6127,
        scaledTimeSeconds: 6127,
      })
      .returning();
    expect(s.puzzleType).toBe('solo');
    expect(s.isPersonalBest).toBe(false);

    const found = await db.select().from(solves).where(eq(solves.userId, u.id));
    expect(found).toHaveLength(1);
    expect(found[0].timeSeconds).toBe(6127);
  });

  it('enforces unique username', async () => {
    const db = await makeTestDb();
    await db.insert(users).values({ username: 'sam', email: 'a@a.com', passwordHash: 'x' });
    await expect(
      db.insert(users).values({ username: 'sam', email: 'b@b.com', passwordHash: 'x' }),
    ).rejects.toThrow();
  });

  it('enforces one import per (user, sourceId) but allows many NULL sourceIds', async () => {
    const db = await makeTestDb();
    const [u] = await db
      .insert(users)
      .values({ username: 'kai', email: 'k@k.com', passwordHash: 'x' })
      .returning();
    const base = { userId: u.id, date: '2026-01-01', pieces: 500, timeSeconds: 100, scaledTimeSeconds: 100 };
    await db.insert(solves).values({ ...base, sourceId: 'msp-1' });
    await expect(db.insert(solves).values({ ...base, sourceId: 'msp-1' })).rejects.toThrow();
    await db.insert(solves).values({ ...base });
    await db.insert(solves).values({ ...base }); // two NULLs fine
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/db/test-db`.

- [ ] **Step 4: Write the schema**

Create `web/src/db/schema.ts`:

```ts
import {
  pgTable, serial, text, integer, real, boolean, timestamp,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // null for OAuth-only accounts
  theme: text('theme').notNull().default('midnight'),
  xp: integer('xp').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// Shared catalog (Phase 2 fills this in; schema ships now so migrations stay linear)
export const puzzles = pgTable(
  'puzzles',
  {
    id: serial('id').primaryKey(),
    brand: text('brand').notNull().default(''),
    title: text('title').notNull(),
    pieceCount: integer('piece_count').notNull(),
    imageUrl: text('image_url'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_puzzles_piece_count').on(t.pieceCount)],
);

export const solves = pgTable(
  'solves',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    puzzleId: integer('puzzle_id').references(() => puzzles.id),
    date: text('date').notNull(), // YYYY-MM-DD
    pieces: integer('pieces').notNull(),
    timeSeconds: integer('time_seconds').notNull(),
    scaledTimeSeconds: real('scaled_time_seconds').notNull(),
    puzzleName: text('puzzle_name').notNull().default(''),
    brand: text('brand').notNull().default(''),
    difficultyRating: integer('difficulty_rating').notNull().default(3),
    notes: text('notes').notNull().default(''),
    tags: text('tags').notNull().default(''),
    isPersonalBest: boolean('is_personal_best').notNull().default(false),
    puzzleType: text('puzzle_type').notNull().default('solo'), // solo | duo | team
    firstAttempt: boolean('first_attempt').notNull().default(false),
    source: text('source').notNull().default(''), // '' | 'speedpuzzling' | 'csv'
    sourceId: text('source_id'), // myspeedpuzzling result_id (dedupe key)
    communityAvgTime: integer('community_avg_time'),
    communityBestTime: integer('community_best_time'),
    playerRank: integer('player_rank'),
    communitySolvers: integer('community_solvers'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_solves_user_date').on(t.userId, t.date),
    index('idx_solves_user_pieces').on(t.userId, t.pieces),
    uniqueIndex('uq_solves_user_source').on(t.userId, t.sourceId),
  ],
);

export const splits = pgTable(
  'splits',
  {
    id: serial('id').primaryKey(),
    solveId: integer('solve_id').notNull().references(() => solves.id, { onDelete: 'cascade' }),
    phase: text('phase').notNull(), // e.g. 'edge', 'sort', 'assembly'
    seconds: integer('seconds').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('idx_splits_solve').on(t.solveId)],
);

export const goals = pgTable('goals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pieces: integer('pieces').notNull(),
  targetTimeSeconds: integer('target_time_seconds').notNull(),
  description: text('description').notNull().default(''),
  achieved: boolean('achieved').notNull().default(false),
  achievedDate: text('achieved_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const achievements = pgTable(
  'achievements',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    unlocked: boolean('unlocked').notNull().default(false),
    unlockedDate: text('unlocked_date'),
  },
  (t) => [uniqueIndex('uq_achievements_user_code').on(t.userId, t.code)],
);

export const settings = pgTable(
  'settings',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
```

- [ ] **Step 5: Configure drizzle-kit and generate the migration**

Create `web/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

Run: `npx drizzle-kit generate --name init`
Expected: `web/drizzle/0000_init.sql` created (commit it — migrations are code).

- [ ] **Step 6: Write the DB clients**

Create `web/src/db/index.ts`:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

// Common supertype of the neon-http, node-postgres, and pglite drizzle clients,
// so services and tests share one signature.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let _db: Db | undefined;

export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _db = url.includes('neon.tech')
      ? (drizzleNeon(neon(url), { schema }) as unknown as Db)
      : (drizzleNode(new Pool({ connectionString: url }), { schema }) as unknown as Db);
  }
  return _db;
}
```

Create `web/src/db/test-db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import type { Db } from './index';
import * as schema from './schema';

/** Fresh in-memory Postgres with all migrations applied. One per test file/case. */
export async function makeTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  return db as unknown as Db;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: all pass (schema round-trip proves migrations run on PGlite).

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: drizzle schema, migrations, neon/node/pglite clients

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Password + user services

**Files:**
- Create: `web/src/lib/password.ts`, `web/src/lib/users.ts`, `web/src/lib/__tests__/password.test.ts`, `web/src/lib/__tests__/users.test.ts`

**Interfaces:**
- Consumes: `makeTestDb`, `users`, `oauthAccounts` from Task 2.
- Produces:
  - `hashPassword(pw: string): Promise<string>`, `verifyPassword(pw: string, hash: string): Promise<boolean>`
  - `registerSchema` (zod), `createUser(db, {username,email,password})` → `PublicUser` or throws `Error('USERNAME_TAKEN' | 'EMAIL_TAKEN')`
  - `verifyCredentials(db, identifier, password)` → `PublicUser | null` (identifier = username or email)
  - `findOrCreateGoogleUser(db, {email, name, providerAccountId})` → `PublicUser`
  - `setTheme(db, userId, theme: 'midnight' | 'cozy')`
  - `type PublicUser = { id: number; username: string; email: string; theme: string }`

- [ ] **Step 1: Install deps**

```bash
cd web && npm i bcryptjs zod
```

(bcryptjs ships its own types; add `npm i -D @types/bcryptjs` only if `tsc` complains.)

- [ ] **Step 2: Generate a real Python bcrypt hash for the compat test**

The whole point of `verifyPassword` is that hashes made by the Flask app keep working. Generate one with the repo's Python venv:

```bash
cd .. && ./venv/bin/python -c "import bcrypt; print(bcrypt.hashpw(b'legacy-pass-123', bcrypt.gensalt()).decode())"
```

Copy the printed `$2b$...` string into the test in Step 3. (If the venv is missing: `python3 -m venv venv && ./venv/bin/pip install bcrypt`.)

- [ ] **Step 3: Write the failing password test**

Create `web/src/lib/__tests__/password.test.ts` (replace `PASTE_PYTHON_HASH_HERE` with Step 2's output):

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

const PYTHON_BCRYPT_HASH = 'PASTE_PYTHON_HASH_HERE';

describe('password', () => {
  it('verifies a hash produced by the Flask app (python bcrypt, $2b$)', async () => {
    expect(await verifyPassword('legacy-pass-123', PYTHON_BCRYPT_HASH)).toBe(true);
    expect(await verifyPassword('wrong', PYTHON_BCRYPT_HASH)).toBe(false);
  });

  it('round-trips its own hashes', async () => {
    const h = await hashPassword('new-pass-456');
    expect(h.startsWith('$2')).toBe(true);
    expect(await verifyPassword('new-pass-456', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- password`
Expected: FAIL — cannot resolve `@/lib/password`.

- [ ] **Step 5: Implement password.ts**

```ts
import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

Run: `npm test -- password` → 2 passed.

- [ ] **Step 6: Write the failing users test**

Create `web/src/lib/__tests__/users.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import {
  createUser, verifyCredentials, findOrCreateGoogleUser, setTheme, registerSchema,
} from '@/lib/users';

describe('registerSchema', () => {
  it('accepts valid input', () => {
    expect(
      registerSchema.safeParse({ username: 'maya_1', email: 'm@x.com', password: 'longenough' }).success,
    ).toBe(true);
  });
  it('rejects short username, bad email, short password', () => {
    expect(registerSchema.safeParse({ username: 'ab', email: 'm@x.com', password: 'longenough' }).success).toBe(false);
    expect(registerSchema.safeParse({ username: 'maya', email: 'nope', password: 'longenough' }).success).toBe(false);
    expect(registerSchema.safeParse({ username: 'maya', email: 'm@x.com', password: 'short' }).success).toBe(false);
  });
});

describe('user services', () => {
  it('creates a user and verifies credentials by username or email', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'maya', email: 'maya@x.com', password: 'longenough' });
    expect(u.username).toBe('maya');
    expect(await verifyCredentials(db, 'maya', 'longenough')).toMatchObject({ id: u.id });
    expect(await verifyCredentials(db, 'maya@x.com', 'longenough')).toMatchObject({ id: u.id });
    expect(await verifyCredentials(db, 'maya', 'wrongpass')).toBeNull();
    expect(await verifyCredentials(db, 'ghost', 'longenough')).toBeNull();
  });

  it('throws typed errors on duplicates', async () => {
    const db = await makeTestDb();
    await createUser(db, { username: 'sam', email: 'sam@x.com', password: 'longenough' });
    await expect(createUser(db, { username: 'sam', email: 'other@x.com', password: 'longenough' }))
      .rejects.toThrow('USERNAME_TAKEN');
    await expect(createUser(db, { username: 'other', email: 'sam@x.com', password: 'longenough' }))
      .rejects.toThrow('EMAIL_TAKEN');
  });

  it('findOrCreateGoogleUser links existing email, creates new otherwise, and is idempotent', async () => {
    const db = await makeTestDb();
    const existing = await createUser(db, { username: 'kai', email: 'kai@x.com', password: 'longenough' });
    const linked = await findOrCreateGoogleUser(db, { email: 'kai@x.com', name: 'Kai', providerAccountId: 'g-1' });
    expect(linked.id).toBe(existing.id);

    const fresh = await findOrCreateGoogleUser(db, { email: 'new@x.com', name: 'New Person', providerAccountId: 'g-2' });
    expect(fresh.username.length).toBeGreaterThanOrEqual(3);
    const again = await findOrCreateGoogleUser(db, { email: 'new@x.com', name: 'New Person', providerAccountId: 'g-2' });
    expect(again.id).toBe(fresh.id);
  });

  it('setTheme persists', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'zoe', email: 'z@x.com', password: 'longenough' });
    await setTheme(db, u.id, 'cozy');
    expect((await verifyCredentials(db, 'zoe', 'longenough'))?.theme).toBe('cozy');
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- users`
Expected: FAIL — cannot resolve `@/lib/users`.

- [ ] **Step 8: Implement users.ts**

```ts
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { hashPassword, verifyPassword } from './password';

export type PublicUser = { id: number; username: string; email: string; theme: string };

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username: 3-30 letters, numbers, underscores'),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id, username: u.username, email: u.email, theme: u.theme,
});

export async function createUser(db: Db, input: z.infer<typeof registerSchema>): Promise<PublicUser> {
  const [byName] = await db.select().from(users).where(eq(users.username, input.username));
  if (byName) throw new Error('USERNAME_TAKEN');
  const [byEmail] = await db.select().from(users).where(eq(users.email, input.email));
  if (byEmail) throw new Error('EMAIL_TAKEN');
  const [row] = await db
    .insert(users)
    .values({ username: input.username, email: input.email, passwordHash: await hashPassword(input.password) })
    .returning();
  return toPublic(row);
}

export async function verifyCredentials(db: Db, identifier: string, password: string): Promise<PublicUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)));
  if (!row?.passwordHash) return null;
  return (await verifyPassword(password, row.passwordHash)) ? toPublic(row) : null;
}

export async function findOrCreateGoogleUser(
  db: Db,
  input: { email: string; name: string; providerAccountId: string },
): Promise<PublicUser> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email));
  const user =
    existing ??
    (await db
      .insert(users)
      .values({ username: await availableUsername(db, input.email), email: input.email, passwordHash: null })
      .returning())[0];
  await db
    .insert(oauthAccounts)
    .values({ provider: 'google', providerAccountId: input.providerAccountId, userId: user.id })
    .onConflictDoNothing();
  return toPublic(user);
}

async function availableUsername(db: Db, email: string): Promise<string> {
  const base = (email.split('@')[0] ?? 'puzzler').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'puzzler';
  const padded = base.length >= 3 ? base : `${base}_puzzler`.slice(0, 24);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? padded : `${padded}${Math.floor(Math.random() * 10000)}`;
    const [hit] = await db.select().from(users).where(eq(users.username, candidate));
    if (!hit) return candidate;
  }
  throw new Error('USERNAME_GENERATION_FAILED');
}

export async function setTheme(db: Db, userId: number, theme: 'midnight' | 'cozy'): Promise<void> {
  await db.update(users).set({ theme }).where(eq(users.id, userId));
}
```

- [ ] **Step 9: Run full suite to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: password hashing (python-bcrypt compatible) and user services

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Auth.js wiring — credentials + Google, register API, login/register pages

**Files:**
- Create: `web/src/auth.config.ts`, `web/src/auth.ts`, `web/src/middleware.ts`, `web/src/types/next-auth.d.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/app/api/register/route.ts`, `web/src/app/login/page.tsx`, `web/src/app/register/page.tsx`, `web/src/app/auth-forms.css`, `web/src/app/api/__tests__/register.test.ts`, `web/.env.example`
- Modify: `web/.gitignore` (ensure `.env*.local` ignored — create-next-app default already does)

**Interfaces:**
- Consumes: `verifyCredentials`, `findOrCreateGoogleUser`, `createUser`, `registerSchema` (Task 3); `getDb` (Task 2).
- Produces: `auth()`, `signIn`, `signOut`, `handlers` from `@/auth`; session shape `session.user = { id: string; username: string; email; theme }`; `POST /api/register` accepting `{username, email, password}` → 201 `{id, username}` | 400 `{error}` | 409 `{error: 'USERNAME_TAKEN' | 'EMAIL_TAKEN'}`.

- [ ] **Step 1: Install and generate secret**

```bash
cd web && npm i next-auth@beta
```

Create `web/.env.local` (NOT committed):

```
AUTH_SECRET=<output of: openssl rand -base64 32>
DATABASE_URL=<your Neon DEV-BRANCH url — never prod during development>
# Optional; Google button hides itself when unset:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
```

Create `web/.env.example` with the same keys and placeholder values (committed).

- [ ] **Step 2: Write the failing register-route test**

Create `web/src/app/api/__tests__/register.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';

const state: { db: Awaited<ReturnType<typeof makeTestDb>> | null } = { db: null };
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));

import { POST } from '@/app/api/register/route';

const post = (body: unknown) =>
  POST(new Request('http://test/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

describe('POST /api/register', () => {
  beforeEach(async () => { state.db = await makeTestDb(); });

  it('creates a user (201)', async () => {
    const res = await post({ username: 'maya', email: 'm@x.com', password: 'longenough' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ username: 'maya' });
  });

  it('rejects invalid payloads (400)', async () => {
    expect((await post({ username: 'ab', email: 'm@x.com', password: 'longenough' })).status).toBe(400);
    expect((await post('not json shape')).status).toBe(400);
  });

  it('rejects duplicates (409)', async () => {
    await post({ username: 'maya', email: 'm@x.com', password: 'longenough' });
    const res = await post({ username: 'maya', email: 'other@x.com', password: 'longenough' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('USERNAME_TAKEN');
  });
});
```

Run: `npm test -- register` → FAIL (route doesn't exist).

- [ ] **Step 3: Implement the register route**

Create `web/src/app/api/register/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { createUser, registerSchema } from '@/lib/users';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  try {
    const user = await createUser(getDb(), parsed.data);
    return NextResponse.json({ id: user.id, username: user.username }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'USERNAME_TAKEN' || msg === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    throw e;
  }
}
```

Run: `npm test -- register` → 3 passed.

- [ ] **Step 4: Auth.js config (split pattern: edge-safe + full)**

Create `web/src/auth.config.ts` (NO db imports — middleware runs on edge):

```ts
import type { NextAuthConfig } from 'next-auth';

const PROTECTED = /^\/(dashboard|timer|log|history|analytics|goals|awards|settings)/;

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      if (PROTECTED.test(request.nextUrl.pathname) && !auth?.user) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.username = (user as { username?: string }).username;
        token.theme = (user as { theme?: string }).theme;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.userId);
      session.user.username = (token.username as string) ?? session.user.name ?? '';
      session.user.theme = (token.theme as string) ?? 'midnight';
      return session;
    },
  },
  providers: [], // filled in by auth.ts
} satisfies NextAuthConfig;
```

Create `web/src/auth.ts`:

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';
import { getDb } from '@/db';
import { verifyCredentials, findOrCreateGoogleUser } from '@/lib/users';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { identifier: { label: 'Username or email' }, password: { label: 'Password', type: 'password' } },
      async authorize(creds) {
        const user = await verifyCredentials(
          getDb(),
          String(creds?.identifier ?? ''),
          String(creds?.password ?? ''),
        );
        if (!user) return null;
        return { id: String(user.id), name: user.username, email: user.email, username: user.username, theme: user.theme };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        if (!user.email) return false;
        const dbUser = await findOrCreateGoogleUser(getDb(), {
          email: user.email,
          name: user.name ?? '',
          providerAccountId: account.providerAccountId,
        });
        user.id = String(dbUser.id);
        (user as { username?: string }).username = dbUser.username;
        (user as { theme?: string }).theme = dbUser.theme;
      }
      return true;
    },
  },
});
```

Create `web/src/types/next-auth.d.ts`:

```ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      theme: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

Create `web/src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

Create `web/src/middleware.ts`:

```ts
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest|icons).*)'],
};
```

- [ ] **Step 5: Login and register pages**

Create `web/src/app/auth-forms.css`:

```css
.auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.auth-card {
  width: 100%; max-width: 380px; background: var(--bg-raised);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 32px; box-shadow: var(--shadow);
}
.auth-card h1 { font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 4px; }
.auth-card .sub { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 24px; }
.auth-card label { display: block; font-size: 0.8rem; color: var(--text-muted); margin: 14px 0 4px; }
.auth-card input {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit;
}
.auth-card input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.auth-error { color: var(--danger); font-size: 0.85rem; margin-top: 12px; min-height: 1.2em; }
.auth-submit {
  width: 100%; margin-top: 18px; padding: 11px; border: none; border-radius: 8px;
  background: var(--accent); color: var(--accent-contrast); font-weight: 700; font: inherit; cursor: pointer;
}
.auth-submit:disabled { opacity: 0.6; cursor: wait; }
.auth-alt { margin-top: 16px; text-align: center; font-size: 0.85rem; color: var(--text-muted); }
.auth-alt a { color: var(--accent); }
```

Create `web/src/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Suspense } from 'react';
import '../auth-forms.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const res = await signIn('credentials', {
      identifier: String(form.get('identifier') ?? ''),
      password: String(form.get('password') ?? ''),
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError('Wrong username/email or password.');
    } else {
      router.push(params.get('callbackUrl') ?? '/dashboard');
      router.refresh();
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Welcome back</h1>
        <p className="sub">Sign in to Puzzle Geeks</p>
        <label htmlFor="identifier">Username or email</label>
        <input id="identifier" name="identifier" required autoComplete="username" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <p className="auth-error" role="alert">{error}</p>
        <button className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-alt">New here? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
```

Create `web/src/app/register/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import '../auth-forms.css';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const payload = {
      username: String(form.get('username') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const friendly: Record<string, string> = {
        USERNAME_TAKEN: 'That username is taken.',
        EMAIL_TAKEN: 'An account with that email already exists.',
      };
      setError(friendly[body.error] ?? body.error ?? 'Registration failed.');
      setBusy(false);
      return;
    }
    await signIn('credentials', { identifier: payload.username, password: payload.password, redirect: false });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Join Puzzle Geeks</h1>
        <p className="sub">Track solves. Beat your times.</p>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" required pattern="[a-zA-Z0-9_]{3,30}"
          title="3-30 letters, numbers, underscores" autoComplete="username" />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="password">Password (8+ characters)</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        <p className="auth-error" role="alert">{error}</p>
        <button className="auth-submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="auth-alt">Have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
```

Note: these pages reference CSS variables defined fully in Task 5; until then they render unstyled — that's fine.

- [ ] **Step 6: Verify suite + manual smoke**

Run: `npm test` → all pass.
Run: `npm run dev`, visit `http://localhost:3000/register`, create an account against your dev-branch DATABASE_URL, confirm redirect to `/dashboard` (404 for now — Task 6 adds it; the redirect itself proves auth works). Ctrl-C.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: Auth.js credentials + optional Google, register API, auth pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Theme system (midnight + cozy)

**Files:**
- Create: `web/src/components/ThemeProvider.tsx`, `web/src/components/ThemePicker.tsx`, `web/src/app/api/me/theme/route.ts`, `web/src/app/api/__tests__/theme.test.ts`
- Modify: `web/src/app/globals.css` (replace starter content), `web/src/app/layout.tsx` (replace starter)

**Interfaces:**
- Consumes: `auth()` (Task 4), `setTheme` (Task 3), `getDb` (Task 2).
- Produces: CSS custom properties (`--bg, --bg-raised, --border, --text, --text-muted, --accent, --accent-2, --accent-contrast, --danger, --font-body, --font-display, --font-mono, --radius, --shadow`) under `[data-theme='midnight']` and `[data-theme='cozy']`; `<ThemeProvider initialTheme>` context with `useTheme(): { theme, setTheme }`; `PUT /api/me/theme` `{theme: 'midnight'|'cozy'}` → 204.

- [ ] **Step 1: Replace `web/src/app/globals.css`**

```css
/* ---------- Theme tokens ---------- */
:root,
[data-theme='midnight'] {
  --bg: #0b0e14;
  --bg-raised: #11151d;
  --border: #1f2630;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #7ee787;
  --accent-2: #79c0ff;
  --accent-contrast: #0b0e14;
  --danger: #ff7b72;
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: var(--font-body);
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', monospace;
  --radius: 12px;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  color-scheme: dark;
}

[data-theme='cozy'] {
  --bg: #f6efe4;
  --bg-raised: #fffdf8;
  --border: #e8dcc8;
  --text: #4a3f33;
  --text-muted: #a08d75;
  --accent: #b5651d;
  --accent-2: #5c8a58;
  --accent-contrast: #fffdf8;
  --danger: #c0392b;
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: Georgia, 'Times New Roman', serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', monospace;
  --radius: 14px;
  --shadow: 0 2px 10px rgba(120, 90, 50, 0.15);
  color-scheme: light;
}

/* ---------- Base ---------- */
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  line-height: 1.5;
  transition: background 0.25s ease, color 0.25s ease;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3 { font-family: var(--font-display); line-height: 1.2; }
button { font: inherit; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Replace `web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puzzle Geeks',
  description: 'Track your speed puzzling. Beat your times.',
};

// Runs before paint: theme from localStorage (visitor) falls back to midnight.
const themeScript = `
try {
  var t = localStorage.getItem('pg-theme');
  if (t === 'midnight' || t === 'cozy') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const serverTheme = session?.user?.theme === 'cozy' ? 'cozy' : 'midnight';
  return (
    <html lang="en" data-theme={serverTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider initialTheme={serverTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: ThemeProvider + ThemePicker**

Create `web/src/components/ThemeProvider.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'midnight' | 'cozy';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'midnight',
  setTheme: () => {},
});

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const stored = localStorage.getItem('pg-theme');
    if (stored === 'midnight' || stored === 'cozy') setThemeState(stored);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('pg-theme', t);
    document.documentElement.dataset.theme = t;
    // Best-effort server persistence; 401 for logged-out visitors is fine.
    fetch('/api/me/theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
```

Create `web/src/components/ThemePicker.tsx`:

```tsx
'use client';

import { useTheme, type Theme } from './ThemeProvider';

const THEMES: { id: Theme; label: string; blurb: string }[] = [
  { id: 'midnight', label: 'Midnight Speedrun', blurb: 'Dark, sharp, built for racing the clock.' },
  { id: 'cozy', label: 'Cozy Table', blurb: 'Warm and calm, like a rainy-day puzzle.' },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => setTheme(t.id)}
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            border: theme === t.id ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: 'var(--bg-raised)',
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <strong style={{ display: 'block' }}>{t.label}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing theme-route test**

Create `web/src/app/api/__tests__/theme.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { PUT } from '@/app/api/me/theme/route';

const put = (body: unknown) =>
  PUT(new Request('http://test/api/me/theme', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

describe('PUT /api/me/theme', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    state.session = null;
  });

  it('401 when logged out', async () => {
    expect((await put({ theme: 'cozy' })).status).toBe(401);
  });

  it('persists a valid theme (204)', async () => {
    const u = await createUser(state.db!, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    expect((await put({ theme: 'cozy' })).status).toBe(204);
    const [row] = await state.db!.select().from(users).where(eq(users.id, u.id));
    expect(row.theme).toBe('cozy');
  });

  it('400 on unknown theme', async () => {
    const u = await createUser(state.db!, { username: 'sam', email: 's@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    expect((await put({ theme: 'neon' })).status).toBe(400);
  });
});
```

Run: `npm test -- theme` → FAIL (route doesn't exist).

- [ ] **Step 5: Implement the route**

Create `web/src/app/api/me/theme/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getDb } from '@/db';
import { setTheme } from '@/lib/users';

const schema = z.object({ theme: z.enum(['midnight', 'cozy']) });

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
  await setTheme(getDb(), Number(session.user.id), parsed.data.theme);
  return new NextResponse(null, { status: 204 });
}
```

Run: `npm test` → all pass.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: midnight/cozy theme system with no-flash boot and persistence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: App shell + placeholder pages

**Files:**
- Create: `web/src/app/(app)/layout.tsx`, `web/src/components/Sidebar.tsx`, `web/src/components/shell.css`, and eight pages: `web/src/app/(app)/{dashboard,timer,log,history,analytics,goals,awards,settings}/page.tsx`

**Interfaces:**
- Consumes: `auth()` (Task 4), `ThemePicker` (Task 5).
- Produces: the `(app)` route group — every later plan drops real content into these pages. Nav routes: `/dashboard /timer /log /history /analytics /goals /awards /settings`.

- [ ] **Step 1: Shell CSS**

Create `web/src/components/shell.css`:

```css
.shell { display: flex; min-height: 100vh; }
.shell-main { flex: 1; padding: 28px 32px 96px; max-width: 1200px; margin: 0 auto; width: 100%; }

.sidebar {
  width: 220px; flex-shrink: 0; position: sticky; top: 0; height: 100vh;
  background: var(--bg-raised); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 20px 12px;
}
.sidebar-logo {
  font-family: var(--font-display); font-weight: 800; font-size: 1.1rem;
  color: var(--accent); padding: 0 12px 20px;
}
.sidebar nav { display: flex; flex-direction: column; gap: 2px; }
.nav-link {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 8px; color: var(--text-muted); font-size: 0.925rem;
}
.nav-link:hover { color: var(--text); text-decoration: none; background: color-mix(in srgb, var(--border) 50%, transparent); }
.nav-link.active { color: var(--text); background: var(--bg); font-weight: 600; }
.nav-link .icon { width: 1.4em; text-align: center; }
.sidebar-foot { margin-top: auto; padding: 12px; color: var(--text-muted); font-size: 0.8rem; }

.page-head { margin-bottom: 24px; }
.page-head h1 { font-size: 1.6rem; }
.page-head .desc { color: var(--text-muted); font-size: 0.9rem; margin-top: 2px; }
.card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow);
}

@media (max-width: 767px) {
  .sidebar {
    position: fixed; top: auto; bottom: 0; left: 0; right: 0; z-index: 50;
    width: 100%; height: auto; flex-direction: row; padding: 6px 4px;
    border-right: none; border-top: 1px solid var(--border);
  }
  .sidebar-logo, .sidebar-foot, .nav-link span.label-text { display: none; }
  .sidebar nav { flex-direction: row; width: 100%; justify-content: space-around; }
  .nav-link { flex-direction: column; gap: 2px; padding: 6px 8px; font-size: 0.65rem; }
  .shell-main { padding: 20px 16px 96px; }
}
```

- [ ] **Step 2: Sidebar component**

Create `web/src/components/Sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './shell.css';

const LINKS = [
  { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { href: '/timer', icon: '⏱️', label: 'Timer' },
  { href: '/log', icon: '➕', label: 'Log' },
  { href: '/history', icon: '📜', label: 'History' },
  { href: '/analytics', icon: '📈', label: 'Analytics' },
  { href: '/goals', icon: '🎯', label: 'Goals' },
  { href: '/awards', icon: '🏆', label: 'Awards' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">◆ Puzzle Geeks</div>
      <nav aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link${pathname.startsWith(l.href) ? ' active' : ''}`}>
            <span className="icon" aria-hidden>{l.icon}</span>
            <span className="label-text">{l.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">@{username}</div>
    </aside>
  );
}
```

- [ ] **Step 3: Group layout + pages**

Create `web/src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login'); // belt-and-braces beside middleware
  return (
    <div className="shell">
      <Sidebar username={session.user.username} />
      <main className="shell-main">{children}</main>
    </div>
  );
}
```

Create the eight pages. Seven follow this exact pattern (swap title/desc per the table):

```tsx
export default function DashboardPage() {
  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="desc">Your speed puzzling overview</p>
      </div>
      <div className="card">Coming together in the next build phase.</div>
    </>
  );
}
```

| Route | Title | Desc |
|---|---|---|
| dashboard | Dashboard | Your speed puzzling overview |
| timer | Stopwatch | Time your session live |
| log | Log Puzzle | Record a completed session |
| history | History | All sessions |
| analytics | Analytics | Performance deep-dive |
| goals | Goals | Set targets, track progress |
| awards | Achievements | Your milestones |

`settings/page.tsx` is real already:

```tsx
import { SignOutButton } from './SignOutButton';
import { ThemePicker } from '@/components/ThemePicker';

export default function SettingsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="desc">Customize your experience</p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Theme</h3>
        <ThemePicker />
      </div>
      <div className="card">
        <SignOutButton />
      </div>
    </>
  );
}
```

Create `web/src/app/(app)/settings/SignOutButton.tsx`:

```tsx
'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      style={{
        padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600,
      }}
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 4: Manual smoke test**

`npm run dev` → log in → check: sidebar on desktop; resize below 768px → bottom tab bar; every nav link renders its page; theme picker in Settings flips the whole shell instantly and survives reload; sign out lands on `/`.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: app shell with sidebar/bottom-tab nav and placeholder pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Landing page

**Files:**
- Modify: `web/src/app/page.tsx` (replace starter), create `web/src/app/landing.css`

**Interfaces:**
- Consumes: `auth()` (Task 4).
- Produces: `/` — redirects authed users to `/dashboard`, sells the site to everyone else.

- [ ] **Step 1: Implement**

Create `web/src/app/landing.css`:

```css
.landing { min-height: 100vh; display: flex; flex-direction: column; }
.landing-nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 32px; }
.landing-nav .logo { font-family: var(--font-display); font-weight: 800; color: var(--accent); font-size: 1.15rem; }
.landing-nav .actions { display: flex; gap: 12px; align-items: center; }
.hero { flex: 1; display: grid; place-items: center; text-align: center; padding: 48px 24px; }
.hero h1 { font-size: clamp(2.2rem, 6vw, 3.6rem); max-width: 16ch; margin: 0 auto 16px; }
.hero .tagline { color: var(--text-muted); font-size: 1.1rem; max-width: 44ch; margin: 0 auto 32px; }
.hero .demo-timer {
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: clamp(2rem, 8vw, 4rem); font-weight: 800; color: var(--accent);
  letter-spacing: 0.06em; margin-bottom: 32px;
}
.btn-primary {
  display: inline-block; padding: 13px 28px; border-radius: 10px; border: none;
  background: var(--accent); color: var(--accent-contrast); font-weight: 700; font-size: 1rem; cursor: pointer;
}
.btn-primary:hover { text-decoration: none; filter: brightness(1.1); }
.btn-ghost { color: var(--text); padding: 10px 16px; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 0 32px 64px; max-width: 1000px; margin: 0 auto; width: 100%; }
.feature h3 { margin-bottom: 6px; font-size: 1.05rem; }
.feature p { color: var(--text-muted); font-size: 0.9rem; }
```

Replace `web/src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import './landing.css';

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="logo">◆ Puzzle Geeks</span>
        <div className="actions">
          <Link className="btn-ghost" href="/login">Sign in</Link>
          <Link className="btn-primary" href="/register">Join free</Link>
        </div>
      </nav>
      <main className="hero">
        <div>
          <div className="demo-timer" aria-hidden>1:42:07</div>
          <h1>Every puzzle is a race.</h1>
          <p className="tagline">
            Time your solves, watch your pace sharpen, and chase personal bests —
            the home for speed puzzlers.
          </p>
          <Link className="btn-primary" href="/register">Start tracking — it&apos;s free</Link>
        </div>
      </main>
      <section className="features" aria-label="Features">
        <div className="feature card"><h3>⏱️ Pro timer</h3><p>Live splits, pace, and projected finish while you solve.</p></div>
        <div className="feature card"><h3>📈 Real analytics</h3><p>Trends, pace curves, and PBs across every piece count.</p></div>
        <div className="feature card"><h3>🏆 Goals &amp; streaks</h3><p>Targets, achievements, and streaks that keep you coming back.</p></div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

`npm run dev` → logged out: `/` shows landing; logged in: `/` redirects to `/dashboard`.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: landing page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Playwright e2e + deploy readiness

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/auth.spec.ts`, `web/README.md`
- Modify: `web/package.json` (script), `web/.env.example` (E2E note)

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run e2e`; documented Vercel deploy procedure.

- [ ] **Step 1: Install Playwright**

```bash
cd web && npm i -D @playwright/test && npx playwright install chromium
```

- [ ] **Step 2: Config**

Create `web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

// E2E needs a real Postgres. Either:
//   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
//   E2E_DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks
// or point E2E_DATABASE_URL at a disposable Neon branch.
// Run migrations first: DATABASE_URL=$E2E_DATABASE_URL npx drizzle-kit migrate
const dbUrl = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:pg@localhost:5433/puzzlegeeks';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    env: { DATABASE_URL: dbUrl, AUTH_SECRET: 'e2e-secret-not-for-prod-0123456789' },
  },
});
```

Add script to `web/package.json`: `"e2e": "playwright test"`.

- [ ] **Step 3: Write the e2e spec**

Create `web/e2e/auth.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const uniq = `e2e_${Date.now()}`;

test('register → dashboard → theme switch → sign out → sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every puzzle is a race.' })).toBeVisible();

  await page.getByRole('link', { name: 'Join free' }).click();
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('radio', { name: /Cozy Table/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(uniq);
  await page.getByLabel('Password').fill('longenough123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('unauthenticated visitor is bounced from protected pages', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 4: Run e2e**

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks npx drizzle-kit migrate
npm run e2e
docker stop pg-e2e
```

Expected: 2 passed. (No docker? Set `E2E_DATABASE_URL` to a disposable Neon branch and skip the docker lines.)

- [ ] **Step 5: Write `web/README.md`**

```markdown
# Puzzle Geeks (web)

Next.js rewrite of Puzzle Geeks. The legacy Flask app lives at the repo root
and stays deployed until cutover (see Plan 3).

## Develop

    npm install
    cp .env.example .env.local   # fill in AUTH_SECRET + dev-branch DATABASE_URL
    npx drizzle-kit migrate      # apply migrations to your dev DB
    npm run dev

## Test

    npm test        # vitest (uses in-memory PGlite; no DB needed)
    npm run e2e     # Playwright; see playwright.config.ts header for DB setup

## Deploy (Vercel)

1. Push to GitHub. In Vercel: New Project → import this repo.
2. Set **Root Directory = `web`**. Framework auto-detects Next.js.
3. Environment variables: `DATABASE_URL` (Neon **pooled** connection string),
   `AUTH_SECRET` (openssl rand -base64 32), and optionally
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   (callback URL: `https://<domain>/api/auth/callback/google`).
4. Apply migrations to prod (from `web/`):
   `DATABASE_URL=<prod-url> npx drizzle-kit migrate`
   — do this BEFORE the first deploy that uses a new migration.
5. Deploys are automatic per push; each branch gets a preview URL.

## Structure

See `docs/superpowers/plans/2026-07-07-revamp-1-foundation.md` for the map.
```

- [ ] **Step 6: Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "test: e2e auth flow; docs: vercel deploy guide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

`npm run build` must succeed — it's what Vercel runs.

---

## Self-review notes

- **Spec coverage (this plan's slice):** stack/hosting ✅ (Tasks 1, 8), schema incl. Phase-2/3-ready tables ✅ (Task 2), bcrypt carryover ✅ (Task 3), auth + Google ✅ (Task 4), themes ✅ (Task 5), shell ✅ (Task 6), landing ✅ (Task 7), e2e + deploy ✅ (Task 8). Deliberately deferred to Plans 2–3: solve CRUD/import/analytics/goals/awards content, cockpit timer, PWA, migration script, cutover.
- **Type consistency:** `Db` from `@/db` used by all services; `PublicUser` shape consistent across users.ts/auth.ts; theme literal union `'midnight' | 'cozy'` everywhere.
- **No placeholders:** every code step has complete code; the only "coming soon" copy is intentional UI text on placeholder pages.
