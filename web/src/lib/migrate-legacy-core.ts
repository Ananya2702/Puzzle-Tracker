export interface MinimalClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface MigrationReport {
  users: number; solves: number; settings: number; goals: number; achievements: number;
  skippedThemeSettings: number; warnings: string[];
}

const s = (v: unknown): string => (v == null ? '' : String(v));
const b = (v: unknown): boolean => v === true || v === 1 || v === '1';

/** Copy the legacy Flask database into the (empty) new-schema database. One transaction; dryRun rolls back. */
export async function migrateLegacy(
  legacy: MinimalClient,
  target: MinimalClient,
  opts: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const existing = await target.query('SELECT count(*)::int AS n FROM users');
  if ((existing.rows[0].n as number) > 0) {
    throw new Error('Target database is not empty — refusing to migrate. Point DATABASE_URL at a fresh database.');
  }

  const users = (await legacy.query('SELECT * FROM users ORDER BY id')).rows;
  const seenEmail = new Map<string, unknown>();
  const seenName = new Map<string, unknown>();
  const collisions: string[] = [];
  for (const u of users) {
    const email = s(u.email).toLowerCase();
    const name = s(u.username);
    if (seenEmail.has(email)) collisions.push(`email '${email}': users ${seenEmail.get(email)} and ${u.id}`);
    if (seenName.has(name)) collisions.push(`username '${name}': users ${seenName.get(name)} and ${u.id}`);
    seenEmail.set(email, u.id);
    seenName.set(name, u.id);
  }
  if (collisions.length) {
    throw new Error(`Lowercased-email/username collision(s), resolve in the legacy DB first: ${collisions.join('; ')}`);
  }

  const themes = new Map<number, string>();
  const legacySettings = (await legacy.query('SELECT * FROM settings')).rows;
  let skippedThemeSettings = 0;
  for (const row of legacySettings) {
    if (s(row.key) === 'theme') {
      themes.set(Number(row.user_id), s(row.value) === 'light' ? 'cozy' : 'midnight');
      skippedThemeSettings++;
    }
  }

  const warnings: string[] = [];
  const report: MigrationReport = { users: 0, solves: 0, settings: 0, goals: 0, achievements: 0, skippedThemeSettings, warnings };

  await target.query('BEGIN');
  try {
    for (const u of users) {
      await target.query(
        `INSERT INTO users (id, username, email, password_hash, theme, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.id, s(u.username), s(u.email).toLowerCase(), s(u.password_hash), themes.get(Number(u.id)) ?? 'midnight', u.created_at ?? new Date()],
      );
      report.users++;
    }

    const puzzles = (await legacy.query('SELECT * FROM puzzles ORDER BY id')).rows;
    for (const p of puzzles) {
      if (Number(p.pieces) <= 0 || Number(p.time_seconds) <= 0) {
        warnings.push(`legacy puzzles row id=${p.id} has non-positive pieces/time — copied as-is`);
      }
      await target.query(
        `INSERT INTO solves (user_id, date, pieces, time_seconds, scaled_time_seconds, puzzle_name, brand,
           difficulty_rating, notes, tags, is_personal_best, puzzle_type, first_attempt, source, source_id,
           community_avg_time, community_best_time, player_rank, community_solvers, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [p.user_id, s(p.date), p.pieces, p.time_seconds, p.scaled_time_seconds, s(p.puzzle_name), s(p.brand),
          p.difficulty_rating ?? 3, s(p.notes), s(p.tags), b(p.is_personal_best), s(p.puzzle_type) || 'solo',
          b(p.first_attempt), s(p.source), p.source_id === '' ? null : (p.source_id ?? null),
          p.community_avg_time ?? null, p.community_best_time ?? null, p.player_rank ?? null, p.community_solvers ?? null,
          p.created_at ?? new Date(), p.updated_at ?? new Date()],
      );
      report.solves++;
    }

    for (const row of legacySettings) {
      if (s(row.key) === 'theme') continue;
      await target.query(`INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3)`, [row.user_id, s(row.key), s(row.value)]);
      report.settings++;
    }

    for (const g of (await legacy.query('SELECT * FROM goals ORDER BY id')).rows) {
      await target.query(
        `INSERT INTO goals (user_id, pieces, target_time_seconds, description, achieved, achieved_date, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [g.user_id, g.pieces, g.target_time_seconds, s(g.description), b(g.achieved), g.achieved_date ?? null, g.created_at ?? new Date()],
      );
      report.goals++;
    }

    for (const a of (await legacy.query('SELECT * FROM achievements ORDER BY id')).rows) {
      await target.query(
        `INSERT INTO achievements (user_id, code, name, description, icon, unlocked, unlocked_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [a.user_id, s(a.code), s(a.name), s(a.description), s(a.icon), b(a.unlocked), a.unlocked_date ?? null],
      );
      report.achievements++;
    }

    await target.query(`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT COALESCE(MAX(id), 1) FROM users))`);

    // Verification before commit.
    const counts = async (table: string) => (await target.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
    const checks: Array<[string, number, number]> = [
      ['users', users.length, await counts('users')],
      ['solves', report.solves, await counts('solves')],
      ['settings', report.settings, await counts('settings')],
      ['goals', report.goals, await counts('goals')],
      ['achievements', report.achievements, await counts('achievements')],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== actual) throw new Error(`Verification failed for ${name}: expected ${expected}, found ${actual}`);
    }

    await target.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
    return report;
  } catch (e) {
    await target.query('ROLLBACK').catch(() => {});
    throw e;
  }
}
