import { streakInfo } from './streaks';

export interface StatSolve {
  date: string;
  pieces: number;
  timeSeconds: number;
  scaledTimeSeconds: number;
  puzzleType: string;
  brand: string;
  difficultyRating: number;
  firstAttempt: boolean;
  isPersonalBest: boolean;
  communityAvgTime: number | null;
  playerRank: number | null;
}

export interface CommunityStats {
  has_data: boolean;
  compared_count?: number;
  beat_avg_count?: number;
  avg_vs_community_pct?: number;
  best_vs_community_pct?: number;
  best_rank?: number;
  podiums?: number;
  top10?: number;
  ranked_count?: number;
}

export interface Statistics {
  total_puzzles: number; total_time_hours: number; total_pieces: number;
  avg_scaled_time: number; median_scaled_time: number; best_scaled_time: number;
  worst_scaled_time: number; std_deviation: number; improvement_pct: number;
  current_streak: number; longest_streak: number; avg_pieces: number;
  favorite_piece_count: number; personal_bests: Record<number, number>;
  pace_trend: string; avg_pace: number; best_pace: number;
  this_week_count: number; this_month_count: number; this_year_count: number;
  fastest_solve: number; longest_solve: number; biggest_puzzle: number;
  brands_count: number; days_active: number; avg_difficulty: number;
  first_try_count: number; community: CommunityStats;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

function isoAddDays(date: string, delta: number): string {
  const t = new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** Port of legacy get_statistics(). `solves` MUST be ordered date ASC, id ASC. `today` is YYYY-MM-DD. */
export function computeStatistics(solves: StatSolve[], today: string): Statistics {
  if (solves.length === 0) {
    return {
      total_puzzles: 0, total_time_hours: 0, total_pieces: 0, avg_scaled_time: 0,
      median_scaled_time: 0, best_scaled_time: 0, worst_scaled_time: 0,
      std_deviation: 0, improvement_pct: 0, current_streak: 0, longest_streak: 0,
      avg_pieces: 0, favorite_piece_count: 0, personal_bests: {}, pace_trend: 'N/A',
      avg_pace: 0, best_pace: 0, this_week_count: 0, this_month_count: 0,
      this_year_count: 0, fastest_solve: 0, longest_solve: 0, biggest_puzzle: 0,
      brands_count: 0, days_active: 0, avg_difficulty: 0, first_try_count: 0,
      community: { has_data: false },
    };
  }

  const nAll = solves.length;
  const totalTime = solves.reduce((a, p) => a + p.timeSeconds, 0);
  const totalPieces = solves.reduce((a, p) => a + p.pieces, 0);

  // Perf metrics: solo only, falling back to all if no solo solves exist.
  const soloOnly = solves.filter((p) => (p.puzzleType || 'solo') === 'solo');
  const perf = soloOnly.length > 0 ? soloOnly : solves;
  const scaled = perf.map((p) => p.scaledTimeSeconds);
  const sortedScaled = [...scaled].sort((a, b) => a - b);
  const n = sortedScaled.length;
  const median = n % 2 === 1 ? sortedScaled[(n - 1) / 2] : (sortedScaled[n / 2 - 1] + sortedScaled[n / 2]) / 2;
  const avg = scaled.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(scaled.reduce((a, t) => a + (t - avg) ** 2, 0) / n);

  const cc = Math.min(5, Math.max(1, Math.floor(n / 3)));
  const firstAvg = scaled.slice(0, cc).reduce((a, b) => a + b, 0) / cc;
  const lastAvg = scaled.slice(-cc).reduce((a, b) => a + b, 0) / cc;
  const improvementPct = firstAvg > 0 ? ((firstAvg - lastAvg) / firstAvg) * 100 : 0;

  const dates = [...new Set(solves.map((p) => p.date))].sort();
  const { current: currentStreak, longest: longestStreak } = streakInfo(dates, today);

  const personalBests: Record<number, number> = {};
  for (const p of perf) {
    if (!(p.pieces in personalBests) || p.timeSeconds < personalBests[p.pieces]) {
      personalBests[p.pieces] = p.timeSeconds;
    }
  }

  const pieceCounter = new Map<number, number>();
  for (const p of perf) pieceCounter.set(p.pieces, (pieceCounter.get(p.pieces) ?? 0) + 1);
  let favorite = perf[0].pieces;
  let favCount = 0;
  for (const [pc, count] of pieceCounter) {
    if (count > favCount) { favorite = pc; favCount = count; }
  }

  const paces = perf.map((p) => p.timeSeconds / p.pieces);

  let paceTrend = 'Need more data';
  if (n >= 4) {
    const mid = Math.floor(n / 2);
    const firstHalf = scaled.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = scaled.slice(mid).reduce((a, b) => a + b, 0) / (n - mid);
    paceTrend = secondHalf < firstHalf * 0.95 ? 'Improving' : secondHalf > firstHalf * 1.05 ? 'Slowing' : 'Steady';
  }

  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const weekStart = isoAddDays(today, -((dow + 6) % 7)); // Monday
  const monthStart = `${today.slice(0, 8)}01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const times = solves.map((p) => p.timeSeconds);
  const brands = new Set(solves.map((p) => (p.brand || '').trim()).filter(Boolean));
  const difficulties = solves.map((p) => p.difficultyRating).filter((d) => d > 0);
  const firstTryCount = solves.filter((p) => p.firstAttempt).length;

  const withAvg = solves.filter((p) => p.communityAvgTime != null && p.communityAvgTime > 0);
  const ranks = solves.map((p) => p.playerRank).filter((r): r is number => r != null && r > 0);
  const beatAvg = withAvg.filter((p) => p.timeSeconds < p.communityAvgTime!).length;
  const pctDiffs = withAvg.map((p) => ((p.communityAvgTime! - p.timeSeconds) / p.communityAvgTime!) * 100);
  const community: CommunityStats = {
    has_data: withAvg.length > 0 || ranks.length > 0,
    compared_count: withAvg.length,
    beat_avg_count: beatAvg,
    avg_vs_community_pct: pctDiffs.length ? round1(pctDiffs.reduce((a, b) => a + b, 0) / pctDiffs.length) : 0,
    best_vs_community_pct: pctDiffs.length ? round1(Math.max(...pctDiffs)) : 0,
    best_rank: ranks.length ? Math.min(...ranks) : 0,
    podiums: ranks.filter((r) => r <= 3).length,
    top10: ranks.filter((r) => r <= 10).length,
    ranked_count: ranks.length,
  };

  return {
    total_puzzles: nAll,
    total_time_hours: round1(totalTime / 3600),
    total_pieces: totalPieces,
    avg_scaled_time: Math.round(avg),
    median_scaled_time: Math.round(median),
    best_scaled_time: Math.round(Math.min(...scaled)),
    worst_scaled_time: Math.round(Math.max(...scaled)),
    std_deviation: Math.round(stdDev),
    improvement_pct: round1(improvementPct),
    current_streak: currentStreak,
    longest_streak: longestStreak,
    avg_pieces: Math.round(totalPieces / nAll),
    favorite_piece_count: favorite,
    personal_bests: personalBests,
    pace_trend: paceTrend,
    avg_pace: round2(paces.reduce((a, b) => a + b, 0) / paces.length),
    best_pace: round2(Math.min(...paces)),
    this_week_count: solves.filter((p) => p.date >= weekStart).length,
    this_month_count: solves.filter((p) => p.date >= monthStart).length,
    this_year_count: solves.filter((p) => p.date >= yearStart).length,
    fastest_solve: Math.min(...times),
    longest_solve: Math.max(...times),
    biggest_puzzle: Math.max(...solves.map((p) => p.pieces)),
    brands_count: brands.size,
    days_active: dates.length,
    avg_difficulty: difficulties.length ? round1(difficulties.reduce((a, b) => a + b, 0) / difficulties.length) : 0,
    first_try_count: firstTryCount,
    community,
  };
}
