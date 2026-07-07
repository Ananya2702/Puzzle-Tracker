import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { hashPassword, verifyPassword } from './password';

export type PublicUser = { id: number; username: string; email: string; theme: string };

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username: 3-30 letters, numbers, underscores'),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(200),
});

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id, username: u.username, email: u.email, theme: u.theme,
});

export function uniqueViolation(e: unknown): string | null {
  for (let err = e; err instanceof Error; err = err.cause as Error) {
    const maybe = err as { code?: string; constraint_name?: string; constraint?: string; message: string };
    if (maybe.code === '23505' || /duplicate key value/i.test(maybe.message)) {
      return maybe.constraint_name ?? maybe.constraint ?? maybe.message;
    }
    if (!(err.cause instanceof Error)) break;
  }
  return null;
}

export async function createUser(db: Db, input: z.infer<typeof registerSchema>): Promise<PublicUser> {
  const email = input.email.toLowerCase();
  const [byName] = await db.select().from(users).where(eq(users.username, input.username));
  if (byName) throw new Error('USERNAME_TAKEN');
  const [byEmail] = await db.select().from(users).where(eq(users.email, email));
  if (byEmail) throw new Error('EMAIL_TAKEN');
  try {
    const [row] = await db
      .insert(users)
      .values({ username: input.username, email, passwordHash: await hashPassword(input.password) })
      .returning();
    return toPublic(row);
  } catch (e) {
    const violation = uniqueViolation(e);
    if (violation) {
      if (/username/i.test(violation)) throw new Error('USERNAME_TAKEN');
      if (/email/i.test(violation)) throw new Error('EMAIL_TAKEN');
    }
    throw e;
  }
}

export async function verifyCredentials(db: Db, identifier: string, password: string): Promise<PublicUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier.toLowerCase())));
  if (!row?.passwordHash) return null;
  return (await verifyPassword(password, row.passwordHash)) ? toPublic(row) : null;
}

export async function findOrCreateGoogleUser(
  db: Db,
  input: { email: string; name: string; providerAccountId: string },
): Promise<PublicUser> {
  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  let user = existing;
  if (!user) {
    try {
      [user] = await db
        .insert(users)
        .values({ username: await availableUsername(db, email), email, passwordHash: null })
        .returning();
    } catch (e) {
      if (!uniqueViolation(e)) throw e;
      const [reselected] = await db.select().from(users).where(eq(users.email, email));
      if (!reselected) throw e;
      user = reselected;
    }
  }
  await db
    .insert(oauthAccounts)
    .values({ provider: 'google', providerAccountId: input.providerAccountId, userId: user.id })
    .onConflictDoNothing();
  return toPublic(user);
}

async function availableUsername(db: Db, email: string): Promise<string> {
  const base = (email.split('@')[0] ?? 'puzzler').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'puzzler';
  const padded = base.length >= 3 ? base : `${base}_puzzler`.slice(0, 24);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? padded : `${padded}${Math.floor(Math.random() * 10000)}`;
    const [hit] = await db.select().from(users).where(eq(users.username, candidate));
    if (!hit) return candidate;
  }
  throw new Error('USERNAME_GENERATION_FAILED');
}

export async function setTheme(db: Db, userId: number, theme: 'midnight' | 'cozy'): Promise<void> {
  await db.update(users).set({ theme }).where(eq(users.id, userId));
}
