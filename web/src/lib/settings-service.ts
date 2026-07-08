import { eq, and } from 'drizzle-orm';
import type { Db } from '@/db';
import { settings, solves } from '@/db/schema';
import { calculateScaledTime, DEFAULT_SCALING_EXPONENT } from './scaling';

export async function getSettings(db: Db, userId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(settings).where(eq(settings.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getScalingExponent(db: Db, userId: number): Promise<number> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'scaling_exponent')));
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_SCALING_EXPONENT;
}

/** Upsert settings; changing scaling_exponent rescales all of the user's solves (legacy behavior). */
export async function putSettings(db: Db, userId: number, entries: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(settings)
      .values({ userId, key, value: String(value) })
      .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: String(value) } });
  }
  if ('scaling_exponent' in entries) {
    const exponent = Number(entries.scaling_exponent);
    if (Number.isFinite(exponent)) {
      const rows = await db
        .select({ id: solves.id, timeSeconds: solves.timeSeconds, pieces: solves.pieces })
        .from(solves)
        .where(eq(solves.userId, userId));
      for (const r of rows) {
        await db
          .update(solves)
          .set({ scaledTimeSeconds: calculateScaledTime(r.timeSeconds, r.pieces, exponent) })
          .where(eq(solves.id, r.id));
      }
    }
  }
}
