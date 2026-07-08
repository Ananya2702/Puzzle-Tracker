import { describe, it, expect } from 'vitest';
import { computeStatistics, type StatSolve } from '@/lib/stats';

const S = (over: Partial<StatSolve>): StatSolve => ({
  date: '2026-07-01', pieces: 500, timeSeconds: 3000, scaledTimeSeconds: 3000,
  puzzleType: 'solo', brand: '', difficultyRating: 3, firstAttempt: false,
  isPersonalBest: false, communityAvgTime: null, playerRank: null, ...over,
});
const TODAY = '2026-07-07'; // a Tuesday; Monday of that week = 2026-07-06

describe('computeStatistics', () => {
  it('empty input returns the legacy zero object', () => {
    const s = computeStatistics([], TODAY);
    expect(s.total_puzzles).toBe(0);
    expect(s.pace_trend).toBe('N/A');
    expect(s.personal_bests).toEqual({});
    expect(s.community).toEqual({ has_data: false });
  });

  it('computes core aggregates, median (even n), and PBs per piece count', () => {
    const s = computeStatistics([
      S({ date: '2026-06-01', timeSeconds: 3600, scaledTimeSeconds: 3600 }),
      S({ date: '2026-06-03', timeSeconds: 3000, scaledTimeSeconds: 3000 }),
      S({ date: '2026-06-05', pieces: 1000, timeSeconds: 7200, scaledTimeSeconds: 5456.58 }),
      S({ date: '2026-06-07', pieces: 1000, timeSeconds: 6000, scaledTimeSeconds: 4547.15 }),
    ], TODAY);
    expect(s.total_puzzles).toBe(4);
    expect(s.total_pieces).toBe(3000);
    expect(s.total_time_hours).toBe(5.5); // 19800/3600
    expect(s.median_scaled_time).toBe(Math.round((3600 + 4547.15) / 2));
    expect(s.personal_bests).toEqual({ 500: 3000, 1000: 6000 });
    expect(s.favorite_piece_count).toBe(500); // tie → most_common picks first-seen highest count; with 2v2 legacy Counter returns 500 (first encountered)
    expect(s.biggest_puzzle).toBe(1000);
    expect(s.fastest_solve).toBe(3000);
    expect(s.longest_solve).toBe(7200);
  });

  it('perf metrics exclude duo/team but volume metrics include them', () => {
    const s = computeStatistics([
      S({ date: '2026-06-01', timeSeconds: 3000, scaledTimeSeconds: 3000 }),
      S({ date: '2026-06-02', timeSeconds: 100, scaledTimeSeconds: 100, puzzleType: 'duo' }),
    ], TODAY);
    expect(s.total_puzzles).toBe(2);
    expect(s.best_scaled_time).toBe(3000); // duo's 100 not counted for perf
    expect(s.personal_bests).toEqual({ 500: 3000 });
  });

  it('falls back to all solves for perf when there are zero solo solves', () => {
    const s = computeStatistics([S({ puzzleType: 'duo', scaledTimeSeconds: 1234 })], TODAY);
    expect(s.best_scaled_time).toBe(1234);
  });

  it('improvement % uses cc = min(5, max(1, floor(n/3)))', () => {
    // 6 solves → cc=2; first two avg 4000, last two avg 2000 → 50.0%
    const rows = [4000, 4000, 3000, 3000, 2000, 2000].map((t, i) =>
      S({ date: `2026-06-0${i + 1}`, timeSeconds: t, scaledTimeSeconds: t }));
    expect(computeStatistics(rows, TODAY).improvement_pct).toBe(50.0);
  });

  it('pace trend: improving when second half < 95% of first', () => {
    const rows = [4000, 4000, 2000, 2000].map((t, i) =>
      S({ date: `2026-06-0${i + 1}`, timeSeconds: t, scaledTimeSeconds: t }));
    expect(computeStatistics(rows, TODAY).pace_trend).toBe('Improving');
  });

  it('week/month/year boundaries from injected today', () => {
    const s = computeStatistics([
      S({ date: '2026-07-06' }), // Monday this week
      S({ date: '2026-07-01' }), // this month, not this week
      S({ date: '2026-01-15' }), // this year only
      S({ date: '2025-12-31' }), // last year
    ], TODAY);
    expect(s.this_week_count).toBe(1);
    expect(s.this_month_count).toBe(2);
    expect(s.this_year_count).toBe(3);
  });

  it('community block aggregates myspeedpuzzling data', () => {
    const s = computeStatistics([
      S({ timeSeconds: 900, communityAvgTime: 1000, playerRank: 2 }),  // beat avg by 10%
      S({ timeSeconds: 1200, communityAvgTime: 1000, playerRank: 8 }), // 20% slower
      S({}),
    ], TODAY);
    expect(s.community).toMatchObject({
      has_data: true, compared_count: 2, beat_avg_count: 1,
      avg_vs_community_pct: -5.0, best_vs_community_pct: 10.0,
      best_rank: 2, podiums: 1, top10: 2, ranked_count: 2,
    });
  });

  it('brands, difficulty, first tries', () => {
    const s = computeStatistics([
      S({ brand: 'Ravensburger', difficultyRating: 4, firstAttempt: true }),
      S({ brand: ' ravensburger ', difficultyRating: 2 }),
      S({ brand: 'Buffalo' }),
    ], TODAY);
    expect(s.brands_count).toBe(3); // legacy set is case-sensitive after trim: 'Ravensburger', 'ravensburger', 'Buffalo'
    expect(s.avg_difficulty).toBe(3.0);
    expect(s.first_try_count).toBe(1);
  });
});
