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
