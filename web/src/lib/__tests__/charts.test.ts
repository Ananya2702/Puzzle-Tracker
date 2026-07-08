import { describe, it, expect } from 'vitest';
import { trendData, pieceBreakdown, paceData, weeklyData } from '@/lib/charts';
import type { SolveRow } from '@/lib/solves';

let nextId = 1;
const R = (over: Partial<SolveRow>): SolveRow => ({
  id: nextId++, userId: 1, puzzleId: null, date: '2026-07-01', pieces: 500,
  timeSeconds: 3000, scaledTimeSeconds: 3000, puzzleName: '', brand: '',
  difficultyRating: 3, notes: '', tags: '', isPersonalBest: false,
  puzzleType: 'solo', firstAttempt: false, source: '', sourceId: null,
  communityAvgTime: null, communityBestTime: null, playerRank: null,
  communitySolvers: null, createdAt: new Date(0), updatedAt: new Date(0), ...over,
});

describe('trendData', () => {
  it('computes trailing moving averages', () => {
    const rows = [1000, 2000, 3000, 4000, 5000, 6000].map((s) => R({ scaledTimeSeconds: s }));
    const t = trendData(rows);
    expect(t.moving_avg_5[0]).toBe(1000);
    expect(t.moving_avg_5[4]).toBe(3000); // mean 1000..5000
    expect(t.moving_avg_5[5]).toBe(4000); // mean 2000..6000
    expect(t.moving_avg_10[5]).toBe(3500); // all six
  });
});

describe('pieceBreakdown', () => {
  it('aggregates per piece count', () => {
    const rows = [
      R({ pieces: 500, timeSeconds: 3000 }), R({ pieces: 500, timeSeconds: 2000 }),
      R({ pieces: 1000, timeSeconds: 7000 }),
    ];
    expect(pieceBreakdown(rows)).toEqual({
      500: { count: 2, average: 2500, best: 2000, worst: 3000 },
      1000: { count: 1, average: 7000, best: 7000, worst: 7000 },
    });
  });
});

describe('paceData', () => {
  it('maps to sec/piece with 2 decimals', () => {
    const [p] = paceData([R({ pieces: 300, timeSeconds: 1000 })]);
    expect(p.pace).toBe(3.33);
  });
});

describe('weeklyData', () => {
  it('groups by Monday-start weeks, ascending', () => {
    const rows = [
      R({ date: '2026-07-01', scaledTimeSeconds: 3000, timeSeconds: 3000 }), // Wed → week 2026-06-29
      R({ date: '2026-07-06', scaledTimeSeconds: 2000, timeSeconds: 2000 }), // Mon → week 2026-07-06
      R({ date: '2026-07-05', scaledTimeSeconds: 4000, timeSeconds: 4000 }), // Sun → week 2026-06-29
    ];
    const w = weeklyData(rows);
    expect(w.map((x) => x.week)).toEqual(['2026-06-29', '2026-07-06']);
    expect(w[0]).toMatchObject({ count: 2, total_time: 7000, avg_scaled: 3500, best_scaled: 3000, total_pieces: 1000 });
  });
});
