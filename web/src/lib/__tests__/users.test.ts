import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import {
  createUser, verifyCredentials, findOrCreateGoogleUser, setTheme, registerSchema, uniqueViolation,
} from '@/lib/users';

describe('registerSchema', () => {
  it('accepts valid input', () => {
    expect(
      registerSchema.safeParse({ username: 'maya_1', email: 'm@x.com', password: 'longenough' }).success,
    ).toBe(true);
  });
  it('rejects short username, bad email, short password', () => {
    expect(registerSchema.safeParse({ username: 'ab', email: 'm@x.com', password: 'longenough' }).success).toBe(false);
    expect(registerSchema.safeParse({ username: 'maya', email: 'nope', password: 'longenough' }).success).toBe(false);
    expect(registerSchema.safeParse({ username: 'maya', email: 'm@x.com', password: 'short' }).success).toBe(false);
  });
});

describe('user services', () => {
  it('creates a user and verifies credentials by username or email', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'maya', email: 'maya@x.com', password: 'longenough' });
    expect(u.username).toBe('maya');
    expect(await verifyCredentials(db, 'maya', 'longenough')).toMatchObject({ id: u.id });
    expect(await verifyCredentials(db, 'maya@x.com', 'longenough')).toMatchObject({ id: u.id });
    expect(await verifyCredentials(db, 'maya', 'wrongpass')).toBeNull();
    expect(await verifyCredentials(db, 'ghost', 'longenough')).toBeNull();
  });

  it('throws typed errors on duplicates', async () => {
    const db = await makeTestDb();
    await createUser(db, { username: 'sam', email: 'sam@x.com', password: 'longenough' });
    await expect(createUser(db, { username: 'sam', email: 'other@x.com', password: 'longenough' }))
      .rejects.toThrow('USERNAME_TAKEN');
    await expect(createUser(db, { username: 'other', email: 'sam@x.com', password: 'longenough' }))
      .rejects.toThrow('EMAIL_TAKEN');
  });

  it('findOrCreateGoogleUser links existing email, creates new otherwise, and is idempotent', async () => {
    const db = await makeTestDb();
    const existing = await createUser(db, { username: 'kai', email: 'kai@x.com', password: 'longenough' });
    const linked = await findOrCreateGoogleUser(db, { email: 'kai@x.com', name: 'Kai', providerAccountId: 'g-1' });
    expect(linked.id).toBe(existing.id);

    const fresh = await findOrCreateGoogleUser(db, { email: 'new@x.com', name: 'New Person', providerAccountId: 'g-2' });
    expect(fresh.username.length).toBeGreaterThanOrEqual(3);
    const again = await findOrCreateGoogleUser(db, { email: 'new@x.com', name: 'New Person', providerAccountId: 'g-2' });
    expect(again.id).toBe(fresh.id);
  });

  it('setTheme persists', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'zoe', email: 'z@x.com', password: 'longenough' });
    await setTheme(db, u.id, 'cozy');
    expect((await verifyCredentials(db, 'zoe', 'longenough'))?.theme).toBe('cozy');
  });

  it('verifyCredentials returns null for OAuth-only users (null passwordHash)', async () => {
    const db = await makeTestDb();
    const u = await findOrCreateGoogleUser(db, { email: 'oauth@x.com', name: 'O', providerAccountId: 'g-9' });
    expect(await verifyCredentials(db, 'oauth@x.com', 'anything')).toBeNull();
    expect(await verifyCredentials(db, u.username, 'anything')).toBeNull();
  });

  it('normalizes email case at registration and login', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'cased', email: 'Cased@X.com', password: 'longenough' });
    expect(u.email).toBe('cased@x.com');
    expect(await verifyCredentials(db, 'CASED@x.COM', 'longenough')).toMatchObject({ id: u.id });
    await expect(createUser(db, { username: 'other', email: 'cased@X.COM', password: 'longenough' }))
      .rejects.toThrow('EMAIL_TAKEN');
  });

  it('links Google sign-in case-insensitively to an existing email', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'gcase', email: 'gcase@x.com', password: 'longenough' });
    const linked = await findOrCreateGoogleUser(db, { email: 'GCase@X.com', name: 'G', providerAccountId: 'g-77' });
    expect(linked.id).toBe(u.id);
  });
});

describe('uniqueViolation', () => {
  it('maps unique violations from error or cause chain', () => {
    expect(uniqueViolation(Object.assign(new Error('x'), { code: '23505', constraint_name: 'users_username_unique' }))).toContain('username');
    const wrapped = new Error('outer'); (wrapped as Error & { cause?: unknown }).cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), { code: '23505' });
    expect(uniqueViolation(wrapped)).toContain('email');
    expect(uniqueViolation(new Error('connection refused'))).toBeNull();
  });
});
