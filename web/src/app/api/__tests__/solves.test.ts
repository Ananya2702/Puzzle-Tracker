import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET, POST } from '@/app/api/solves/route';
import { PUT, DELETE } from '@/app/api/solves/[id]/route';

const post = (body: unknown) =>
  POST(new Request('http://t/api/solves', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
const get = (qs = '') => GET(new Request(`http://t/api/solves${qs}`));
const put = (id: string, body: unknown) =>
  PUT(new Request(`http://t/api/solves/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
const del = (id: string) =>
  DELETE(new Request(`http://t/api/solves/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

describe('/api/solves', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('401 when logged out', async () => {
    state.session = null;
    expect((await get()).status).toBe(401);
    expect((await post({ pieces: 500, time_seconds: 100 })).status).toBe(401);
  });

  it('POST creates a solve and reports achievements + PB', async () => {
    const res = await post({ pieces: 500, time_seconds: 1700 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.solve.pieces).toBe(500);
    expect(body.isPersonalBest).toBe(true);
    expect(body.newAchievements).toContain('first_puzzle');
    expect(body.newAchievements).toContain('speed_demon');
  });

  it('POST validates (400 with message)', async () => {
    expect((await post({ pieces: -1, time_seconds: 100 })).status).toBe(400);
  });

  it('GET lists with filter and sort', async () => {
    await post({ pieces: 500, time_seconds: 3000, date: '2026-07-01' });
    await post({ pieces: 1000, time_seconds: 7000, date: '2026-07-02' });
    const filtered = await (await get('?pieces=500')).json();
    expect(filtered).toHaveLength(1);
    const sorted = await (await get('?sort=time&order=asc')).json();
    expect(sorted[0].timeSeconds).toBe(3000);
  });

  it('GET ignores a malformed pieces filter instead of erroring', async () => {
    await post({ pieces: 500, time_seconds: 3000, date: '2026-07-01' });
    await post({ pieces: 1000, time_seconds: 7000, date: '2026-07-02' });
    const res = await get('?pieces=abc');
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
  });

  it('PUT updates own solve; 404 on foreign/missing', async () => {
    const created = (await (await post({ pieces: 500, time_seconds: 3000 })).json()).solve;
    const ok = await put(String(created.id), { time_seconds: 2500 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).timeSeconds).toBe(2500);
    expect((await put('999999', { time_seconds: 1 })).status).toBe(404);
    expect((await put('abc', { time_seconds: 1 })).status).toBe(404);
  });

  it('DELETE removes; 404 on missing', async () => {
    const created = (await (await post({ pieces: 500, time_seconds: 3000 })).json()).solve;
    expect((await del(String(created.id))).status).toBe(200);
    expect((await del(String(created.id))).status).toBe(404);
  });
});
