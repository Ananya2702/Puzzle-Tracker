import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { migrateLegacy } from '@/lib/migrate-legacy-core';

const LEGACY_DDL = `
CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE puzzles (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, date TEXT NOT NULL, pieces INTEGER NOT NULL,
  time_seconds INTEGER NOT NULL, scaled_time_seconds REAL NOT NULL, puzzle_name TEXT DEFAULT '', brand TEXT DEFAULT '',
  difficulty_rating INTEGER DEFAULT 3, notes TEXT DEFAULT '', tags TEXT DEFAULT '', is_personal_best INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  source_id TEXT, source TEXT DEFAULT '', puzzle_type TEXT DEFAULT 'solo', community_avg_time INTEGER,
  community_best_time INTEGER, player_rank INTEGER, community_solvers INTEGER, first_attempt INTEGER DEFAULT 0);
CREATE TABLE settings (user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE goals (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, pieces INTEGER NOT NULL,
  target_time_seconds INTEGER NOT NULL, description TEXT DEFAULT '', achieved INTEGER DEFAULT 0, achieved_date TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE achievements (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL, icon TEXT NOT NULL, unlocked INTEGER DEFAULT 0, unlocked_date TEXT, UNIQUE(user_id, code));
`;

async function makeLegacy(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(LEGACY_DDL);
  return db;
}

async function makeTarget(): Promise<PGlite> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../../drizzle') });
  return client;
}

describe('migrateLegacy', () => {
  let legacy: PGlite;
  let target: PGlite;

  beforeEach(async () => {
    legacy = await makeLegacy();
    target = await makeTarget();
  });

  it('migrates users (lowercased emails, theme mapping), solves, settings, goals, achievements', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES
      (1, 'maya', 'Maya@X.com', '$2b$12$legacyhash'), (7, 'sam', 'sam@x.com', '$2b$12$other')`);
    await legacy.query(`INSERT INTO settings VALUES (1, 'theme', 'light'), (1, 'scaling_exponent', '0.5'), (7, 'theme', 'dark')`);
    await legacy.query(`INSERT INTO puzzles (user_id, date, pieces, time_seconds, scaled_time_seconds, puzzle_name, is_personal_best, first_attempt, source_id, source, community_avg_time)
      VALUES (1, '2026-06-01', 500, 3000, 3000, 'Magic Garden', 1, 1, 'msp-1', 'speedpuzzling', 4000)`);
    await legacy.query(`INSERT INTO goals (user_id, pieces, target_time_seconds, achieved, achieved_date) VALUES (1, 500, 2500, 1, '2026-06-02')`);
    await legacy.query(`INSERT INTO achievements (user_id, code, name, description, icon, unlocked, unlocked_date)
      VALUES (1, 'first_puzzle', 'First Piece', 'Complete your first puzzle', 'puzzle-piece', 1, '2026-06-01')`);

    const report = await migrateLegacy(legacy, target);
    expect(report).toMatchObject({ users: 2, solves: 1, settings: 1, goals: 1, achievements: 1, skippedThemeSettings: 2 });

    const users = (await target.query(`SELECT * FROM users ORDER BY id`)).rows as Record<string, unknown>[];
    expect(users[0]).toMatchObject({ id: 1, email: 'maya@x.com', theme: 'cozy', password_hash: '$2b$12$legacyhash' });
    expect(users[1]).toMatchObject({ id: 7, theme: 'midnight' });

    const solves = (await target.query(`SELECT * FROM solves`)).rows as Record<string, unknown>[];
    expect(solves[0]).toMatchObject({
      user_id: 1, pieces: 500, time_seconds: 3000, puzzle_name: 'Magic Garden',
      is_personal_best: true, first_attempt: true, source_id: 'msp-1', community_avg_time: 4000, puzzle_type: 'solo',
    });

    // sequence fixed: next user insert gets id > 7
    const next = (await target.query(`INSERT INTO users (username, email, password_hash) VALUES ('new', 'n@x.com', 'h') RETURNING id`)).rows[0] as { id: number };
    expect(next.id).toBeGreaterThan(7);
  });

  it('normalizes an empty-string source_id to null (avoids uq_solves_user_source collisions on \'\')', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES (1, 'maya', 'm@x.com', 'h')`);
    await legacy.query(`INSERT INTO puzzles (user_id, date, pieces, time_seconds, scaled_time_seconds, source_id) VALUES
      (1, '2026-06-01', 500, 3000, 3000, ''), (1, '2026-06-02', 500, 3000, 3000, '')`);
    const report = await migrateLegacy(legacy, target);
    expect(report.solves).toBe(2);
    const solves = (await target.query(`SELECT source_id FROM solves ORDER BY date`)).rows as Record<string, unknown>[];
    expect(solves.map((s) => s.source_id)).toEqual([null, null]);
  });

  it('aborts on lowercased-email collision with no writes', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES
      (1, 'a', 'Foo@X.com', 'h'), (2, 'b', 'foo@x.com', 'h')`);
    await expect(migrateLegacy(legacy, target)).rejects.toThrow(/collision/i);
    expect((await target.query(`SELECT count(*)::int AS n FROM users`)).rows[0]).toMatchObject({ n: 0 });
  });

  it('refuses a non-empty target', async () => {
    await target.query(`INSERT INTO users (username, email, password_hash) VALUES ('x', 'x@x.com', 'h')`);
    await expect(migrateLegacy(legacy, target)).rejects.toThrow(/not empty/i);
  });

  it('dry run rolls back everything but reports counts', async () => {
    await legacy.query(`INSERT INTO users (id, username, email, password_hash) VALUES (1, 'maya', 'm@x.com', 'h')`);
    const report = await migrateLegacy(legacy, target, { dryRun: true });
    expect(report.users).toBe(1);
    expect((await target.query(`SELECT count(*)::int AS n FROM users`)).rows[0]).toMatchObject({ n: 0 });
  });
});
