import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET } from '@/app/api/solves/pb/route';

const get = (qs: string) => GET(new Request(`http://t/api/solves/pb${qs}`));

describe('GET /api/solves/pb', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('400 without a valid pieces param', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?pieces=abc')).status).toBe(400);
  });

  it('pb: null when no solve at that size', async () => {
    expect(await (await get('?pieces=500')).json()).toEqual({ pb: null });
  });

  it('returns the PB solve with ordered splits, cumulative, total', async () => {
    const uid = Number(state.session!.user.id);
    await addSolve(state.db!, uid, { pieces: 500, time_seconds: 500 }, '2026-07-01');
    await addSolve(state.db!, uid, {
      pieces: 500, time_seconds: 400,
      splits: [
        { phase: 'edge', seconds: 60, position: 0 },
        { phase: 'sort', seconds: 90, position: 1 },
        { phase: 'assembly', seconds: 250, position: 2 },
      ],
    }, '2026-07-02');
    const body = await (await get('?pieces=500')).json();
    expect(body.pb.solve.timeSeconds).toBe(400);
    expect(body.pb.splits.map((s: { phase: string }) => s.phase)).toEqual(['edge', 'sort', 'assembly']);
    expect(body.pb.cumulative).toEqual([60, 150, 400]);
    expect(body.pb.totalSeconds).toBe(400);
  });
});
