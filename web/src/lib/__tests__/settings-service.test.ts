import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { getSettings, getScalingExponent, putSettings } from '@/lib/settings-service';
import { solves } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('settings service', () => {
  it('defaults scaling exponent to 0.4 when unset', async () => {
    const { db, uid } = await seed();
    expect(await getScalingExponent(db, uid)).toBe(0.4);
    expect(await getSettings(db, uid)).toEqual({});
  });

  it('upserts settings (insert then overwrite)', async () => {
    const { db, uid } = await seed();
    await putSettings(db, uid, { scaling_exponent: '0.5', quick_add: '1' });
    expect(await getSettings(db, uid)).toEqual({ scaling_exponent: '0.5', quick_add: '1' });
    await putSettings(db, uid, { quick_add: '0' });
    expect((await getSettings(db, uid)).quick_add).toBe('0');
    expect(await getScalingExponent(db, uid)).toBe(0.5);
  });

  it('changing scaling_exponent rescales every existing solve', async () => {
    const { db, uid } = await seed();
    await db.insert(solves).values({
      userId: uid, date: '2026-07-01', pieces: 1000, timeSeconds: 3600, scaledTimeSeconds: 2728.29,
    });
    await putSettings(db, uid, { scaling_exponent: '0' });
    const [row] = await db.select().from(solves).where(eq(solves.userId, uid));
    expect(row.scaledTimeSeconds).toBe(3600); // exponent 0 → identity
  });

  it('rejects an out-of-range scaling_exponent without partial writes', async () => {
    const { db, uid } = await seed();
    await db.insert(solves).values({
      userId: uid, date: '2026-07-01', pieces: 1000, timeSeconds: 3600, scaledTimeSeconds: 2728.29,
    });
    await expect(putSettings(db, uid, { scaling_exponent: '1e21', quick_add: '1' })).rejects.toThrow();
    expect(await getSettings(db, uid)).toEqual({});
    const [row] = await db.select().from(solves).where(eq(solves.userId, uid));
    expect(row.scaledTimeSeconds).toBe(2728.29);
  });

  it('rejects an empty scaling_exponent without partial writes', async () => {
    const { db, uid } = await seed();
    await db.insert(solves).values({
      userId: uid, date: '2026-07-01', pieces: 1000, timeSeconds: 3600, scaledTimeSeconds: 2728.29,
    });
    await expect(putSettings(db, uid, { scaling_exponent: '', quick_add: '1' })).rejects.toThrow();
    expect(await getSettings(db, uid)).toEqual({});
    const [row] = await db.select().from(solves).where(eq(solves.userId, uid));
    expect(row.scaledTimeSeconds).toBe(2728.29);
  });
});
