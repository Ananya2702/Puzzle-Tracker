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

import { GET as getStats } from '@/app/api/statistics/route';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as getScalingInfo } from '@/app/api/scaling-info/route';

describe('/api/statistics, /api/settings, /api/scaling-info', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('statistics reflects solves', async () => {
    await addSolve(state.db!, Number(state.session!.user.id), { pieces: 500, time_seconds: 3000 }, '2026-07-07');
    const body = await (await getStats(new Request('http://t/api/statistics'))).json();
    expect(body.total_puzzles).toBe(1);
    expect(body.personal_bests['500']).toBe(3000);
  });

  it('settings round-trip; scaling_exponent PUT rescales and scaling-info reflects it', async () => {
    await addSolve(state.db!, Number(state.session!.user.id), { pieces: 1000, time_seconds: 3600 }, '2026-07-07');
    const putRes = await putSettings(new Request('http://t/api/settings', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scaling_exponent: 0 }),
    }));
    expect(putRes.status).toBe(200);
    expect(await (await getSettings(new Request('http://t/api/settings'))).json()).toEqual({ scaling_exponent: '0' });
    const info = await (await getScalingInfo(new Request('http://t/api/scaling-info'))).json();
    expect(info.exponent).toBe(0);
    expect(info.baseline_pieces).toBe(500);
    expect(info.scaling_table['1000'].scaling_factor).toBe(1);
  });
});
