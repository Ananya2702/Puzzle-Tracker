import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';

const state: { db: Awaited<ReturnType<typeof makeTestDb>> | null } = { db: null };
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));

import { POST } from '@/app/api/register/route';

const post = (body: unknown) =>
  POST(new Request('http://test/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

describe('POST /api/register', () => {
  beforeEach(async () => { state.db = await makeTestDb(); });

  it('creates a user (201)', async () => {
    const res = await post({ username: 'maya', email: 'm@x.com', password: 'longenough' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ username: 'maya' });
  });

  it('rejects invalid payloads (400)', async () => {
    expect((await post({ username: 'ab', email: 'm@x.com', password: 'longenough' })).status).toBe(400);
    expect((await post('not json shape')).status).toBe(400);
  });

  it('rejects duplicates (409)', async () => {
    await post({ username: 'maya', email: 'm@x.com', password: 'longenough' });
    const res = await post({ username: 'maya', email: 'other@x.com', password: 'longenough' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('USERNAME_TAKEN');
  });
});
