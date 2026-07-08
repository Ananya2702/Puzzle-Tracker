import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
  userId: number | null;
} = { db: null, session: null, userId: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET as getChart } from '@/app/api/charts/[kind]/route';
import { GET as getGoals, POST as postGoal } from '@/app/api/goals/route';
import { DELETE as deleteGoal } from '@/app/api/goals/[id]/route';
import { GET as getAchievements } from '@/app/api/achievements/route';
import { GET as getCsv } from '@/app/api/export/csv/route';
import { POST as postImport } from '@/app/api/import/speedpuzzling/route';

const chart = (kind: string) =>
  getChart(new Request(`http://t/api/charts/${kind}`), { params: Promise.resolve({ kind }) });

describe('charts/goals/achievements/export/import routes', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    state.userId = u.id;
    await addSolve(state.db, u.id, { pieces: 500, time_seconds: 3000, date: '2026-07-01', puzzle_name: 'A, "quoted"' }, '2026-07-07');
    await addSolve(state.db, u.id, { pieces: 500, time_seconds: 2500, date: '2026-07-02' }, '2026-07-07');
  });

  it('trend chart returns solves + moving averages', async () => {
    const body = await (await chart('trend')).json();
    expect(body.solves).toHaveLength(2);
    expect(body.moving_avg_5).toHaveLength(2);
  });

  it('piece-breakdown, pace, weekly work; unknown kind 404', async () => {
    expect((await (await chart('piece-breakdown')).json())['500'].count).toBe(2);
    expect(await (await chart('pace')).json()).toHaveLength(2);
    expect((await (await chart('weekly')).json())[0].count).toBe(2);
    expect((await chart('nope')).status).toBe(404);
  });

  it('goals CRUD over HTTP', async () => {
    const created = await postGoal(new Request('http://t/api/goals', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: 500, target_time_seconds: 2000 }),
    }));
    expect(created.status).toBe(201);
    const goals = await (await getGoals(new Request('http://t/api/goals'))).json();
    expect(goals).toHaveLength(1);
    const delRes = await deleteGoal(new Request(`http://t/api/goals/${goals[0].id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(goals[0].id) }) });
    expect(delRes.status).toBe(200);
  });

  it('achievements listing is seeded and ordered', async () => {
    const list = await (await getAchievements(new Request('http://t/api/achievements'))).json();
    expect(list).toHaveLength(19);
  });

  it('CSV export quotes embedded commas/quotes and sets attachment headers', async () => {
    const res = await getCsv(new Request('http://t/api/export/csv'));
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('puzzle_times.csv');
    const text = await res.text();
    expect(text.split('\n')[0]).toContain('Scaled Time (500pc)');
    expect(text).toContain('"A, ""quoted"""');
  });

  it('CSV export neutralizes formula-injection prefixes', async () => {
    await addSolve(state.db!, state.userId!, {
      pieces: 500, time_seconds: 2600, date: '2026-07-03', puzzle_name: '=SUM(A1)',
    }, '2026-07-07');
    const res = await getCsv(new Request('http://t/api/export/csv'));
    const text = await res.text();
    expect(text).toContain("'=SUM(A1)");
  });

  it('import route delegates and reports counts', async () => {
    const res = await postImport(new Request('http://t/api/import/speedpuzzling', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ result_id: 'r9', pieces_count: 500, seconds_to_solve: 1400, finished_at: '2026-06-30T00:00:00Z' }]),
    }));
    expect(await res.json()).toMatchObject({ imported: 1, total: 1 });
  });
});
