import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { importSpeedpuzzling } from '@/lib/import-speedpuzzling';
import { listSolvesChrono } from '@/lib/solves';
import { listAchievements } from '@/lib/achievements-service';

const TODAY = '2026-07-07';
const REC = (over: Record<string, unknown> = {}) => ({
  result_id: 'r1', type: 'solo', pieces_count: 500, seconds_to_solve: 3000,
  finished_at: '2026-06-01T10:00:00Z', puzzle_name: 'Magic Garden', brand_name: 'Ravensburger',
  first_attempt: true, puzzle_average_time: 4000, puzzle_fastest_time: 2000,
  player_rank: 5, puzzle_total_solved: 120, ...over,
});

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('importSpeedpuzzling', () => {
  it('imports records with community fields and unlocks achievements', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, [REC()], TODAY);
    expect(res).toEqual({ imported: 1, duplicates: 0, skipped_type: 0, invalid: 0, total: 1 });
    const [s] = await listSolvesChrono(db, uid);
    expect(s).toMatchObject({
      date: '2026-06-01', pieces: 500, timeSeconds: 3000, source: 'speedpuzzling', sourceId: 'r1',
      communityAvgTime: 4000, communityBestTime: 2000, playerRank: 5, communitySolvers: 120,
      firstAttempt: true, isPersonalBest: true,
    });
    const ach = await listAchievements(db, uid);
    expect(ach.find((a) => a.code === 'first_puzzle')!.unlocked).toBe(true);
  });

  it('is idempotent by result_id and by (date,pieces,seconds) fallback', async () => {
    const { db, uid } = await seed();
    await importSpeedpuzzling(db, uid, [REC()], TODAY);
    const again = await importSpeedpuzzling(db, uid, [REC()], TODAY);
    expect(again.duplicates).toBe(1);
    const noId = await importSpeedpuzzling(db, uid, [REC({ result_id: null })], TODAY);
    expect(noId.duplicates).toBe(1); // same (date,pieces,seconds)
  });

  it('filters types and counts invalid records', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, {
      records: [
        REC({ result_id: 'a' }),
        REC({ result_id: 'b', type: 'duo' }),
        REC({ result_id: 'c', pieces_count: 'nope' }),
      ],
      include_types: ['solo'],
    }, TODAY);
    expect(res).toMatchObject({ imported: 1, skipped_type: 1, invalid: 1, total: 3 });
  });

  it('include_types can admit duo, and in-batch repeats count as duplicates', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, {
      records: [REC({ result_id: 'x', type: 'duo' }), REC({ result_id: 'x', type: 'duo' })],
      include_types: ['solo', 'duo'],
    }, TODAY);
    expect(res).toMatchObject({ imported: 1, duplicates: 1 });
  });

  it('falls back to today when no dates present', async () => {
    const { db, uid } = await seed();
    await importSpeedpuzzling(db, uid, [REC({ finished_at: null, tracked_at: null, result_id: 'z' })], TODAY);
    const [s] = await listSolvesChrono(db, uid);
    expect(s.date).toBe(TODAY);
  });

  it('treats a non-array records field as empty instead of throwing', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, { records: { nope: true } }, TODAY);
    expect(res).toEqual({ imported: 0, duplicates: 0, skipped_type: 0, invalid: 0, total: 0 });
  });
});
