import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';
import { ACHIEVEMENT_DEFS, listAchievements, checkAchievements } from '@/lib/achievements-service';

const TODAY = '2026-07-07';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('achievements', () => {
  it('has the 19 legacy definitions', () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(19);
    expect(ACHIEVEMENT_DEFS[0]).toEqual({ code: 'first_puzzle', name: 'First Piece', description: 'Complete your first puzzle', icon: 'puzzle-piece' });
  });

  it('listAchievements seeds idempotently', async () => {
    const { db, uid } = await seed();
    expect(await listAchievements(db, uid)).toHaveLength(19);
    expect(await listAchievements(db, uid)).toHaveLength(19);
  });

  it('first solve unlocks first_puzzle only once', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('first_puzzle');
    expect(await checkAchievements(db, uid, TODAY)).toEqual([]); // second call: nothing new
    const rows = await listAchievements(db, uid);
    expect(rows.find((a) => a.code === 'first_puzzle')!.unlockedDate).toBe(TODAY);
  });

  it('speed_demon requires 500pc under 30min', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 1799 }, TODAY);
    expect(await checkAchievements(db, uid, TODAY)).toContain('speed_demon');
  });

  it('streak_3 uses longest streak', async () => {
    const { db, uid } = await seed();
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: d }, TODAY);
    }
    expect(await checkAchievements(db, uid, TODAY)).toContain('streak_3');
  });

  it('improver unlocks at >=10% scaled-time improvement (total >= 3)', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 4000, date: '2026-06-01' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 3500, date: '2026-06-02' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: '2026-06-03' }, TODAY);
    // cc = 1: first 4000 → last 3000 = 25% improvement → improver AND big_improver
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('improver');
    expect(newly).toContain('big_improver');
  });

  it('hour_club at 10+ hours total', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 2000, time_seconds: 36_000 }, TODAY);
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('hour_club');
    expect(newly).toContain('marathon');
  });
});
