import { formatDuration } from './time';

interface FunStats {
  total_puzzles?: number; avg_scaled_time?: number; total_pieces?: number;
  total_time_hours?: number; longest_streak?: number; favorite_piece_count?: number;
  best_pace?: number; fastest_solve?: number; longest_solve?: number;
  first_try_count?: number; biggest_puzzle?: number; std_deviation?: number;
  brands_count?: number;
}

export interface FunStatItem { icon: string; text: string; val: string }

/** Port of legacy updateFunStats() item list — same thresholds, same order. */
export function funStatItems(stats: FunStats): FunStatItem[] {
  if (!stats.total_puzzles) return [];
  const items: FunStatItem[] = [];

  const avgMin = stats.avg_scaled_time ? Math.round(stats.avg_scaled_time / 60) : 0;
  if (avgMin > 0) {
    const rank =
      avgMin <= 15 ? 'Lightning' : avgMin <= 25 ? 'Speedster' : avgMin <= 40 ? 'Swift' :
      avgMin <= 60 ? 'Steady' : avgMin <= 90 ? 'Patient' : 'Beginner';
    items.push({ icon: '⚡', text: 'Speed rank', val: rank });
  }
  if (stats.total_pieces) {
    items.push({ icon: '🧩', text: 'Pieces placed', val: stats.total_pieces.toLocaleString('en-US') });
  }
  if ((stats.total_time_hours ?? 0) >= 1) {
    const movies = Math.round(stats.total_time_hours! / 2);
    if (movies > 0) items.push({ icon: '🎬', text: 'Could have watched', val: `${movies} movie${movies > 1 ? 's' : ''}` });
  }
  if (stats.longest_streak) {
    items.push({ icon: '🔥', text: 'Longest streak', val: `${stats.longest_streak} day${stats.longest_streak > 1 ? 's' : ''}` });
  }
  if (stats.favorite_piece_count) items.push({ icon: '💗', text: 'Favorite size', val: `${stats.favorite_piece_count}pc` });
  if (stats.best_pace) items.push({ icon: '🚀', text: 'Fastest pace', val: `${stats.best_pace}s/piece` });
  if (stats.fastest_solve) items.push({ icon: '⏱️', text: 'Fastest solve', val: formatDuration(stats.fastest_solve) });
  if (stats.longest_solve) items.push({ icon: '🕰️', text: 'Longest solve', val: formatDuration(stats.longest_solve) });
  if (stats.first_try_count) items.push({ icon: '🎯', text: 'First-try solves', val: String(stats.first_try_count) });
  if (stats.biggest_puzzle) items.push({ icon: '🏔️', text: 'Biggest conquered', val: `${stats.biggest_puzzle.toLocaleString('en-US')}pc` });
  if (stats.std_deviation && stats.avg_scaled_time) {
    const cv = stats.std_deviation / stats.avg_scaled_time;
    const consistency = cv < 0.15 ? 'Metronome' : cv < 0.3 ? 'Steady' : cv < 0.5 ? 'Variable' : 'Wild card';
    items.push({ icon: '🎲', text: 'Consistency', val: consistency });
  }
  if (stats.brands_count) items.push({ icon: '🏭', text: 'Brands explored', val: String(stats.brands_count) });
  return items;
}
