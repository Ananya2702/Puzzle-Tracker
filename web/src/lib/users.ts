import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { hashPassword, verifyPassword } from './password';

export type PublicUser = { id: number; username: string; email: string; theme: string };

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username: 3-30 letters, numbers, underscores'),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id, username: u.username, email: u.email, theme: u.theme,
});

export async function createUser(db: Db, input: z.infer<typeof registerSchema>): Promise<PublicUser> {
  const [byName] = await db.select().from(users).where(eq(users.username, input.username));
  if (byName) throw new Error('USERNAME_TAKEN');
  const [byEmail] = await db.select().from(users).where(eq(users.email, input.email));
  if (byEmail) throw new Error('EMAIL_TAKEN');
  const [row] = await db
    .insert(users)
    .values({ username: input.username, email: input.email, passwordHash: await hashPassword(input.password) })
    .returning();
  return toPublic(row);
}

export async function verifyCredentials(db: Db, identifier: string, password: string): Promise<PublicUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)));
  if (!row?.passwordHash) return null;
  return (await verifyPassword(password, row.passwordHash)) ? toPublic(row) : null;
}

export async function findOrCreateGoogleUser(
  db: Db,
  input: { email: string; name: string; providerAccountId: string },
): Promise<PublicUser> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email));
  const user =
    existing ??
    (await db
      .insert(users)
      .values({ username: await availableUsername(db, input.email), email: input.email, passwordHash: null })
      .returning())[0];
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
