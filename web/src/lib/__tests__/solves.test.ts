import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { putSettings } from '@/lib/settings-service';
import { addSolve, listSolves, listSolvesChrono, updateSolve, deleteSolve, csvRows, solveInputSchema } from '@/lib/solves';
import { goals } from '@/db/schema';
import { eq } from 'drizzle-orm';

const TODAY = '2026-07-07';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('solveInputSchema', () => {
  it('applies defaults and validates', () => {
    const p = solveInputSchema.parse({ pieces: 500, time_seconds: 1800 });
    expect(p).toMatchObject({ difficulty_rating: 3, puzzle_type: 'solo', first_attempt: false });
    expect(solveInputSchema.safeParse({ pieces: 0, time_seconds: 10 }).success).toBe(false);
    expect(solveInputSchema.safeParse({ pieces: 500, time_seconds: 10, date: '07/01/2026' }).success).toBe(false);
    expect(solveInputSchema.safeParse({ pieces: 500, time_seconds: 10, puzzle_type: 'squad' }).success).toBe(false);
  });
});

describe('addSolve', () => {
  it('computes scaled time with the user exponent and defaults date to today', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, { pieces: 1000, time_seconds: 3600 }, TODAY);
    expect(solve.date).toBe(TODAY);
    expect(solve.scaledTimeSeconds).toBeCloseTo(2728.29, 1);
    expect(solve.isPersonalBest).toBe(true); // only solve at 1000pc
  });

  it('respects a changed exponent', async () => {
    const { db, uid } = await seed();
    await putSettings(db, uid, { scaling_exponent: '0' });
    const { solve } = await addSolve(db, uid, { pieces: 2000, time_seconds: 5000 }, TODAY);
    expect(solve.scaledTimeSeconds).toBe(5000);
  });

  it('PB flags: solo-only, per piece count, min time', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    const { solve: faster } = await addSolve(db, uid, { pieces: 500, time_seconds: 2500 }, TODAY);
    const { solve: duo } = await addSolve(db, uid, { pieces: 500, time_seconds: 100, puzzle_type: 'duo' }, TODAY);
    expect(faster.isPersonalBest).toBe(true);
    expect(duo.isPersonalBest).toBe(false);
    const all = await listSolvesChrono(db, uid);
    expect(all.filter((s) => s.isPersonalBest)).toHaveLength(1);
  });

  it('marks matching goals achieved', async () => {
    const { db, uid } = await seed();
    await db.insert(goals).values({ userId: uid, pieces: 500, targetTimeSeconds: 3000 });
    await db.insert(goals).values({ userId: uid, pieces: 1000, targetTimeSeconds: 3000 });
    const { achievedGoalIds } = await addSolve(db, uid, { pieces: 500, time_seconds: 2900 }, TODAY);
    expect(achievedGoalIds).toHaveLength(1);
    const rows = await db.select().from(goals).where(eq(goals.userId, uid));
    const achieved = rows.find((g) => g.pieces === 500)!;
    expect(achieved.achieved).toBe(true);
    expect(achieved.achievedDate).toBe(TODAY);
    expect(rows.find((g) => g.pieces === 1000)!.achieved).toBe(false);
  });
});

describe('listSolves', () => {
  it('filters by pieces and sorts by requested column', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: '2026-07-01' }, TODAY);
    await addSolve(db, uid, { pieces: 1000, time_seconds: 7000, date: '2026-07-02' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 2500, date: '2026-07-03' }, TODAY);
    expect((await listSolves(db, uid, { pieces: 500 }))).toHaveLength(2);
    const byTimeAsc = await listSolves(db, uid, { sort: 'time', order: 'asc' });
    expect(byTimeAsc.map((s) => s.timeSeconds)).toEqual([2500, 3000, 7000]);
    const defaultOrder = await listSolves(db, uid);
    expect(defaultOrder[0].date).toBe('2026-07-03'); // date desc default
  });
});

describe('update/delete', () => {
  it('updates recompute scaled time and PBs; ownership enforced', async () => {
    const { db, uid } = await seed();
    const other = await createUser(db, { username: 'sam', email: 's@x.com', password: 'longenough' });
    const { solve } = await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    expect(await updateSolve(db, other.id, solve.id, { time_seconds: 1 })).toBeNull();
    const updated = await updateSolve(db, uid, solve.id, { pieces: 1000 });
    expect(updated!.scaledTimeSeconds).toBeCloseTo(calc(3000), 1);
    function calc(t: number) { return t * (500 / 1000) ** 0.4; }
  });

  it('preserves unspecified fields instead of resetting them to schema defaults', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, {
      pieces: 500, time_seconds: 3000, puzzle_name: 'Magic Garden', brand: 'Ravensburger',
      difficulty_rating: 4, notes: 'fun', tags: 'floral',
    }, TODAY);
    const updated = await updateSolve(db, uid, solve.id, { time_seconds: 2900 });
    expect(updated).toMatchObject({
      timeSeconds: 2900, puzzleName: 'Magic Garden', brand: 'Ravensburger',
      difficultyRating: 4, notes: 'fun', tags: 'floral',
    });
  });

  it('delete removes and returns false for foreign rows', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    expect(await deleteSolve(db, uid + 999, solve.id)).toBe(false);
    expect(await deleteSolve(db, uid, solve.id)).toBe(true);
    expect(await listSolvesChrono(db, uid)).toHaveLength(0);
  });
});

describe('csvRows', () => {
  it('produces the legacy export shape', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, {
      pieces: 500, time_seconds: 3000, date: '2026-07-01', puzzle_name: 'Magic Garden',
      brand: 'Ravensburger', difficulty_rating: 4, notes: 'fun', tags: 'floral',
    }, TODAY);
    const rows = csvRows([solve]);
    expect(rows[0]).toEqual(['Date', 'Puzzle Name', 'Brand', 'Pieces', 'Time (seconds)', 'Time (formatted)', 'Scaled Time (500pc)', 'Difficulty', 'Notes', 'Tags']);
    expect(rows[1]).toEqual(['2026-07-01', 'Magic Garden', 'Ravensburger', '500', '3000', '0:50:00', '3000', '4', 'fun', 'floral']);
  });
});
