export interface LevelInfo {
  level: number;
  totalXP: number;
  xpInCurrentLevel: number;
  xpForNext: number;
  progress: number; // 0-100
}

/** Legacy XP curve from static/app.js: 50/puzzle + 10/hour + 100/streak-day; next level costs round(100 * 1.4^(level-1)). */
export function calculateLevel(stats: {
  total_puzzles?: number;
  total_time_hours?: number;
  longest_streak?: number;
}): LevelInfo {
  const totalXP =
    (stats.total_puzzles ?? 0) * 50 +
    (stats.total_time_hours ?? 0) * 10 +
    (stats.longest_streak ?? 0) * 100;

  let level = 1;
  let xpForNext = 100;
  let xpAccum = 0;
  while (xpAccum + xpForNext <= totalXP) {
    xpAccum += xpForNext;
    level++;
    xpForNext = Math.round(100 * 1.4 ** (level - 1));
  }
  const xpInCurrentLevel = totalXP - xpAccum;
  const progress = Math.min(100, Math.round((xpInCurrentLevel / xpForNext) * 100));
  return { level, totalXP, xpInCurrentLevel, xpForNext, progress };
}
