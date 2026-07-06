import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { PUT } from '@/app/api/me/theme/route';

const put = (body: unknown) =>
  PUT(new Request('http://test/api/me/theme', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

describe('PUT /api/me/theme', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    state.session = null;
  });

  it('401 when logged out', async () => {
    expect((await put({ theme: 'cozy' })).status).toBe(401);
  });

  it('persists a valid theme (204)', async () => {
    const u = await createUser(state.db!, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    expect((await put({ theme: 'cozy' })).status).toBe(204);
    const [row] = await state.db!.select().from(users).where(eq(users.id, u.id));
    expect(row.theme).toBe('cozy');
  });

  it('400 on unknown theme', async () => {
    const u = await createUser(state.db!, { username: 'sam', email: 's@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    expect((await put({ theme: 'neon' })).status).toBe(400);
  });
});
