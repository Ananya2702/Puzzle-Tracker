import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { solves, goals, splits as splitsTable } from '@/db/schema';
import { calculateScaledTime } from './scaling';
import { getScalingExponent } from './settings-service';

export type SolveRow = typeof solves.$inferSelect;

export const solveInputSchema = z.object({
  pieces: z.number().int().positive(),
  time_seconds: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  puzzle_name: z.string().max(300).default(''),
  brand: z.string().max(200).default(''),
  difficulty_rating: z.number().int().min(1).max(5).default(3),
  notes: z.string().max(5000).default(''),
  tags: z.string().max(1000).default(''),
  puzzle_type: z.enum(['solo', 'duo', 'team']).default('solo'),
  first_attempt: z.boolean().default(false),
  splits: z.array(z.object({
    phase: z.string().min(1).max(40),
    seconds: z.number().int().positive(),
    position: z.number().int().min(0),
  })).max(20).optional(),
});
export type SolveInput = z.infer<typeof solveInputSchema>;

const SORT_COLS = { date: solves.date, time: solves.timeSeconds, scaled: solves.scaledTimeSeconds, pieces: solves.pieces } as const;

export async function listSolves(
  db: Db,
  userId: number,
  opts: { pieces?: number; sort?: keyof typeof SORT_COLS; order?: 'asc' | 'desc' } = {},
): Promise<SolveRow[]> {
  const col = SORT_COLS[opts.sort ?? 'date'];
  const dir = opts.order === 'asc' ? asc : desc;
  const where = opts.pieces != null
    ? and(eq(solves.userId, userId), eq(solves.pieces, opts.pieces))
    : eq(solves.userId, userId);
  return db.select().from(solves).where(where).orderBy(dir(col), dir(solves.id));
}

export async function listSolvesChrono(db: Db, userId: number): Promise<SolveRow[]> {
  return db.select().from(solves).where(eq(solves.userId, userId)).orderBy(asc(solves.date), asc(solves.id));
}

/** Clear all PB flags, then set one per distinct solo piece count (min time, earliest id on ties). */
export async function updatePersonalBests(db: Db, userId: number): Promise<void> {
  await db.update(solves).set({ isPersonalBest: false }).where(eq(solves.userId, userId));
  const solo = await db
    .select({ id: solves.id, pieces: solves.pieces, timeSeconds: solves.timeSeconds })
    .from(solves)
    .where(and(eq(solves.userId, userId), eq(solves.puzzleType, 'solo')))
    .orderBy(asc(solves.timeSeconds), asc(solves.id));
  const seen = new Set<number>();
  for (const row of solo) {
    if (seen.has(row.pieces)) continue;
    seen.add(row.pieces);
    await db.update(solves).set({ isPersonalBest: true }).where(eq(solves.id, row.id));
  }
}

export async function addSolve(
  db: Db,
  userId: number,
  rawInput: unknown,
  today: string,
): Promise<{ solve: SolveRow; achievedGoalIds: number[] }> {
  const input = solveInputSchema.parse(rawInput);
  const date = input.date ?? today;
  const exponent = await getScalingExponent(db, userId);
  const [inserted] = await db
    .insert(solves)
    .values({
      userId,
      date,
      pieces: input.pieces,
      timeSeconds: input.time_seconds,
      scaledTimeSeconds: calculateScaledTime(input.time_seconds, input.pieces, exponent),
      puzzleName: input.puzzle_name,
      brand: input.brand,
      difficultyRating: input.difficulty_rating,
      notes: input.notes,
      tags: input.tags,
      puzzleType: input.puzzle_type,
      firstAttempt: input.first_attempt,
    })
    .returning();

  if (input.splits?.length) {
    await db.insert(splitsTable).values(
      input.splits.map((sp) => ({ solveId: inserted.id, phase: sp.phase, seconds: sp.seconds, position: sp.position })),
    );
  }

  await updatePersonalBests(db, userId);

  const openGoals = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.pieces, input.pieces), eq(goals.achieved, false)));
  const achievedGoalIds: number[] = [];
  for (const g of openGoals) {
    if (input.time_seconds <= g.targetTimeSeconds) {
      await db.update(goals).set({ achieved: true, achievedDate: date }).where(eq(goals.id, g.id));
      achievedGoalIds.push(g.id);
    }
  }

  const [fresh] = await db.select().from(solves).where(eq(solves.id, inserted.id));
  return { solve: fresh, achievedGoalIds };
}

// NOTE: `solveInputSchema.partial()` would NOT work here — in zod v4, wrapping a
// field that has `.default(...)` in `.optional()` still applies the default when
// the key is omitted (verified empirically), so omitted fields would be silently
// reset to their schema defaults (e.g. brand -> '') instead of being left alone.
// Build the partial schema from scratch, with no defaults, so omitted keys parse
// to `undefined` and `partial.X ?? existing.X` below actually preserves them.
const solveUpdateSchema = z.object({
  pieces: z.number().int().positive().optional(),
  time_seconds: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  puzzle_name: z.string().max(300).optional(),
  brand: z.string().max(200).optional(),
  difficulty_rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.string().max(1000).optional(),
  puzzle_type: z.enum(['solo', 'duo', 'team']).optional(),
  first_attempt: z.boolean().optional(),
});

export async function updateSolve(
  db: Db,
  userId: number,
  solveId: number,
  rawPartial: unknown,
): Promise<SolveRow | null> {
  const partial = solveUpdateSchema.parse(rawPartial);
  const [existing] = await db
    .select()
    .from(solves)
    .where(and(eq(solves.id, solveId), eq(solves.userId, userId)));
  if (!existing) return null;

  const pieces = partial.pieces ?? existing.pieces;
  const timeSeconds = partial.time_seconds ?? existing.timeSeconds;
  const exponent = await getScalingExponent(db, userId);
  await db
    .update(solves)
    .set({
      date: partial.date ?? existing.date,
      pieces,
      timeSeconds,
      scaledTimeSeconds: calculateScaledTime(timeSeconds, pieces, exponent),
      puzzleName: partial.puzzle_name ?? existing.puzzleName,
      brand: partial.brand ?? existing.brand,
      difficultyRating: partial.difficulty_rating ?? existing.difficultyRating,
      notes: partial.notes ?? existing.notes,
      tags: partial.tags ?? existing.tags,
      puzzleType: partial.puzzle_type ?? existing.puzzleType,
      firstAttempt: partial.first_attempt ?? existing.firstAttempt,
      updatedAt: new Date(),
    })
    .where(eq(solves.id, solveId));
  await updatePersonalBests(db, userId);
  const [fresh] = await db.select().from(solves).where(eq(solves.id, solveId));
  return fresh;
}

export async function deleteSolve(db: Db, userId: number, solveId: number): Promise<boolean> {
  const deleted = await db
    .delete(solves)
    .where(and(eq(solves.id, solveId), eq(solves.userId, userId)))
    .returning({ id: solves.id });
  if (deleted.length === 0) return false;
  await updatePersonalBests(db, userId);
  return true;
}

/** Legacy CSV export rows (header + one row per solve, in the order given). */
export function csvRows(rows: SolveRow[]): string[][] {
  const fmtHMS = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  return [
    ['Date', 'Puzzle Name', 'Brand', 'Pieces', 'Time (seconds)', 'Time (formatted)', 'Scaled Time (500pc)', 'Difficulty', 'Notes', 'Tags'],
    ...rows.map((p) => [
      p.date, p.puzzleName, p.brand, String(p.pieces), String(p.timeSeconds),
      fmtHMS(p.timeSeconds), String(Math.round(p.scaledTimeSeconds)),
      String(p.difficultyRating), p.notes, p.tags,
    ]),
  ];
}
