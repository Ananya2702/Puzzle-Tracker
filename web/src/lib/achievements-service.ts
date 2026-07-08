import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { achievements } from '@/db/schema';
import { listSolvesChrono } from './solves';
import { streakInfo } from './streaks';

export const ACHIEVEMENT_DEFS = [
  { code: 'first_puzzle', name: 'First Piece', description: 'Complete your first puzzle', icon: 'puzzle-piece' },
  { code: 'five_puzzles', name: 'Getting Started', description: 'Complete 5 puzzles', icon: 'star' },
  { code: 'ten_puzzles', name: 'Dedicated', description: 'Complete 10 puzzles', icon: 'fire' },
  { code: 'twentyfive_puzzles', name: 'Quarter Century', description: 'Complete 25 puzzles', icon: 'trophy' },
  { code: 'fifty_puzzles', name: 'Half Century', description: 'Complete 50 puzzles', icon: 'crown' },
  { code: 'hundred_puzzles', name: 'Centurion', description: 'Complete 100 puzzles', icon: 'gem' },
  { code: 'speed_demon', name: 'Speed Demon', description: 'Complete a 500pc puzzle under 30 minutes', icon: 'bolt' },
  { code: 'marathon', name: 'Marathon Runner', description: 'Complete a 2000+ piece puzzle', icon: 'mountain' },
  { code: 'streak_3', name: 'Three-peat', description: 'Puzzle 3 days in a row', icon: 'calendar' },
  { code: 'streak_7', name: 'Week Warrior', description: 'Puzzle 7 days in a row', icon: 'flame' },
  { code: 'streak_30', name: 'Monthly Master', description: 'Puzzle 30 days in a row', icon: 'rocket' },
  { code: 'improver', name: 'Getting Better', description: 'Improve your scaled time by 10%', icon: 'chart-up' },
  { code: 'big_improver', name: 'Major Progress', description: 'Improve your scaled time by 25%', icon: 'trending-up' },
  { code: 'variety', name: 'Variety Pack', description: 'Complete puzzles of 4+ different piece counts', icon: 'grid' },
  { code: 'all_rounder', name: 'All Rounder', description: 'Complete puzzles of 6+ different piece counts', icon: 'globe' },
  { code: 'night_owl', name: 'Consistent', description: 'Log puzzles on 10 different days', icon: 'moon' },
  { code: 'pb_breaker', name: 'Record Breaker', description: 'Beat your personal best 3 times', icon: 'medal' },
  { code: 'hour_club', name: '10 Hour Club', description: 'Spend 10+ hours puzzling total', icon: 'clock' },
  { code: 'day_club', name: '24 Hour Club', description: 'Spend 24+ hours puzzling total', icon: 'sun' },
] as const;

export type AchievementRow = typeof achievements.$inferSelect;

export async function seedAchievements(db: Db, userId: number): Promise<void> {
  await db
    .insert(achievements)
    .values(ACHIEVEMENT_DEFS.map((d) => ({ userId, ...d })))
    .onConflictDoNothing();
}

export async function listAchievements(db: Db, userId: number): Promise<AchievementRow[]> {
  await seedAchievements(db, userId);
  return db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(desc(achievements.unlocked), asc(achievements.id));
}

/** Evaluate all checks; unlock newly-earned ones (unlockedDate = today); return newly unlocked codes. */
export async function checkAchievements(db: Db, userId: number, today: string): Promise<string[]> {
  await seedAchievements(db, userId);
  const rows = await listSolvesChrono(db, userId);
  const total = rows.length;
  if (total === 0) return [];

  const checks: Record<string, boolean> = {
    first_puzzle: total >= 1,
    five_puzzles: total >= 5,
    ten_puzzles: total >= 10,
    twentyfive_puzzles: total >= 25,
    fifty_puzzles: total >= 50,
    hundred_puzzles: total >= 100,
    speed_demon: rows.some((p) => p.pieces === 500 && p.timeSeconds < 1800),
    marathon: rows.some((p) => p.pieces >= 2000),
  };

  const dates = [...new Set(rows.map((p) => p.date))].sort();
  const { longest } = streakInfo(dates, today);
  checks.streak_3 = longest >= 3;
  checks.streak_7 = longest >= 7;
  checks.streak_30 = longest >= 30;

  if (total >= 3) {
    const cc = Math.min(5, Math.max(1, Math.floor(total / 3)));
    const scaled = rows.map((p) => p.scaledTimeSeconds);
    const firstAvg = scaled.slice(0, cc).reduce((a, b) => a + b, 0) / cc;
    const lastAvg = scaled.slice(-cc).reduce((a, b) => a + b, 0) / cc;
    const imp = firstAvg > 0 ? ((firstAvg - lastAvg) / firstAvg) * 100 : 0;
    checks.improver = imp >= 10;
    checks.big_improver = imp >= 25;
  }

  const pieceCounts = new Set(rows.map((p) => p.pieces));
  checks.variety = pieceCounts.size >= 4;
  checks.all_rounder = pieceCounts.size >= 6;
  checks.night_owl = dates.length >= 10;
  checks.pb_breaker = rows.filter((p) => p.isPersonalBest).length >= 3;
  const totalTime = rows.reduce((a, p) => a + p.timeSeconds, 0);
  checks.hour_club = totalTime >= 36_000;
  checks.day_club = totalTime >= 86_400;

  const earned = Object.entries(checks).filter(([, ok]) => ok).map(([code]) => code);
  if (earned.length === 0) return [];
  const newly = await db
    .update(achievements)
    .set({ unlocked: true, unlockedDate: today })
    .where(and(eq(achievements.userId, userId), eq(achievements.unlocked, false), inArray(achievements.code, earned)))
    .returning({ code: achievements.code });
  return newly.map((r) => r.code);
}
