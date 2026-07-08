import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { goals } from '@/db/schema';

export type GoalRow = typeof goals.$inferSelect;

export const goalInputSchema = z.object({
  pieces: z.number().int().positive(),
  target_time_seconds: z.number().int().positive(),
  description: z.string().max(500).default(''),
});

export async function listGoals(db: Db, userId: number): Promise<GoalRow[]> {
  return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt), desc(goals.id));
}

export async function addGoal(db: Db, userId: number, rawInput: unknown): Promise<GoalRow> {
  const input = goalInputSchema.parse(rawInput);
  const [row] = await db
    .insert(goals)
    .values({ userId, pieces: input.pieces, targetTimeSeconds: input.target_time_seconds, description: input.description })
    .returning();
  return row;
}

export async function deleteGoal(db: Db, userId: number, goalId: number): Promise<boolean> {
  const deleted = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .returning({ id: goals.id });
  return deleted.length > 0;
}
