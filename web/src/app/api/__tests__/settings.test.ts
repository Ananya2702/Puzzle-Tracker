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

import { GET, PUT } from '@/app/api/settings/route';

const put = (body: unknown) =>
  PUT(new Request('http://t/api/settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
const get = () => GET(new Request('http://t/api/settings'));

describe('/api/settings', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('PUT upserts settings', async () => {
    const res = await put({ scaling_exponent: '0.5' });
    expect(res.status).toBe(200);
    expect(await (await get()).json()).toEqual({ scaling_exponent: '0.5' });
  });

  it('PUT rejects an out-of-range scaling_exponent with 400', async () => {
    const res = await put({ scaling_exponent: '1e21' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/scaling_exponent must be a number between 0 and 2/);
  });

  it('PUT rejects an empty scaling_exponent with 400', async () => {
    const res = await put({ scaling_exponent: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/scaling_exponent must be a number between 0 and 2/);
  });
});
