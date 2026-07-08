# Puzzle Geeks Revamp — Plan 2A of 3: Core Services & API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port every piece of the legacy Flask domain logic (scaling, stats, personal bests, achievements, goals, charts, settings, CSV export, myspeedpuzzling import) into typed, unit-tested services and API routes in `web/` — the backend for Plan 2B's UI.

**Architecture:** Pure functions where possible (`stats.ts`, `levels.ts`, `scaling.ts` take data in, return data out — `today` is always injected for testability). DB-touching services (`solves.ts`, `achievements-service.ts`, `settings-service.ts`, `goals-service.ts`, `import-speedpuzzling.ts`, `charts.ts`) take `(db, userId, …)` and are tested against PGlite via `makeTestDb()`. Thin API routes validate with zod, call services, and are tested with the established `vi.mock('@/db')` + `vi.mock('@/auth')` pattern from `register.test.ts`/`theme.test.ts`.

**Tech Stack:** Existing Plan-1 stack (Next.js 15, TS strict, Drizzle, PGlite tests, zod v4, Vitest). No new runtime dependencies.

**Legacy source of truth:** `app.py` and `static/app.js` at the repo root — formulas below are copied from them and must match to the digit. The legacy `puzzles` table rows are the new `solves` rows.

## Global Constraints

- All work under `web/`. Never modify root Flask files. npm; TS strict; no new deps without a task saying so.
- All durations integer **seconds**; dates `YYYY-MM-DD` strings; scaled times are floats (rounded only at the API/display edge, matching legacy `round()` behavior noted per-endpoint).
- Scaling formula EXACTLY: `scaled = timeSeconds * (500 / pieces) ** exponent`; `pieces <= 0 → 0`; default exponent **0.4**; per-user setting key `scaling_exponent` in the `settings` table.
- Personal bests: **solo solves only** (`puzzleType === 'solo'`), one PB flag per distinct piece count = minimum `timeSeconds`.
- Every task: `npm run lint` && `npx tsc --noEmit` clean before its commit; full `npm test` run before commit.
- Commit messages conventional, ending: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Route auth pattern: session via `auth()`; non-session or non-integer id → 401 `{error:'Authentication required'}` (same as `/api/me/theme`).

## File Structure (end state)

```
web/src/lib/
  scaling.ts                 # calculateScaledTime, scalingInfo
  levels.ts                  # calculateLevel (XP curve)
  stats.ts                   # computeStatistics (the big port)
  streaks.ts                 # currentAndLongestStreak (shared by stats + achievements)
  solves.ts                  # list/add/update/delete + updatePersonalBests + CSV rows
  goals-service.ts           # list/add/delete goals
  achievements-service.ts    # ACHIEVEMENT_DEFS, seed + check
  settings-service.ts        # getSettings/getScalingExponent/putSettings (+ rescale)
  charts.ts                  # trend/pieceBreakdown/pace/weekly
  import-speedpuzzling.ts    # bulk import with dedupe
  api-auth.ts                # requireUserId() helper for routes
web/src/app/api/
  solves/route.ts  solves/[id]/route.ts
  statistics/route.ts
  charts/[kind]/route.ts
  goals/route.ts  goals/[id]/route.ts
  achievements/route.ts
  settings/route.ts
  scaling-info/route.ts
  export/csv/route.ts
  import/speedpuzzling/route.ts
```

Type used throughout (define once in Task 1, import everywhere): `SolveRow = typeof solves.$inferSelect` from `@/db/schema`.

---

### Task 1: Scaling + XP level math (pure)

**Files:**
- Create: `web/src/lib/scaling.ts`, `web/src/lib/levels.ts`
- Test: `web/src/lib/__tests__/scaling.test.ts`, `web/src/lib/__tests__/levels.test.ts`

**Interfaces:**
- Produces: `DEFAULT_SCALING_EXPONENT = 0.4`; `calculateScaledTime(timeSeconds: number, pieces: number, exponent?: number): number`; `scalingInfo(exponent: number): { exponent: number; baselinePieces: 500; scalingTable: Record<number, { scalingFactor: number; example30min: number }> }`; `calculateLevel(stats: { total_puzzles?: number; total_time_hours?: number; longest_streak?: number }): { level: number; totalXP: number; xpInCurrentLevel: number; xpForNext: number; progress: number }`.

- [ ] **Step 1: Write failing tests**

`web/src/lib/__tests__/scaling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateScaledTime, scalingInfo, DEFAULT_SCALING_EXPONENT } from '@/lib/scaling';

describe('calculateScaledTime', () => {
  it('is identity at 500 pieces', () => {
    expect(calculateScaledTime(1800, 500)).toBe(1800);
  });
  it('scales a 1000pc solve down (matches legacy formula)', () => {
    // 3600 * (500/1000)^0.4 = 3600 * 0.757858...
    expect(calculateScaledTime(3600, 1000)).toBeCloseTo(2728.29, 1);
  });
  it('scales a 300pc solve up', () => {
    // 1200 * (500/300)^0.4 = 1200 * 1.226780...
    expect(calculateScaledTime(1200, 300)).toBeCloseTo(1472.14, 1);
  });
  it('returns 0 for pieces <= 0', () => {
    expect(calculateScaledTime(1000, 0)).toBe(0);
    expect(calculateScaledTime(1000, -5)).toBe(0);
  });
  it('exponent 0 disables scaling', () => {
    expect(calculateScaledTime(999, 2000, 0)).toBe(999);
  });
  it('default exponent is 0.4', () => {
    expect(DEFAULT_SCALING_EXPONENT).toBe(0.4);
  });
});

describe('scalingInfo', () => {
  it('builds the legacy preview table', () => {
    const info = scalingInfo(0.4);
    expect(info.baselinePieces).toBe(500);
    expect(Object.keys(info.scalingTable).map(Number)).toEqual([100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]);
    expect(info.scalingTable[500].scalingFactor).toBe(1);
    expect(info.scalingTable[500].example30min).toBe(1800);
    expect(info.scalingTable[1000].scalingFactor).toBeCloseTo(0.758, 3);
    expect(info.scalingTable[1000].example30min).toBe(1364); // round(1800 * 0.757858)
  });
});
```

`web/src/lib/__tests__/levels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateLevel } from '@/lib/levels';

describe('calculateLevel (legacy XP curve)', () => {
  it('level 1 with no XP', () => {
    expect(calculateLevel({})).toMatchObject({ level: 1, totalXP: 0, xpInCurrentLevel: 0, xpForNext: 100, progress: 0 });
  });
  it('XP = 50/puzzle + 10/hour + 100/longest-streak-day', () => {
    expect(calculateLevel({ total_puzzles: 2, total_time_hours: 3, longest_streak: 1 }).totalXP).toBe(230);
  });
  it('levels up when accumulated thresholds pass (100, then round(100*1.4^(lvl-1)))', () => {
    // thresholds: L1→2 needs 100; L2→3 needs round(100*1.4)=140; L3→4 needs round(100*1.4^2)=196
    const r = calculateLevel({ total_puzzles: 5 }); // 250 XP
    expect(r.level).toBe(3); // 100 + 140 = 240 consumed, 10 into level 3
    expect(r.xpInCurrentLevel).toBe(10);
    expect(r.xpForNext).toBe(196);
    expect(r.progress).toBe(5); // round(10/196*100)
  });
  it('progress caps at 100', () => {
    expect(calculateLevel({ total_puzzles: 1000 }).progress).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `web/`): `npx vitest run src/lib/__tests__/scaling.test.ts src/lib/__tests__/levels.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

`web/src/lib/scaling.ts`:

```ts
export const DEFAULT_SCALING_EXPONENT = 0.4;

const COMMON_PIECES = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];

/** Legacy formula: normalize any solve to a 500-piece-equivalent time. */
export function calculateScaledTime(
  timeSeconds: number,
  pieces: number,
  exponent: number = DEFAULT_SCALING_EXPONENT,
): number {
  if (pieces <= 0) return 0;
  return timeSeconds * (500 / pieces) ** exponent;
}

export function scalingInfo(exponent: number): {
  exponent: number;
  baselinePieces: 500;
  scalingTable: Record<number, { scalingFactor: number; example30min: number }>;
} {
  const scalingTable: Record<number, { scalingFactor: number; example30min: number }> = {};
  for (const pc of COMMON_PIECES) {
    const factor = (500 / pc) ** exponent;
    scalingTable[pc] = {
      scalingFactor: Math.round(factor * 1000) / 1000,
      example30min: Math.round(1800 * factor),
    };
  }
  return { exponent, baselinePieces: 500, scalingTable };
}
```

`web/src/lib/levels.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/__tests__/scaling.test.ts src/lib/__tests__/levels.test.ts` → all pass.

- [ ] **Step 5: Full suite, lint, typecheck, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: scaling and XP level math ported from legacy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Streaks + statistics (the big port)

**Files:**
- Create: `web/src/lib/streaks.ts`, `web/src/lib/stats.ts`
- Test: `web/src/lib/__tests__/streaks.test.ts`, `web/src/lib/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `SolveRow` shape (`typeof solves.$inferSelect`) — but these functions accept a minimal structural type so tests can pass plain objects.
- Produces:
  - `streakInfo(dates: string[], today: string): { current: number; longest: number }` — `dates` are YYYY-MM-DD, any order/dupes.
  - `computeStatistics(solves: StatSolve[], today: string): Statistics` where `StatSolve = { date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number; puzzleType: string; brand: string; difficultyRating: number; firstAttempt: boolean; isPersonalBest: boolean; communityAvgTime: number | null; playerRank: number | null }` and `Statistics` has EXACTLY the legacy keys (snake_case, matching the legacy JSON the UI consumes): `total_puzzles, total_time_hours, total_pieces, avg_scaled_time, median_scaled_time, best_scaled_time, worst_scaled_time, std_deviation, improvement_pct, current_streak, longest_streak, avg_pieces, favorite_piece_count, personal_bests (Record<number, number>), pace_trend, avg_pace, best_pace, this_week_count, this_month_count, this_year_count, fastest_solve, longest_solve, biggest_puzzle, brands_count, days_active, avg_difficulty, first_try_count, community: { has_data, compared_count, beat_avg_count, avg_vs_community_pct, best_vs_community_pct, best_rank, podiums, top10, ranked_count }`.

**Porting rules (copy of legacy semantics — implementer: follow these to the letter):**
- Performance metrics (scaled avg/median/stddev/improvement, personal_bests, favorite_piece_count, paces, pace_trend) use only `puzzleType === 'solo'` solves — **fall back to all solves if there are zero solo solves** (legacy `perf = [...] or puzzles`). Volume metrics (counts, hours, pieces, streaks, days_active, fastest/longest solve, biggest_puzzle, brands, difficulty, first_try, week/month/year counts) use ALL solves.
- Input MUST be ordered by `date ASC, id ASC` (callers guarantee it; document in the docstring).
- Median: sorted scaled times; odd n → middle; even n → mean of two middles. Stddev: population (divide by n).
- Improvement: `cc = min(5, max(1, floor(n/3)))`; `(firstAvg - lastAvg)/firstAvg * 100`, 0 if firstAvg <= 0. Round to 1 decimal.
- Streaks (in `streaks.ts`, reused by achievements): unique sorted dates; consecutive-day runs; `current` = length of the final run if the last date is within 1 day of `today` (today or yesterday), else 0; single date → current 1 if within 1 day. Longest starts at 1 for any non-empty set.
- pace_trend: needs ≥ 4 perf solves else `'Need more data'`; split scaled times in half at `mid = floor(n/2)`; second half avg `< first*0.95` → `'Improving'`, `> first*1.05` → `'Slowing'`, else `'Steady'`.
- this_week: Monday-start (`date >= monday of today's week`); this_month: `>= 1st`; this_year: `>= Jan 1`. Compute the boundary strings from the injected `today`.
- Rounding, matching legacy exactly: total_time_hours 1 decimal; avg/median/best/worst scaled and std_deviation → `Math.round`; avg_pieces → round; avg_pace/best_pace → 2 decimals; avg_difficulty → 1 decimal (0 if no ratings > 0); community percents → 1 decimal.
- Community block: entries with `communityAvgTime` set; `beat_avg_count` = solves strictly faster than community avg; pct diffs `(avg - mine)/avg*100` only when avg > 0; `best_rank` = min playerRank (0 if none); podiums rank ≤ 3; top10 rank ≤ 10.
- Empty input returns the exact legacy zero-object (all zeros, `personal_bests: {}`, `pace_trend: 'N/A'`, `community: { has_data: false }` with no other community keys).

- [ ] **Step 1: Write failing streak tests**

`web/src/lib/__tests__/streaks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { streakInfo } from '@/lib/streaks';

describe('streakInfo', () => {
  it('empty → 0/0', () => {
    expect(streakInfo([], '2026-07-07')).toEqual({ current: 0, longest: 0 });
  });
  it('single day today → current 1', () => {
    expect(streakInfo(['2026-07-07'], '2026-07-07')).toEqual({ current: 1, longest: 1 });
  });
  it('single day yesterday → current 1; older → 0', () => {
    expect(streakInfo(['2026-07-06'], '2026-07-07').current).toBe(1);
    expect(streakInfo(['2026-07-04'], '2026-07-07').current).toBe(0);
  });
  it('run ending yesterday counts as current', () => {
    expect(streakInfo(['2026-07-04', '2026-07-05', '2026-07-06'], '2026-07-07')).toEqual({ current: 3, longest: 3 });
  });
  it('broken run: longest kept, current reset', () => {
    expect(streakInfo(['2026-06-01', '2026-06-02', '2026-06-03', '2026-07-01'], '2026-07-07')).toEqual({ current: 0, longest: 3 });
  });
  it('dupes and disorder are tolerated', () => {
    expect(streakInfo(['2026-07-06', '2026-07-05', '2026-07-06'], '2026-07-06').current).toBe(2);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/streaks.ts`:

```ts
const DAY_MS = 86_400_000;
const toUTC = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Consecutive-day streaks over YYYY-MM-DD dates (dupes/disorder ok). Current counts only if the last date is today or yesterday relative to `today`. */
export function streakInfo(dates: string[], today: string): { current: number; longest: number } {
  const uniq = [...new Set(dates)].sort();
  if (uniq.length === 0) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (toUTC(uniq[i]) - toUTC(uniq[i - 1]) === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  const daysSinceLast = Math.round((toUTC(today) - toUTC(uniq[uniq.length - 1])) / DAY_MS);
  return { current: daysSinceLast <= 1 ? run : 0, longest };
}
```

Run streak tests → pass.

- [ ] **Step 3: Write failing stats tests**

`web/src/lib/__tests__/stats.test.ts` (fixture builder keeps cases readable):

```ts
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
```

- [ ] **Step 4: Run → FAIL**, then implement `web/src/lib/stats.ts`

```ts
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
```

Note: legacy counts `beat_avg` against any `community_avg_time` truthy value but divides only when `> 0`; using the `> 0` filter for both is the only divergence and it changes nothing for real data (times are positive).

- [ ] **Step 5: Run stats tests → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: statistics and streak engines ported from legacy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Settings service (with rescale side-effect)

**Files:**
- Create: `web/src/lib/settings-service.ts`
- Test: `web/src/lib/__tests__/settings-service.test.ts`

**Interfaces:**
- Consumes: `Db`, `settings`/`solves` tables, `calculateScaledTime`, `DEFAULT_SCALING_EXPONENT`.
- Produces: `getSettings(db, userId): Promise<Record<string, string>>`; `getScalingExponent(db, userId): Promise<number>` (default 0.4 when unset); `putSettings(db, userId, entries: Record<string, string>): Promise<void>` — upserts each key; when `scaling_exponent` is among them, recomputes `scaledTimeSeconds` for ALL the user's solves with the new exponent (legacy behavior).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { getSettings, getScalingExponent, putSettings } from '@/lib/settings-service';
import { solves } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('settings service', () => {
  it('defaults scaling exponent to 0.4 when unset', async () => {
    const { db, uid } = await seed();
    expect(await getScalingExponent(db, uid)).toBe(0.4);
    expect(await getSettings(db, uid)).toEqual({});
  });

  it('upserts settings (insert then overwrite)', async () => {
    const { db, uid } = await seed();
    await putSettings(db, uid, { scaling_exponent: '0.5', quick_add: '1' });
    expect(await getSettings(db, uid)).toEqual({ scaling_exponent: '0.5', quick_add: '1' });
    await putSettings(db, uid, { quick_add: '0' });
    expect((await getSettings(db, uid)).quick_add).toBe('0');
    expect(await getScalingExponent(db, uid)).toBe(0.5);
  });

  it('changing scaling_exponent rescales every existing solve', async () => {
    const { db, uid } = await seed();
    await db.insert(solves).values({
      userId: uid, date: '2026-07-01', pieces: 1000, timeSeconds: 3600, scaledTimeSeconds: 2728.29,
    });
    await putSettings(db, uid, { scaling_exponent: '0' });
    const [row] = await db.select().from(solves).where(eq(solves.userId, uid));
    expect(row.scaledTimeSeconds).toBe(3600); // exponent 0 → identity
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/settings-service.ts`:

```ts
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
```

- [ ] **Step 3: Run → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: settings service with scaling-exponent rescale

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Solves service (CRUD + personal bests + goal check)

**Files:**
- Create: `web/src/lib/solves.ts`
- Test: `web/src/lib/__tests__/solves.test.ts`

**Interfaces:**
- Consumes: `getScalingExponent` (Task 3), `calculateScaledTime`, tables `solves`/`goals`.
- Produces (all exported from `@/lib/solves`):
  - `type SolveRow = typeof solves.$inferSelect`
  - `solveInputSchema` (zod): `{ pieces: int > 0; time_seconds: int > 0; date?: YYYY-MM-DD (default today param); puzzle_name?: string; brand?: string; difficulty_rating?: int 1-5 (default 3); notes?: string; tags?: string; puzzle_type?: 'solo'|'duo'|'team' (default 'solo'); first_attempt?: boolean (default false) }`
  - `listSolves(db, userId, opts?: { pieces?: number; sort?: 'date'|'time'|'scaled'|'pieces'; order?: 'asc'|'desc' }): Promise<SolveRow[]>` — default `date desc`, id as tiebreaker in the same direction.
  - `listSolvesChrono(db, userId): Promise<SolveRow[]>` — `date ASC, id ASC` (the ordering `computeStatistics`/achievements need).
  - `addSolve(db, userId, input, today: string): Promise<{ solve: SolveRow; achievedGoalIds: number[] }>` — computes scaled time with the user's exponent, inserts, recomputes PBs, marks matching unachieved goals (same pieces, `time_seconds <= target`) achieved with `achievedDate = solve.date`, returns the fresh row (post-PB-update).
  - `updateSolve(db, userId, solveId, partialInput): Promise<SolveRow | null>` — null when not found/not owned; recomputes scaled + PBs.
  - `deleteSolve(db, userId, solveId): Promise<boolean>`; recomputes PBs.
  - `updatePersonalBests(db, userId): Promise<void>` — clears all flags, sets one per distinct solo piece count (min timeSeconds; earliest id wins ties).
  - `csvRows(solves: SolveRow[]): string[][]` — legacy export shape: header `['Date','Puzzle Name','Brand','Pieces','Time (seconds)','Time (formatted)','Scaled Time (500pc)','Difficulty','Notes','Tags']`, time formatted `h:mm:ss` (always with hours digit, e.g. `0:50:00`), scaled rounded.

Note: achievements checking is Task 5's `checkAchievements` — the API route (Task 7) calls it after `addSolve`; the service does not, to keep responsibilities separate.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { putSettings } from '@/lib/settings-service';
import { addSolve, listSolves, listSolvesChrono, updateSolve, deleteSolve, csvRows, solveInputSchema } from '@/lib/solves';
import { goals } from '@/db/schema';
import { eq } from 'drizzle-orm';

const TODAY = '2026-07-07';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('solveInputSchema', () => {
  it('applies defaults and validates', () => {
    const p = solveInputSchema.parse({ pieces: 500, time_seconds: 1800 });
    expect(p).toMatchObject({ difficulty_rating: 3, puzzle_type: 'solo', first_attempt: false });
    expect(solveInputSchema.safeParse({ pieces: 0, time_seconds: 10 }).success).toBe(false);
    expect(solveInputSchema.safeParse({ pieces: 500, time_seconds: 10, date: '07/01/2026' }).success).toBe(false);
    expect(solveInputSchema.safeParse({ pieces: 500, time_seconds: 10, puzzle_type: 'squad' }).success).toBe(false);
  });
});

describe('addSolve', () => {
  it('computes scaled time with the user exponent and defaults date to today', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, { pieces: 1000, time_seconds: 3600 }, TODAY);
    expect(solve.date).toBe(TODAY);
    expect(solve.scaledTimeSeconds).toBeCloseTo(2728.29, 1);
    expect(solve.isPersonalBest).toBe(true); // only solve at 1000pc
  });

  it('respects a changed exponent', async () => {
    const { db, uid } = await seed();
    await putSettings(db, uid, { scaling_exponent: '0' });
    const { solve } = await addSolve(db, uid, { pieces: 2000, time_seconds: 5000 }, TODAY);
    expect(solve.scaledTimeSeconds).toBe(5000);
  });

  it('PB flags: solo-only, per piece count, min time', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    const { solve: faster } = await addSolve(db, uid, { pieces: 500, time_seconds: 2500 }, TODAY);
    const { solve: duo } = await addSolve(db, uid, { pieces: 500, time_seconds: 100, puzzle_type: 'duo' }, TODAY);
    expect(faster.isPersonalBest).toBe(true);
    expect(duo.isPersonalBest).toBe(false);
    const all = await listSolvesChrono(db, uid);
    expect(all.filter((s) => s.isPersonalBest)).toHaveLength(1);
  });

  it('marks matching goals achieved', async () => {
    const { db, uid } = await seed();
    await db.insert(goals).values({ userId: uid, pieces: 500, targetTimeSeconds: 3000 });
    await db.insert(goals).values({ userId: uid, pieces: 1000, targetTimeSeconds: 3000 });
    const { achievedGoalIds } = await addSolve(db, uid, { pieces: 500, time_seconds: 2900 }, TODAY);
    expect(achievedGoalIds).toHaveLength(1);
    const rows = await db.select().from(goals).where(eq(goals.userId, uid));
    const achieved = rows.find((g) => g.pieces === 500)!;
    expect(achieved.achieved).toBe(true);
    expect(achieved.achievedDate).toBe(TODAY);
    expect(rows.find((g) => g.pieces === 1000)!.achieved).toBe(false);
  });
});

describe('listSolves', () => {
  it('filters by pieces and sorts by requested column', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: '2026-07-01' }, TODAY);
    await addSolve(db, uid, { pieces: 1000, time_seconds: 7000, date: '2026-07-02' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 2500, date: '2026-07-03' }, TODAY);
    expect((await listSolves(db, uid, { pieces: 500 }))).toHaveLength(2);
    const byTimeAsc = await listSolves(db, uid, { sort: 'time', order: 'asc' });
    expect(byTimeAsc.map((s) => s.timeSeconds)).toEqual([2500, 3000, 7000]);
    const defaultOrder = await listSolves(db, uid);
    expect(defaultOrder[0].date).toBe('2026-07-03'); // date desc default
  });
});

describe('update/delete', () => {
  it('updates recompute scaled time and PBs; ownership enforced', async () => {
    const { db, uid } = await seed();
    const other = await createUser(db, { username: 'sam', email: 's@x.com', password: 'longenough' });
    const { solve } = await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    expect(await updateSolve(db, other.id, solve.id, { time_seconds: 1 })).toBeNull();
    const updated = await updateSolve(db, uid, solve.id, { pieces: 1000 });
    expect(updated!.scaledTimeSeconds).toBeCloseTo(calc(3000), 1);
    function calc(t: number) { return t * (500 / 1000) ** 0.4; }
  });

  it('delete removes and returns false for foreign rows', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    expect(await deleteSolve(db, uid + 999, solve.id)).toBe(false);
    expect(await deleteSolve(db, uid, solve.id)).toBe(true);
    expect(await listSolvesChrono(db, uid)).toHaveLength(0);
  });
});

describe('csvRows', () => {
  it('produces the legacy export shape', async () => {
    const { db, uid } = await seed();
    const { solve } = await addSolve(db, uid, {
      pieces: 500, time_seconds: 3000, date: '2026-07-01', puzzle_name: 'Magic Garden',
      brand: 'Ravensburger', difficulty_rating: 4, notes: 'fun', tags: 'floral',
    }, TODAY);
    const rows = csvRows([solve]);
    expect(rows[0]).toEqual(['Date', 'Puzzle Name', 'Brand', 'Pieces', 'Time (seconds)', 'Time (formatted)', 'Scaled Time (500pc)', 'Difficulty', 'Notes', 'Tags']);
    expect(rows[1]).toEqual(['2026-07-01', 'Magic Garden', 'Ravensburger', '500', '3000', '0:50:00', '3000', '4', 'fun', 'floral']);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/solves.ts`:

```ts
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { solves, goals } from '@/db/schema';
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

const solveUpdateSchema = solveInputSchema.partial();

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
```

- [ ] **Step 3: Run → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: solves service with PBs, goal check, and CSV rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Achievements service

**Files:**
- Create: `web/src/lib/achievements-service.ts`
- Test: `web/src/lib/__tests__/achievements-service.test.ts`

**Interfaces:**
- Consumes: `streakInfo`, `listSolvesChrono`, `achievements` table.
- Produces:
  - `ACHIEVEMENT_DEFS: ReadonlyArray<{ code: string; name: string; description: string; icon: string }>` — the 19 legacy entries VERBATIM: `first_puzzle/First Piece/Complete your first puzzle/puzzle-piece`, `five_puzzles/Getting Started/Complete 5 puzzles/star`, `ten_puzzles/Dedicated/Complete 10 puzzles/fire`, `twentyfive_puzzles/Quarter Century/Complete 25 puzzles/trophy`, `fifty_puzzles/Half Century/Complete 50 puzzles/crown`, `hundred_puzzles/Centurion/Complete 100 puzzles/gem`, `speed_demon/Speed Demon/Complete a 500pc puzzle under 30 minutes/bolt`, `marathon/Marathon Runner/Complete a 2000+ piece puzzle/mountain`, `streak_3/Three-peat/Puzzle 3 days in a row/calendar`, `streak_7/Week Warrior/Puzzle 7 days in a row/flame`, `streak_30/Monthly Master/Puzzle 30 days in a row/rocket`, `improver/Getting Better/Improve your scaled time by 10%/chart-up`, `big_improver/Major Progress/Improve your scaled time by 25%/trending-up`, `variety/Variety Pack/Complete puzzles of 4+ different piece counts/grid`, `all_rounder/All Rounder/Complete puzzles of 6+ different piece counts/globe`, `night_owl/Consistent/Log puzzles on 10 different days/moon`, `pb_breaker/Record Breaker/Beat your personal best 3 times/medal`, `hour_club/10 Hour Club/Spend 10+ hours puzzling total/clock`, `day_club/24 Hour Club/Spend 24+ hours puzzling total/sun`.
  - `seedAchievements(db, userId): Promise<void>` — insert all defs `onConflictDoNothing` (idempotent).
  - `listAchievements(db, userId): Promise<AchievementRow[]>` — seeds first, then returns ordered `unlocked DESC, id ASC`.
  - `checkAchievements(db, userId, today: string): Promise<string[]>` — seeds, evaluates every check against the user's solves (chrono order), unlocks any newly-earned (sets `unlockedDate = today`), returns the codes newly unlocked THIS call (for UI confetti).

**Check semantics (legacy, exact):** counts thresholds 1/5/10/25/50/100; `speed_demon`: any solve `pieces === 500 && timeSeconds < 1800`; `marathon`: `pieces >= 2000`; streaks use LONGEST streak ≥ 3/7/30; improvement: only when total ≥ 3, `cc = min(5, max(1, floor(total/3)))` over ALL solves' scaled times (chrono), ≥10% / ≥25%; `variety`/`all_rounder`: distinct piece counts ≥4/≥6; `night_owl`: distinct dates ≥ 10; `pb_breaker`: current PB-flag count ≥ 3; `hour_club`/`day_club`: total timeSeconds ≥ 36000/86400. No achievement is ever re-locked.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';
import { ACHIEVEMENT_DEFS, listAchievements, checkAchievements } from '@/lib/achievements-service';

const TODAY = '2026-07-07';

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('achievements', () => {
  it('has the 19 legacy definitions', () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(19);
    expect(ACHIEVEMENT_DEFS[0]).toEqual({ code: 'first_puzzle', name: 'First Piece', description: 'Complete your first puzzle', icon: 'puzzle-piece' });
  });

  it('listAchievements seeds idempotently', async () => {
    const { db, uid } = await seed();
    expect(await listAchievements(db, uid)).toHaveLength(19);
    expect(await listAchievements(db, uid)).toHaveLength(19);
  });

  it('first solve unlocks first_puzzle only once', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000 }, TODAY);
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('first_puzzle');
    expect(await checkAchievements(db, uid, TODAY)).toEqual([]); // second call: nothing new
    const rows = await listAchievements(db, uid);
    expect(rows.find((a) => a.code === 'first_puzzle')!.unlockedDate).toBe(TODAY);
  });

  it('speed_demon requires 500pc under 30min', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 1799 }, TODAY);
    expect(await checkAchievements(db, uid, TODAY)).toContain('speed_demon');
  });

  it('streak_3 uses longest streak', async () => {
    const { db, uid } = await seed();
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: d }, TODAY);
    }
    expect(await checkAchievements(db, uid, TODAY)).toContain('streak_3');
  });

  it('improver unlocks at >=10% scaled-time improvement (total >= 3)', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 500, time_seconds: 4000, date: '2026-06-01' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 3500, date: '2026-06-02' }, TODAY);
    await addSolve(db, uid, { pieces: 500, time_seconds: 3000, date: '2026-06-03' }, TODAY);
    // cc = 1: first 4000 → last 3000 = 25% improvement → improver AND big_improver
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('improver');
    expect(newly).toContain('big_improver');
  });

  it('hour_club at 10+ hours total', async () => {
    const { db, uid } = await seed();
    await addSolve(db, uid, { pieces: 2000, time_seconds: 36_000 }, TODAY);
    const newly = await checkAchievements(db, uid, TODAY);
    expect(newly).toContain('hour_club');
    expect(newly).toContain('marathon');
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/achievements-service.ts`:

```ts
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
```

- [ ] **Step 3: Run → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: achievements service with 19 legacy achievements

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Charts + goals services

**Files:**
- Create: `web/src/lib/charts.ts`, `web/src/lib/goals-service.ts`
- Test: `web/src/lib/__tests__/charts.test.ts`, `web/src/lib/__tests__/goals-service.test.ts`

**Interfaces:**
- Consumes: `listSolvesChrono`, `SolveRow`, tables.
- Produces:
  - `trendData(solves: SolveRow[]): { solves: SolveRow[]; moving_avg_5: number[]; moving_avg_10: number[] }` — trailing-window means over scaledTimeSeconds (window = last 5/10 including current, shorter at the start).
  - `pieceBreakdown(solves: SolveRow[]): Record<number, { count: number; average: number; best: number; worst: number }>` (average rounded).
  - `paceData(solves: SolveRow[]): Array<{ date: string; pace: number; pieces: number; id: number }>` (pace = time/pieces, 2 decimals).
  - `weeklyData(solves: SolveRow[]): Array<{ week: string; count: number; total_time: number; avg_scaled: number; best_scaled: number; total_pieces: number }>` — Monday-start ISO weeks, sorted ascending; avg/best rounded.
  - `listGoals(db, userId)` ordered `createdAt DESC, id DESC`; `addGoal(db, userId, { pieces: int>0; target_time_seconds: int>0; description?: string })` (zod `goalInputSchema`); `deleteGoal(db, userId, goalId): Promise<boolean>`.

- [ ] **Step 1: Write failing tests**

`charts.test.ts` (pure functions; build rows with a helper):

```ts
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
```

`goals-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { listGoals, addGoal, deleteGoal, goalInputSchema } from '@/lib/goals-service';

describe('goals service', () => {
  it('add/list/delete with ownership', async () => {
    const db = await makeTestDb();
    const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    const other = await createUser(db, { username: 'sam', email: 's@x.com', password: 'longenough' });
    await addGoal(db, u.id, { pieces: 500, target_time_seconds: 3000, description: 'sub-50min' });
    const goals = await listGoals(db, u.id);
    expect(goals).toHaveLength(1);
    expect(goals[0].achieved).toBe(false);
    expect(await deleteGoal(db, other.id, goals[0].id)).toBe(false);
    expect(await deleteGoal(db, u.id, goals[0].id)).toBe(true);
  });
  it('validates input', () => {
    expect(goalInputSchema.safeParse({ pieces: 0, target_time_seconds: 100 }).success).toBe(false);
    expect(goalInputSchema.safeParse({ pieces: 500, target_time_seconds: 100 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement.

`web/src/lib/charts.ts`:

```ts
import type { SolveRow } from './solves';

function movingAvg(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Input must be chrono-ordered (date ASC, id ASC) — same contract as computeStatistics. */
export function trendData(rows: SolveRow[]) {
  const scaled = rows.map((p) => p.scaledTimeSeconds);
  return { solves: rows, moving_avg_5: movingAvg(scaled, 5), moving_avg_10: movingAvg(scaled, 10) };
}

export function pieceBreakdown(rows: SolveRow[]): Record<number, { count: number; average: number; best: number; worst: number }> {
  const acc = new Map<number, number[]>();
  for (const p of rows) {
    if (!acc.has(p.pieces)) acc.set(p.pieces, []);
    acc.get(p.pieces)!.push(p.timeSeconds);
  }
  const out: Record<number, { count: number; average: number; best: number; worst: number }> = {};
  for (const [pc, times] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
    out[pc] = {
      count: times.length,
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      best: Math.min(...times),
      worst: Math.max(...times),
    };
  }
  return out;
}

export function paceData(rows: SolveRow[]) {
  return rows.map((p) => ({
    date: p.date,
    pace: Math.round((p.timeSeconds / p.pieces) * 100) / 100,
    pieces: p.pieces,
    id: p.id,
  }));
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

export function weeklyData(rows: SolveRow[]) {
  const weeks = new Map<string, { count: number; total_time: number; scaled: number[]; pieces: number }>();
  for (const p of rows) {
    const wk = mondayOf(p.date);
    if (!weeks.has(wk)) weeks.set(wk, { count: 0, total_time: 0, scaled: [], pieces: 0 });
    const w = weeks.get(wk)!;
    w.count++;
    w.total_time += p.timeSeconds;
    w.scaled.push(p.scaledTimeSeconds);
    w.pieces += p.pieces;
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, w]) => ({
      week,
      count: w.count,
      total_time: w.total_time,
      avg_scaled: Math.round(w.scaled.reduce((a, b) => a + b, 0) / w.scaled.length),
      best_scaled: Math.round(Math.min(...w.scaled)),
      total_pieces: w.pieces,
    }));
}
```

`web/src/lib/goals-service.ts`:

```ts
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
```

- [ ] **Step 3: Run → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: chart aggregations and goals service

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: myspeedpuzzling import service

**Files:**
- Create: `web/src/lib/import-speedpuzzling.ts`
- Test: `web/src/lib/__tests__/import-speedpuzzling.test.ts`

**Interfaces:**
- Consumes: `getScalingExponent`, `calculateScaledTime`, `updatePersonalBests`, `checkAchievements`, `solves` table.
- Produces: `importSpeedpuzzling(db, userId, payload: unknown, today: string): Promise<{ imported: number; duplicates: number; skipped_type: number; invalid: number; total: number }>`.

**Legacy semantics (exact):** payload is either an array of records or `{ records, include_types }` (default `['solo']`). Per record: `type` lowercased defaults `'solo'`; skip (skipped_type) if not in include_types. `pieces_count`/`seconds_to_solve` must parse to positive ints else invalid. Date = first 10 chars of `finished_at` else `tracked_at` else `today`. Dedupe: `result_id` seen in existing `sourceId`s, OR `(date, pieces, seconds)` already present → duplicates. Insert with `source: 'speedpuzzling'`, community fields from `puzzle_average_time`/`puzzle_fastest_time`/`player_rank`/`puzzle_total_solved`, `first_attempt` truthiness. Per-record failures count invalid, never abort the batch. After any imports: `updatePersonalBests` + `checkAchievements`. In-batch dedupe too (a repeated record within one payload counts duplicate).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { importSpeedpuzzling } from '@/lib/import-speedpuzzling';
import { listSolvesChrono } from '@/lib/solves';
import { listAchievements } from '@/lib/achievements-service';

const TODAY = '2026-07-07';
const REC = (over: Record<string, unknown> = {}) => ({
  result_id: 'r1', type: 'solo', pieces_count: 500, seconds_to_solve: 3000,
  finished_at: '2026-06-01T10:00:00Z', puzzle_name: 'Magic Garden', brand_name: 'Ravensburger',
  first_attempt: true, puzzle_average_time: 4000, puzzle_fastest_time: 2000,
  player_rank: 5, puzzle_total_solved: 120, ...over,
});

async function seed() {
  const db = await makeTestDb();
  const u = await createUser(db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
  return { db, uid: u.id };
}

describe('importSpeedpuzzling', () => {
  it('imports records with community fields and unlocks achievements', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, [REC()], TODAY);
    expect(res).toEqual({ imported: 1, duplicates: 0, skipped_type: 0, invalid: 0, total: 1 });
    const [s] = await listSolvesChrono(db, uid);
    expect(s).toMatchObject({
      date: '2026-06-01', pieces: 500, timeSeconds: 3000, source: 'speedpuzzling', sourceId: 'r1',
      communityAvgTime: 4000, communityBestTime: 2000, playerRank: 5, communitySolvers: 120,
      firstAttempt: true, isPersonalBest: true,
    });
    const ach = await listAchievements(db, uid);
    expect(ach.find((a) => a.code === 'first_puzzle')!.unlocked).toBe(true);
  });

  it('is idempotent by result_id and by (date,pieces,seconds) fallback', async () => {
    const { db, uid } = await seed();
    await importSpeedpuzzling(db, uid, [REC()], TODAY);
    const again = await importSpeedpuzzling(db, uid, [REC()], TODAY);
    expect(again.duplicates).toBe(1);
    const noId = await importSpeedpuzzling(db, uid, [REC({ result_id: null })], TODAY);
    expect(noId.duplicates).toBe(1); // same (date,pieces,seconds)
  });

  it('filters types and counts invalid records', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, {
      records: [
        REC({ result_id: 'a' }),
        REC({ result_id: 'b', type: 'duo' }),
        REC({ result_id: 'c', pieces_count: 'nope' }),
      ],
      include_types: ['solo'],
    }, TODAY);
    expect(res).toMatchObject({ imported: 1, skipped_type: 1, invalid: 1, total: 3 });
  });

  it('include_types can admit duo, and in-batch repeats count as duplicates', async () => {
    const { db, uid } = await seed();
    const res = await importSpeedpuzzling(db, uid, {
      records: [REC({ result_id: 'x', type: 'duo' }), REC({ result_id: 'x', type: 'duo' })],
      include_types: ['solo', 'duo'],
    }, TODAY);
    expect(res).toMatchObject({ imported: 1, duplicates: 1 });
  });

  it('falls back to today when no dates present', async () => {
    const { db, uid } = await seed();
    await importSpeedpuzzling(db, uid, [REC({ finished_at: null, tracked_at: null, result_id: 'z' })], TODAY);
    const [s] = await listSolvesChrono(db, uid);
    expect(s.date).toBe(TODAY);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `web/src/lib/import-speedpuzzling.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { solves } from '@/db/schema';
import { calculateScaledTime } from './scaling';
import { getScalingExponent } from './settings-service';
import { updatePersonalBests } from './solves';
import { checkAchievements } from './achievements-service';

type Rec = Record<string, unknown>;

const toInt = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export interface ImportResult {
  imported: number;
  duplicates: number;
  skipped_type: number;
  invalid: number;
  total: number;
}

/** Bulk-import a myspeedpuzzling JSON export. Dedupe by result_id, falling back to (date, pieces, seconds). */
export async function importSpeedpuzzling(db: Db, userId: number, payload: unknown, today: string): Promise<ImportResult> {
  let records: Rec[];
  let includeTypes: Set<string>;
  if (Array.isArray(payload)) {
    records = payload as Rec[];
    includeTypes = new Set(['solo']);
  } else if (payload && typeof payload === 'object') {
    const p = payload as { records?: Rec[]; include_types?: string[] };
    records = p.records ?? [];
    includeTypes = new Set(p.include_types?.length ? p.include_types : ['solo']);
  } else {
    records = [];
    includeTypes = new Set(['solo']);
  }

  const exponent = await getScalingExponent(db, userId);
  const existing = await db
    .select({ sourceId: solves.sourceId, date: solves.date, pieces: solves.pieces, timeSeconds: solves.timeSeconds })
    .from(solves)
    .where(eq(solves.userId, userId));
  const existingSource = new Set(existing.map((r) => r.sourceId).filter(Boolean) as string[]);
  const existingKey = new Set(existing.map((r) => `${r.date}|${r.pieces}|${r.timeSeconds}`));

  let imported = 0, duplicates = 0, skippedType = 0, invalid = 0;

  for (const rec of records) {
    try {
      const ptype = String(rec.type ?? 'solo').toLowerCase();
      if (!includeTypes.has(ptype)) { skippedType++; continue; }
      const pieces = toInt(rec.pieces_count);
      const secs = toInt(rec.seconds_to_solve);
      if (!pieces || pieces <= 0 || !secs || secs <= 0) { invalid++; continue; }

      const rawDate = String(rec.finished_at ?? rec.tracked_at ?? '').slice(0, 10);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
      const sid = rec.result_id != null ? String(rec.result_id) : null;
      const key = `${date}|${pieces}|${secs}`;

      if ((sid && existingSource.has(sid)) || existingKey.has(key)) { duplicates++; continue; }

      await db.insert(solves).values({
        userId,
        date,
        pieces,
        timeSeconds: secs,
        scaledTimeSeconds: calculateScaledTime(secs, pieces, exponent),
        puzzleName: String(rec.puzzle_name ?? ''),
        brand: String(rec.brand_name ?? ''),
        sourceId: sid,
        source: 'speedpuzzling',
        puzzleType: ptype,
        communityAvgTime: toInt(rec.puzzle_average_time),
        communityBestTime: toInt(rec.puzzle_fastest_time),
        playerRank: toInt(rec.player_rank),
        communitySolvers: toInt(rec.puzzle_total_solved),
        firstAttempt: Boolean(rec.first_attempt),
      });
      if (sid) existingSource.add(sid);
      existingKey.add(key);
      imported++;
    } catch {
      invalid++;
    }
  }

  if (imported > 0) {
    await updatePersonalBests(db, userId);
    await checkAchievements(db, userId, today);
  }
  return { imported, duplicates, skipped_type: skippedType, invalid, total: records.length };
}
```

- [ ] **Step 3: Run → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: myspeedpuzzling import service with idempotent dedupe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: API routes — solves, statistics, settings, scaling-info

**Files:**
- Create: `web/src/lib/api-auth.ts`, `web/src/app/api/solves/route.ts`, `web/src/app/api/solves/[id]/route.ts`, `web/src/app/api/statistics/route.ts`, `web/src/app/api/settings/route.ts`, `web/src/app/api/scaling-info/route.ts`
- Test: `web/src/app/api/__tests__/solves.test.ts`, `web/src/app/api/__tests__/statistics.test.ts`

**Interfaces:**
- Consumes: Tasks 1-7 services; `auth()`.
- Produces:
  - `requireUserId(): Promise<number | NextResponse>` from `@/lib/api-auth` — 401 envelope identical to `/api/me/theme`.
  - `todayISO(): string` from `@/lib/api-auth` — `new Date().toISOString().slice(0, 10)`; routes pass it into services (services stay clock-free).
  - `GET /api/solves?pieces=&sort=&order=` → SolveRow[] (JSON, drizzle camelCase fields — Plan 2B consumes camelCase).
  - `POST /api/solves` body = solveInputSchema JSON → 201 `{ solve, achievedGoalIds, newAchievements: string[], isPersonalBest: boolean }` (route calls `addSolve` then `checkAchievements`; `isPersonalBest` = the fresh row's flag).
  - `PUT /api/solves/:id` → 200 solve | 404; `DELETE /api/solves/:id` → 200 `{status:'ok'}` | 404.
  - `GET /api/statistics` → `computeStatistics(chrono solves, today)`.
  - `GET /api/settings` → Record<string,string>; `PUT /api/settings` body Record<string, string|number> → `{status:'ok'}` (values coerced to strings).
  - `GET /api/scaling-info` → `scalingInfo(userExponent)` — key `scaling_table` etc. in snake_case: `{ exponent, baseline_pieces, scaling_table }` (map from the camelCase service return at the route edge).
- Invalid body → 400 `{error: <first zod message>}`; invalid `:id` (non-integer) → 404.

- [ ] **Step 1: Write failing route tests**

`web/src/app/api/__tests__/solves.test.ts` (same mock pattern as `theme.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET, POST } from '@/app/api/solves/route';
import { PUT, DELETE } from '@/app/api/solves/[id]/route';

const post = (body: unknown) =>
  POST(new Request('http://t/api/solves', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
const get = (qs = '') => GET(new Request(`http://t/api/solves${qs}`));
const put = (id: string, body: unknown) =>
  PUT(new Request(`http://t/api/solves/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
const del = (id: string) =>
  DELETE(new Request(`http://t/api/solves/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

describe('/api/solves', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('401 when logged out', async () => {
    state.session = null;
    expect((await get()).status).toBe(401);
    expect((await post({ pieces: 500, time_seconds: 100 })).status).toBe(401);
  });

  it('POST creates a solve and reports achievements + PB', async () => {
    const res = await post({ pieces: 500, time_seconds: 1700 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.solve.pieces).toBe(500);
    expect(body.isPersonalBest).toBe(true);
    expect(body.newAchievements).toContain('first_puzzle');
    expect(body.newAchievements).toContain('speed_demon');
  });

  it('POST validates (400 with message)', async () => {
    expect((await post({ pieces: -1, time_seconds: 100 })).status).toBe(400);
  });

  it('GET lists with filter and sort', async () => {
    await post({ pieces: 500, time_seconds: 3000, date: '2026-07-01' });
    await post({ pieces: 1000, time_seconds: 7000, date: '2026-07-02' });
    const filtered = await (await get('?pieces=500')).json();
    expect(filtered).toHaveLength(1);
    const sorted = await (await get('?sort=time&order=asc')).json();
    expect(sorted[0].timeSeconds).toBe(3000);
  });

  it('PUT updates own solve; 404 on foreign/missing', async () => {
    const created = (await (await post({ pieces: 500, time_seconds: 3000 })).json()).solve;
    const ok = await put(String(created.id), { time_seconds: 2500 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).timeSeconds).toBe(2500);
    expect((await put('999999', { time_seconds: 1 })).status).toBe(404);
    expect((await put('abc', { time_seconds: 1 })).status).toBe(404);
  });

  it('DELETE removes; 404 on missing', async () => {
    const created = (await (await post({ pieces: 500, time_seconds: 3000 })).json()).solve;
    expect((await del(String(created.id))).status).toBe(200);
    expect((await del(String(created.id))).status).toBe(404);
  });
});
```

`web/src/app/api/__tests__/statistics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET as getStats } from '@/app/api/statistics/route';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as getScalingInfo } from '@/app/api/scaling-info/route';

describe('/api/statistics, /api/settings, /api/scaling-info', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
  });

  it('statistics reflects solves', async () => {
    await addSolve(state.db!, Number(state.session!.user.id), { pieces: 500, time_seconds: 3000 }, '2026-07-07');
    const body = await (await getStats(new Request('http://t/api/statistics'))).json();
    expect(body.total_puzzles).toBe(1);
    expect(body.personal_bests['500']).toBe(3000);
  });

  it('settings round-trip; scaling_exponent PUT rescales and scaling-info reflects it', async () => {
    await addSolve(state.db!, Number(state.session!.user.id), { pieces: 1000, time_seconds: 3600 }, '2026-07-07');
    const putRes = await putSettings(new Request('http://t/api/settings', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scaling_exponent: 0 }),
    }));
    expect(putRes.status).toBe(200);
    expect(await (await getSettings(new Request('http://t/api/settings'))).json()).toEqual({ scaling_exponent: '0' });
    const info = await (await getScalingInfo(new Request('http://t/api/scaling-info'))).json();
    expect(info.exponent).toBe(0);
    expect(info.baseline_pieces).toBe(500);
    expect(info.scaling_table['1000'].scaling_factor).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement.

`web/src/lib/api-auth.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/** Session gate for API routes: returns the numeric user id, or the 401 response to return as-is. */
export async function requireUserId(): Promise<number | NextResponse> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isInteger(userId)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return userId;
}

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
```

`web/src/app/api/solves/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { addSolve, listSolves } from '@/lib/solves';
import { checkAchievements } from '@/lib/achievements-service';

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const url = new URL(req.url);
  const piecesRaw = url.searchParams.get('pieces');
  const sortRaw = url.searchParams.get('sort');
  const orderRaw = url.searchParams.get('order');
  const sort = (['date', 'time', 'scaled', 'pieces'] as const).find((s) => s === sortRaw);
  const rows = await listSolves(getDb(), userId, {
    pieces: piecesRaw ? Number(piecesRaw) : undefined,
    sort,
    order: orderRaw === 'asc' ? 'asc' : 'desc',
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const body = await req.json().catch(() => null);
  try {
    const today = todayISO();
    const { solve, achievedGoalIds } = await addSolve(getDb(), userId, body, today);
    const newAchievements = await checkAchievements(getDb(), userId, today);
    return NextResponse.json(
      { solve, achievedGoalIds, newAchievements, isPersonalBest: solve.isPersonalBest },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}
```

`web/src/app/api/solves/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { updateSolve, deleteSolve } from '@/lib/solves';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = parseId((await ctx.params).id);
  if (id == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  try {
    const updated = await updateSolve(getDb(), userId, id, body ?? {});
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = parseId((await ctx.params).id);
  if (id == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteSolve(getDb(), userId, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ status: 'ok' });
}
```

`web/src/app/api/statistics/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { listSolvesChrono } from '@/lib/solves';
import { computeStatistics } from '@/lib/stats';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const rows = await listSolvesChrono(getDb(), userId);
  return NextResponse.json(computeStatistics(rows, todayISO()));
}
```

`web/src/app/api/settings/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { getSettings, putSettings } from '@/lib/settings-service';

const putSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await getSettings(getDb(), userId));
}

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
  await putSettings(getDb(), userId, Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, String(v)]),
  ));
  return NextResponse.json({ status: 'ok' });
}
```

`web/src/app/api/scaling-info/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { getScalingExponent } from '@/lib/settings-service';
import { scalingInfo } from '@/lib/scaling';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const info = scalingInfo(await getScalingExponent(getDb(), userId));
  return NextResponse.json({
    exponent: info.exponent,
    baseline_pieces: info.baselinePieces,
    scaling_table: Object.fromEntries(
      Object.entries(info.scalingTable).map(([pc, v]) => [
        pc,
        { scaling_factor: v.scalingFactor, example_30min: v.example30min },
      ]),
    ),
  });
}
```

- [ ] **Step 3: Run → pass. Full gate incl. build, commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: solves, statistics, settings, scaling-info API routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: API routes — charts, goals, achievements, export, import

**Files:**
- Create: `web/src/app/api/charts/[kind]/route.ts`, `web/src/app/api/goals/route.ts`, `web/src/app/api/goals/[id]/route.ts`, `web/src/app/api/achievements/route.ts`, `web/src/app/api/export/csv/route.ts`, `web/src/app/api/import/speedpuzzling/route.ts`
- Test: `web/src/app/api/__tests__/charts-goals-import.test.ts`

**Interfaces:**
- Consumes: Tasks 5-7 services + `requireUserId`/`todayISO` + `csvRows`.
- Produces:
  - `GET /api/charts/trend|piece-breakdown|pace|weekly` → the Task 6 aggregations over chrono solves; unknown kind → 404.
  - `GET /api/goals` → GoalRow[]; `POST /api/goals` → 201 goal | 400; `DELETE /api/goals/:id` → `{status:'ok'}` | 404.
  - `GET /api/achievements` → seeded AchievementRow[] ordered unlocked-first.
  - `GET /api/export/csv` → `text/csv` attachment `puzzle_times.csv`; fields quoted when containing `"`/`,`/newline (RFC-4180-style: embedded quotes doubled).
  - `POST /api/import/speedpuzzling` → ImportResult JSON.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '@/db/test-db';
import { createUser } from '@/lib/users';
import { addSolve } from '@/lib/solves';

const state: {
  db: Awaited<ReturnType<typeof makeTestDb>> | null;
  session: { user: { id: string } } | null;
} = { db: null, session: null };

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => state.db!,
}));
vi.mock('@/auth', () => ({ auth: async () => state.session }));

import { GET as getChart } from '@/app/api/charts/[kind]/route';
import { GET as getGoals, POST as postGoal } from '@/app/api/goals/route';
import { DELETE as deleteGoal } from '@/app/api/goals/[id]/route';
import { GET as getAchievements } from '@/app/api/achievements/route';
import { GET as getCsv } from '@/app/api/export/csv/route';
import { POST as postImport } from '@/app/api/import/speedpuzzling/route';

const chart = (kind: string) =>
  getChart(new Request(`http://t/api/charts/${kind}`), { params: Promise.resolve({ kind }) });

describe('charts/goals/achievements/export/import routes', () => {
  beforeEach(async () => {
    state.db = await makeTestDb();
    const u = await createUser(state.db, { username: 'maya', email: 'm@x.com', password: 'longenough' });
    state.session = { user: { id: String(u.id) } };
    await addSolve(state.db, u.id, { pieces: 500, time_seconds: 3000, date: '2026-07-01', puzzle_name: 'A, "quoted"' }, '2026-07-07');
    await addSolve(state.db, u.id, { pieces: 500, time_seconds: 2500, date: '2026-07-02' }, '2026-07-07');
  });

  it('trend chart returns solves + moving averages', async () => {
    const body = await (await chart('trend')).json();
    expect(body.solves).toHaveLength(2);
    expect(body.moving_avg_5).toHaveLength(2);
  });

  it('piece-breakdown, pace, weekly work; unknown kind 404', async () => {
    expect((await (await chart('piece-breakdown')).json())['500'].count).toBe(2);
    expect(await (await chart('pace')).json()).toHaveLength(2);
    expect((await (await chart('weekly')).json())[0].count).toBe(2);
    expect((await chart('nope')).status).toBe(404);
  });

  it('goals CRUD over HTTP', async () => {
    const created = await postGoal(new Request('http://t/api/goals', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pieces: 500, target_time_seconds: 2000 }),
    }));
    expect(created.status).toBe(201);
    const goals = await (await getGoals(new Request('http://t/api/goals'))).json();
    expect(goals).toHaveLength(1);
    const delRes = await deleteGoal(new Request(`http://t/api/goals/${goals[0].id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(goals[0].id) }) });
    expect(delRes.status).toBe(200);
  });

  it('achievements listing is seeded and ordered', async () => {
    const list = await (await getAchievements(new Request('http://t/api/achievements'))).json();
    expect(list).toHaveLength(19);
  });

  it('CSV export quotes embedded commas/quotes and sets attachment headers', async () => {
    const res = await getCsv(new Request('http://t/api/export/csv'));
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('puzzle_times.csv');
    const text = await res.text();
    expect(text.split('\n')[0]).toContain('Scaled Time (500pc)');
    expect(text).toContain('"A, ""quoted"""');
  });

  it('import route delegates and reports counts', async () => {
    const res = await postImport(new Request('http://t/api/import/speedpuzzling', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ result_id: 'r9', pieces_count: 500, seconds_to_solve: 1400, finished_at: '2026-06-30T00:00:00Z' }]),
    }));
    expect(await res.json()).toMatchObject({ imported: 1, total: 1 });
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement.

`web/src/app/api/charts/[kind]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listSolvesChrono } from '@/lib/solves';
import { trendData, pieceBreakdown, paceData, weeklyData } from '@/lib/charts';

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { kind } = await ctx.params;
  const rows = await listSolvesChrono(getDb(), userId);
  switch (kind) {
    case 'trend': return NextResponse.json(trendData(rows));
    case 'piece-breakdown': return NextResponse.json(pieceBreakdown(rows));
    case 'pace': return NextResponse.json(paceData(rows));
    case 'weekly': return NextResponse.json(weeklyData(rows));
    default: return NextResponse.json({ error: 'Unknown chart' }, { status: 404 });
  }
}
```

`web/src/app/api/goals/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listGoals, addGoal } from '@/lib/goals-service';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await listGoals(getDb(), userId));
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  try {
    const goal = await addGoal(getDb(), userId, await req.json().catch(() => null));
    return NextResponse.json(goal, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    throw e;
  }
}
```

`web/src/app/api/goals/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { deleteGoal } from '@/lib/goals-service';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ok = await deleteGoal(getDb(), userId, id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ status: 'ok' });
}
```

`web/src/app/api/achievements/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listAchievements } from '@/lib/achievements-service';

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json(await listAchievements(getDb(), userId));
}
```

`web/src/app/api/export/csv/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId } from '@/lib/api-auth';
import { listSolvesChrono, csvRows } from '@/lib/solves';

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export async function GET(_req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const rows = csvRows(await listSolvesChrono(getDb(), userId));
  const body = rows.map((r) => r.map(cell).join(',')).join('\n');
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename=puzzle_times.csv',
    },
  });
}
```

`web/src/app/api/import/speedpuzzling/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUserId, todayISO } from '@/lib/api-auth';
import { importSpeedpuzzling } from '@/lib/import-speedpuzzling';

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const payload = await req.json().catch(() => null);
  if (payload == null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  return NextResponse.json(await importSpeedpuzzling(getDb(), userId, payload, todayISO()));
}
```

- [ ] **Step 3: Run → pass. Full gate incl. build, commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: charts, goals, achievements, CSV export, import API routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Regression gate — e2e still green

**Files:** none new (verification-only task; fixes allowed if the gate fails).

- [ ] **Step 1: Full local gate**

```bash
cd web && npm test && npm run lint && npx tsc --noEmit && npm run build
```

- [ ] **Step 2: e2e against dockerized Postgres**

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
sleep 5
DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks npx drizzle-kit migrate
npm run e2e
docker stop pg-e2e
```

Expected: 2/2 e2e pass (no UI changed in this plan; this catches route-collision/build regressions).

- [ ] **Step 3: Commit anything the gate forced you to fix; otherwise no commit.**

---

## Self-review notes

- **Spec coverage (Plan-2A slice):** scaled-time system with tunable exponent + preview ✅ (T1, T3, T8); stats ✅ (T2, T8); PBs ✅ (T4); goals ✅ (T6, T9, check-in-addSolve T4); achievements/XP ✅ (T5, T1); charts ✅ (T6, T9); CSV export ✅ (T4, T9); myspeedpuzzling import ✅ (T7, T9). Deliberately Plan 2B: all UI (log/history/dashboard/analytics/goals/awards/settings-extensions), client CSV-import parsing (legacy parses CSV client-side and POSTs rows — 2B reuses `POST /api/solves`), confetti/motivation/fun-stats rendering. Deliberately Plan 3: timer, PWA, migration, cutover.
- **Type consistency:** `SolveRow` defined once (T4) and imported by charts/import/tests; `Statistics` snake_case keys consumed by 2B; `requireUserId` pattern uniform across all routes; `today` always injected into services.
- **No placeholders:** every step carries complete code and exact commands.
