# Puzzle Geeks Revamp — Plan 2B of 3: Core UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight placeholder pages with the real product — logging (quick + full), history with filters/edit/import, a live dashboard (stats, XP, motivation, fun stats, confetti), analytics charts, goals, achievements, and settings (scaling slider with preview) — all consuming Plan 2A's APIs.

**Architecture:** Pure display logic (motivation picker, fun-stat builder, chart transforms, CSV parsing) lives in `web/src/lib/` with unit tests. Pages are client components fetching Plan 2A routes via a tiny `api-client`. Charts use Recharts wrapped in one `ChartCard` frame that applies theme-aware, **validated** chart color tokens (added to `globals.css` per theme). Confetti is a self-contained canvas component with a module-level `fireConfetti()`.

**Tech Stack:** Plan-1/2A stack + `recharts` (only new runtime dep).

**Legacy source of truth:** `static/app.js` — formulas/copy below are ports and must match.

## Global Constraints

- All work under `web/`. npm; TS strict; NO Tailwind/CSS-in-JS (plain CSS files; brief-specified inline style objects allowed).
- Product name in UI copy: **Puzzle Geeks**. Durations render via `formatDuration` from `@/lib/time`; time inputs parse via `parseDuration` (accepts `h:mm:ss`, `m:ss`, bare minutes).
- API field names: solves are camelCase (`timeSeconds`, `scaledTimeSeconds`, `puzzleName`, `isPersonalBest`…); statistics are snake_case (`total_puzzles`, `avg_scaled_time`, `personal_bests`, `community.has_data`…). Do not rename.
- Chart color tokens (validated with the dataviz palette validator — do not alter): midnight `--chart-1:#2ea043 --chart-2:#4184e4 --chart-3:#d47616 --chart-4:#986ee2 --chart-5:#ab8a12`; cozy `--chart-1:#1a7f37 --chart-2:#2a6fd6 --chart-3:#b35900 --chart-4:#7d4ec2 --chart-5:#8a6d00`.
- Chart rules (non-negotiable): one y-axis per chart (never dual-axis); categorical hues in fixed slot order (never cycled); series identity never color-alone (legend for ≥2 series, none for 1 — the card title names it); text/labels use text tokens (`var(--text-muted)`), never series colors; grid/axes recessive (`var(--border)`); tooltips on hover for every plot; >6 pie slices fold into "Other" (neutral `var(--text-muted)`).
- Every task: full `npm test` + `npm run lint` + `npx tsc --noEmit` clean before commit; tasks touching pages also run `npm run build`.
- Commits conventional, ending: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure (end state)

```
web/src/lib/
  format.ts            # fmtDate, fmtDateFull, pct
  motivation.ts        # MOTIVATIONS, getMotivation(stats, rand)
  fun-stats.ts         # funStatItems(stats)
  chart-transforms.ts  # distributionBins, improvementSeries, foldPieSlices
  parse-csv.ts         # parseCSVRow, parseCsvSolves
  api-client.ts        # getJSON/postJSON/putJSON/deleteJSON
web/src/components/
  Confetti.tsx         # canvas + fireConfetti()
  Toast.tsx            # useToast provider + <Toasts/>
  StatCard.tsx
  SolveForm.tsx        # shared by Log full-form and History edit modal
  charts/ChartCard.tsx # Recharts frame: theme tokens, grid, tooltip styling
  forms.css            # shared field styles for (app) pages
web/src/app/(app)/
  log/page.tsx + QuickAdd.tsx
  history/page.tsx + ImportPanel.tsx + history.css
  dashboard/page.tsx + dashboard.css
  analytics/page.tsx
  goals/page.tsx
  awards/page.tsx + awards.css
  settings/page.tsx    # extended: scaling slider + preview
web/e2e/core-flows.spec.ts
```

---

### Task 1: Pure display logic (TDD)

**Files:**
- Create: `web/src/lib/format.ts`, `web/src/lib/motivation.ts`, `web/src/lib/fun-stats.ts`, `web/src/lib/chart-transforms.ts`, `web/src/lib/parse-csv.ts`
- Test: `web/src/lib/__tests__/motivation.test.ts`, `web/src/lib/__tests__/fun-stats.test.ts`, `web/src/lib/__tests__/chart-transforms.test.ts`, `web/src/lib/__tests__/parse-csv.test.ts`

**Interfaces:**
- Consumes: `Statistics` type from `@/lib/stats`.
- Produces:
  - `fmtDate(d: string): string` (`'2026-07-01'` → `'Jul 1'`), `fmtDateFull` (→ `'Jul 1, 2026'`), `pct(n: number): string` (`+12.5%`/`-3%` style: sign always shown, trailing `.0` dropped).
  - `getMotivation(stats, rand?: () => number): { emoji: string; msg: string }` — legacy priority: no puzzles → new_user; `current_streak >= 3` → streak (fills `{streak}`); `improvement_pct > 5` → improving (fills `{imp}` rounded); `total_puzzles >= 5` → lots (fills `{total}`, `{pieces}` localized, `{hours}`); else general. `rand` defaults to `Math.random`; tests inject.
  - `funStatItems(stats): Array<{ icon: string; text: string; val: string }>` — legacy items in order: Speed rank (avg scaled minutes ≤15 Lightning, ≤25 Speedster, ≤40 Swift, ≤60 Steady, ≤90 Patient, else Beginner), Pieces placed (localized), Could have watched (`round(hours/2)` movies, only ≥1h and >0 movies, singular/plural), Longest streak (`N day(s)`), Favorite size (`{pc}pc`), Fastest pace (`{n}s/piece`), Fastest solve / Longest solve (`formatDuration`), First-try solves, Biggest conquered (`{n}pc` localized), Consistency (CV = std/avg: <0.15 Metronome, <0.3 Steady, <0.5 Variable, else Wild card), Brands explored. Skip items whose stat is falsy (legacy behavior).
  - `distributionBins(scaledSeconds: number[]): Array<{ label: string; count: number }>` — legacy: minutes = `round(s/60)`; binSize = `max(1, round((max-min)/8))`; bins from `floor(min/bs)*bs` step bs through max; label `` `${b}-${b+bs}m` ``; empty input → [].
  - `improvementSeries(scaledSeconds: number[]): number[]` — `< 2` values → []; else `round1((base - v)/base*100)` per solve vs first solve.
  - `foldPieSlices(entries: Array<{ label: string; value: number }>, max = 6)` — top max-1 by value + `Other` summing the rest (only when entries.length > max).
  - `parseCSVRow(line: string): string[]` — handles quoted fields with embedded commas and doubled quotes.
  - `parseCsvSolves(text: string, today: string): { entries: CsvEntry[]; errors: number }` where `CsvEntry = { date: string; pieces: number; time_seconds: number; puzzle_name: string; brand: string; difficulty_rating: number; notes: string; tags: string; valid: boolean }` — legacy header sniffing: case-insensitive header row; date col = first containing `date` (fallback col 0); pieces = containing `piece` or `=== 'pcs'` (fallback 1); time = containing `time` but not `scaled` (fallback 2); name = `name`/`puzzle` (fallback 3); brand (4); `diff`/`rating` (5, default 3); `note` (6); `tag` (7). Time parsed with `parseDuration` **except** bare numbers are SECONDS if the header cell contains `second`, else minutes (via parseDuration). Non-ISO dates go through `new Date(...)`; invalid → `today`. `valid = pieces > 0 && time_seconds > 0`. Rows with <2 cells are skipped entirely.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/__tests__/motivation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getMotivation } from '@/lib/motivation';

const first = () => 0; // rand injector: always pick the first message

describe('getMotivation', () => {
  it('new user', () => {
    expect(getMotivation({ total_puzzles: 0 }, first).msg).toContain('Log your first puzzle');
  });
  it('streak beats improvement', () => {
    const m = getMotivation({ total_puzzles: 10, current_streak: 4, improvement_pct: 50 }, first);
    expect(m.msg).toBe("You're on fire! 4-day streak going strong. Keep it alive!");
  });
  it('improvement fills rounded pct', () => {
    const m = getMotivation({ total_puzzles: 10, current_streak: 0, improvement_pct: 12.6 }, first);
    expect(m.msg).toContain('13%');
  });
  it('lots-of-puzzles localizes pieces', () => {
    const m = getMotivation({ total_puzzles: 6, total_pieces: 12345, total_time_hours: 9, current_streak: 0, improvement_pct: 0 }, first);
    expect(m.msg).toBe("6 puzzles completed! That's 12,345 pieces you've conquered.");
  });
  it('falls through to general tips', () => {
    const m = getMotivation({ total_puzzles: 2, current_streak: 0, improvement_pct: 0 }, first);
    expect(m.msg).toContain('Consistent practice');
  });
});
```

`web/src/lib/__tests__/fun-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { funStatItems } from '@/lib/fun-stats';

const base = {
  total_puzzles: 10, avg_scaled_time: 20 * 60, total_pieces: 5000, total_time_hours: 6,
  longest_streak: 4, favorite_piece_count: 500, best_pace: 3.2, fastest_solve: 754,
  longest_solve: 7200, first_try_count: 2, biggest_puzzle: 2000, std_deviation: 100,
  brands_count: 3,
};

describe('funStatItems', () => {
  it('empty for zero puzzles', () => {
    expect(funStatItems({ total_puzzles: 0 })).toEqual([]);
  });
  it('speed rank thresholds', () => {
    expect(funStatItems({ ...base, avg_scaled_time: 15 * 60 })[0].val).toBe('Lightning');
    expect(funStatItems({ ...base, avg_scaled_time: 26 * 60 })[0].val).toBe('Swift');
    expect(funStatItems({ ...base, avg_scaled_time: 95 * 60 })[0].val).toBe('Beginner');
  });
  it('movies = round(hours/2), pluralized', () => {
    const items = funStatItems(base);
    expect(items.find((i) => i.text === 'Could have watched')!.val).toBe('3 movies');
  });
  it('consistency from CV', () => {
    const items = funStatItems({ ...base, std_deviation: 100, avg_scaled_time: 1000 });
    expect(items.find((i) => i.text === 'Consistency')!.val).toBe('Metronome'); // CV 0.1
  });
  it('fastest solve formatted', () => {
    expect(funStatItems(base).find((i) => i.text === 'Fastest solve')!.val).toBe('12:34');
  });
});
```

`web/src/lib/__tests__/chart-transforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { distributionBins, improvementSeries, foldPieSlices } from '@/lib/chart-transforms';

describe('distributionBins', () => {
  it('bins scaled minutes into ~8 buckets (legacy algorithm)', () => {
    const secs = [10, 20, 30, 40, 50, 60, 70, 80].map((m) => m * 60);
    const bins = distributionBins(secs);
    // min 10, max 80 → bs = round(70/8) = 9; first bin floor(10/9)*9 = 9
    expect(bins[0].label).toBe('9-18m');
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(8);
  });
  it('single value → one bin of width 1', () => {
    expect(distributionBins([30 * 60])).toEqual([{ label: '30-31m', count: 1 }]);
  });
  it('empty → []', () => {
    expect(distributionBins([])).toEqual([]);
  });
});

describe('improvementSeries', () => {
  it('percent vs first solve, 1 decimal', () => {
    expect(improvementSeries([4000, 3000, 4400])).toEqual([0, 25, -10]);
  });
  it('fewer than 2 → []', () => {
    expect(improvementSeries([4000])).toEqual([]);
  });
});

describe('foldPieSlices', () => {
  it('passes through when within max', () => {
    const entries = [{ label: '500pc', value: 3 }, { label: '1000pc', value: 2 }];
    expect(foldPieSlices(entries)).toEqual(entries);
  });
  it('folds the tail into Other beyond max', () => {
    const entries = [9, 8, 7, 6, 5, 4, 3, 2].map((v, i) => ({ label: `${i}`, value: v }));
    const folded = foldPieSlices(entries, 6);
    expect(folded).toHaveLength(6);
    expect(folded[5]).toEqual({ label: 'Other', value: 4 + 3 + 2 });
  });
});
```

`web/src/lib/__tests__/parse-csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCSVRow, parseCsvSolves } from '@/lib/parse-csv';

const TODAY = '2026-07-08';

describe('parseCSVRow', () => {
  it('splits simple rows and quoted fields', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(parseCSVRow('a,"b, with comma","say ""hi"""')).toEqual(['a', 'b, with comma', 'say "hi"']);
  });
});

describe('parseCsvSolves', () => {
  it('parses our own export format (bare numbers are seconds when header says seconds)', () => {
    const text = [
      'Date,Puzzle Name,Brand,Pieces,Time (seconds),Time (formatted),Scaled Time (500pc),Difficulty,Notes,Tags',
      '2026-07-01,Magic Garden,Ravensburger,500,3000,0:50:00,3000,4,fun,floral',
    ].join('\n');
    const { entries, errors } = parseCsvSolves(text, TODAY);
    expect(errors).toBe(0);
    expect(entries[0]).toMatchObject({
      date: '2026-07-01', pieces: 500, time_seconds: 3000, puzzle_name: 'Magic Garden',
      brand: 'Ravensburger', difficulty_rating: 4, notes: 'fun', tags: 'floral', valid: true,
    });
  });
  it('parses generic CSVs: h:mm:ss times, US dates, missing columns', () => {
    const text = ['date,pieces,time', '07/02/2026,1000,1:30:00'].join('\n');
    const { entries } = parseCsvSolves(text, TODAY);
    expect(entries[0]).toMatchObject({ date: '2026-07-02', pieces: 1000, time_seconds: 5400, difficulty_rating: 3, valid: true });
  });
  it('bare-number time without seconds header is minutes', () => {
    const { entries } = parseCsvSolves(['date,pieces,time', '2026-07-01,500,45'].join('\n'), TODAY);
    expect(entries[0].time_seconds).toBe(2700);
  });
  it('flags invalid rows and counts errors; unparseable dates fall back to today', () => {
    const { entries, errors } = parseCsvSolves(['date,pieces,time', 'not-a-date,zero,abc'].join('\n'), TODAY);
    expect(errors).toBe(1);
    expect(entries[0].valid).toBe(false);
    expect(entries[0].date).toBe(TODAY);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/__tests__/motivation.test.ts src/lib/__tests__/fun-stats.test.ts src/lib/__tests__/chart-transforms.test.ts src/lib/__tests__/parse-csv.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

`web/src/lib/format.ts`:

```ts
export function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateFull(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** +12.5% / -3% — sign always, trailing .0 dropped. */
export function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return `${r > 0 ? '+' : ''}${s}%`;
}
```

`web/src/lib/motivation.ts`:

```ts
type Msg = { emoji: string; msg: string };

export const MOTIVATIONS: Record<string, Msg[]> = {
  new_user: [
    { emoji: '🏆', msg: 'Welcome to Puzzle Geeks! Log your first puzzle to start tracking.' },
    { emoji: '🚀', msg: 'Ready to track your puzzling journey? Start by logging a session!' },
  ],
  streak_active: [
    { emoji: '🔥', msg: "You're on fire! {streak}-day streak going strong. Keep it alive!" },
    { emoji: '⚡', msg: "{streak} days straight! You're becoming a puzzle machine!" },
    { emoji: '🌟', msg: 'Day {streak} of your streak! Consistency is the secret sauce.' },
  ],
  improving: [
    { emoji: '📈', msg: "You've improved {imp}% from your early sessions. The grind pays off!" },
    { emoji: '🎉', msg: 'Getting faster! {imp}% improvement since you started. Keep pushing!' },
  ],
  lots_of_puzzles: [
    { emoji: '🧩', msg: "{total} puzzles completed! That's {pieces} pieces you've conquered." },
    { emoji: '💪', msg: "You've spent {hours}h puzzling. That's dedication!" },
  ],
  general: [
    { emoji: '🤔', msg: 'Tip: Consistent practice matters more than marathon sessions.' },
    { emoji: '💡', msg: 'Pro tip: Sort edge pieces first, then group by color/pattern.' },
    { emoji: '🎨', msg: 'Challenge yourself: Try a puzzle with an unusual color palette!' },
    { emoji: '⏰', msg: 'Speed puzzling secret: Look at the box less, trust your pattern recognition.' },
    { emoji: '🚀', msg: "The best puzzlers aren't fast at first. They're fast because they don't stop." },
  ],
};

interface MotivationStats {
  total_puzzles?: number;
  current_streak?: number;
  improvement_pct?: number;
  total_pieces?: number;
  total_time_hours?: number;
}

export function getMotivation(stats: MotivationStats, rand: () => number = Math.random): Msg {
  const pick = (arr: Msg[]) => arr[Math.floor(rand() * arr.length)];
  if (!stats.total_puzzles) return pick(MOTIVATIONS.new_user);
  if ((stats.current_streak ?? 0) >= 3) {
    const m = pick(MOTIVATIONS.streak_active);
    return { emoji: m.emoji, msg: m.msg.replace('{streak}', String(stats.current_streak)) };
  }
  if ((stats.improvement_pct ?? 0) > 5) {
    const m = pick(MOTIVATIONS.improving);
    return { emoji: m.emoji, msg: m.msg.replace('{imp}', String(Math.round(stats.improvement_pct!))) };
  }
  if ((stats.total_puzzles ?? 0) >= 5) {
    const m = pick(MOTIVATIONS.lots_of_puzzles);
    return {
      emoji: m.emoji,
      msg: m.msg
        .replace('{total}', String(stats.total_puzzles))
        .replace('{pieces}', (stats.total_pieces ?? 0).toLocaleString('en-US'))
        .replace('{hours}', String(stats.total_time_hours ?? 0)),
    };
  }
  return pick(MOTIVATIONS.general);
}
```

`web/src/lib/fun-stats.ts`:

```ts
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
```

`web/src/lib/chart-transforms.ts`:

```ts
/** Legacy renderDist(): scaled seconds → minute histogram with ~8 buckets. */
export function distributionBins(scaledSeconds: number[]): Array<{ label: string; count: number }> {
  if (scaledSeconds.length === 0) return [];
  const mins = scaledSeconds.map((s) => Math.round(s / 60));
  const mn = Math.min(...mins);
  const mx = Math.max(...mins);
  const bs = Math.max(1, Math.round((mx - mn) / 8));
  const bins = new Map<number, number>();
  for (let b = Math.floor(mn / bs) * bs; b <= mx; b += bs) bins.set(b, 0);
  for (const t of mins) {
    const b = Math.floor(t / bs) * bs;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].map(([b, count]) => ({ label: `${b}-${b + bs}m`, count }));
}

/** Legacy renderImprovement(): % improvement vs first solve, 1 decimal. */
export function improvementSeries(scaledSeconds: number[]): number[] {
  if (scaledSeconds.length < 2) return [];
  const base = scaledSeconds[0];
  return scaledSeconds.map((v) => Math.round(((base - v) / base) * 1000) / 10);
}

/** Keep at most `max` slices; the tail becomes "Other". */
export function foldPieSlices(
  entries: Array<{ label: string; value: number }>,
  max = 6,
): Array<{ label: string; value: number }> {
  if (entries.length <= max) return entries;
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, max - 1);
  const other = sorted.slice(max - 1).reduce((a, e) => a + e.value, 0);
  return [...kept, { label: 'Other', value: other }];
}
```

`web/src/lib/parse-csv.ts`:

```ts
import { parseDuration } from './time';

export interface CsvEntry {
  date: string; pieces: number; time_seconds: number; puzzle_name: string;
  brand: string; difficulty_rating: number; notes: string; tags: string; valid: boolean;
}

/** One CSV row → cells; supports quoted fields with embedded commas and doubled quotes. */
export function parseCSVRow(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

/** Port of legacy handleCSVFile() header sniffing + row mapping. */
export function parseCsvSolves(text: string, today: string): { entries: CsvEntry[]; errors: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { entries: [], errors: 0 };

  const header = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h.includes('date'));
  const piecesIdx = header.findIndex((h) => h.includes('piece') || h === 'pcs');
  const timeIdx = header.findIndex((h) => h.includes('time') && !h.includes('scaled'));
  const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('puzzle'));
  const brandIdx = header.findIndex((h) => h.includes('brand'));
  const diffIdx = header.findIndex((h) => h.includes('diff') || h.includes('rating'));
  const notesIdx = header.findIndex((h) => h.includes('note'));
  const tagsIdx = header.findIndex((h) => h.includes('tag'));
  const timeIsSeconds = timeIdx >= 0 && header[timeIdx].includes('second');

  const col = (row: string[], idx: number, fallbackIdx: number, dflt = '') => {
    const i = idx >= 0 ? idx : fallbackIdx;
    return i < row.length ? row[i].trim() : dflt;
  };

  const entries: CsvEntry[] = [];
  let errors = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 2) continue;

    const rawDate = col(row, dateIdx, 0);
    let date = rawDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      const d = new Date(rawDate);
      date = !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : today;
    }

    const pieces = parseInt(col(row, piecesIdx, 1), 10);
    const rawTime = col(row, timeIdx, 2);
    const timeSeconds = timeIsSeconds && /^\d+$/.test(rawTime)
      ? parseInt(rawTime, 10)
      : parseDuration(rawTime) ?? NaN;

    const entry: CsvEntry = {
      date,
      pieces,
      time_seconds: timeSeconds,
      puzzle_name: col(row, nameIdx, 3),
      brand: col(row, brandIdx, 4),
      difficulty_rating: parseInt(col(row, diffIdx, 5, '3'), 10) || 3,
      notes: col(row, notesIdx, 6),
      tags: col(row, tagsIdx, 7),
      valid: Number.isFinite(pieces) && pieces > 0 && Number.isFinite(timeSeconds) && timeSeconds > 0,
    };
    if (!entry.valid) errors++;
    entries.push(entry);
  }
  return { entries, errors };
}
```

- [ ] **Step 4: Run tests → pass. Full gate, commit**

```bash
npm test && npm run lint && npx tsc --noEmit
cd .. && git add web && git commit -m "feat: motivation, fun stats, chart transforms, CSV parsing (legacy ports)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: UI infrastructure — recharts, tokens, api-client, Confetti, Toast, shared components

**Files:**
- Create: `web/src/lib/api-client.ts`, `web/src/components/Confetti.tsx`, `web/src/components/Toast.tsx`, `web/src/components/StatCard.tsx`, `web/src/components/forms.css`, `web/src/components/charts/ChartCard.tsx`
- Modify: `web/src/app/globals.css` (append chart tokens), `web/src/app/(app)/layout.tsx` (mount Confetti + Toast providers)

**Interfaces:**
- Produces:
  - `getJSON<T>(url): Promise<T>`, `postJSON<T>(url, body): Promise<T>`, `putJSON<T>(url, body): Promise<T>`, `deleteJSON(url): Promise<void>` — non-2xx throws `ApiError` with `.message` from the body's `error` when present.
  - `fireConfetti(durationMs = 3000): void` (no-op server-side) + `<ConfettiCanvas />` mounted once in the app layout.
  - `useToast(): { toast: (msg: string, kind?: 'ok' | 'error') => void }` + `<ToastProvider>` wrapping the app layout; toasts self-dismiss after 3.5s.
  - `<StatCard label value sub? accent? />` display card.
  - `<ChartCard title tag? height?>{recharts}</ChartCard>` — renders `.card` with `.card-head`, fixed-height responsive container.
  - CSS: `.field`, `.field label`, `.field input/select/textarea`, `.btn`, `.btn-primary`, `.btn-danger`, `.form-grid` in `forms.css`; chart tokens in `globals.css`.

- [ ] **Step 1: Install recharts**

```bash
cd web && npm i recharts
```

- [ ] **Step 2: Chart tokens (validated palettes — copy exactly)**

Append to `web/src/app/globals.css`:

```css
/* ---------- Chart tokens (validated: dataviz six-checks, per theme surface) ---------- */
:root,
[data-theme='midnight'] {
  --chart-1: #2ea043; /* fixed slot order — never cycle or reassign per chart */
  --chart-2: #4184e4;
  --chart-3: #d47616;
  --chart-4: #986ee2;
  --chart-5: #ab8a12;
  --chart-grid: var(--border);
}

[data-theme='cozy'] {
  --chart-1: #1a7f37;
  --chart-2: #2a6fd6;
  --chart-3: #b35900;
  --chart-4: #7d4ec2;
  --chart-5: #8a6d00;
  --chart-grid: var(--border);
}
```

- [ ] **Step 3: api-client**

`web/src/lib/api-client.ts`:

```ts
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const getJSON = <T>(url: string) => request<T>(url);
export const postJSON = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const putJSON = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const deleteJSON = (url: string) => request<void>(url, { method: 'DELETE' });
```

- [ ] **Step 4: Confetti (legacy canvas port)**

`web/src/components/Confetti.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';

let fire: ((durationMs: number) => void) | null = null;

/** Fire the celebration confetti (no-op if the canvas isn't mounted / on server). */
export function fireConfetti(durationMs = 3000): void {
  fire?.(durationMs);
}

const COLORS = ['#2ea043', '#4184e4', '#d47616', '#986ee2', '#ab8a12', '#e5534b'];

interface Piece {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  spin: number; vspin: number; color: string; opacity: number;
}

export function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let pieces: Piece[] = [];
    let active = false;
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    fire = (duration: number) => {
      const started = performance.now();
      active = true;
      for (let i = 0; i < 140; i++) {
        pieces.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height * 0.3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          vx: -1.5 + Math.random() * 3,
          vy: 2 + Math.random() * 3.5,
          spin: Math.random() * 360,
          vspin: -6 + Math.random() * 12,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          opacity: 1,
        });
      }
      const animate = (now: number) => {
        if (!active) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const elapsed = now - started;
        pieces = pieces.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.spin += p.vspin;
          if (elapsed > duration * 0.7) p.opacity -= 0.02;
          if (p.y > canvas.height + 20 || p.opacity <= 0) return false;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.spin * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
          return true;
        });
        if (pieces.length > 0 && elapsed < duration + 3000) raf = requestAnimationFrame(animate);
        else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          active = false;
          pieces = [];
        }
      };
      raf = requestAnimationFrame(animate);
    };

    return () => {
      fire = null;
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}
    />
  );
}
```

- [ ] **Step 5: Toast**

`web/src/components/Toast.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'ok' | 'error';
interface ToastItem { id: number; msg: string; kind: Kind }

const ToastContext = createContext<{ toast: (msg: string, kind?: Kind) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = nextId.current++;
    setItems((cur) => [...cur, { id, msg, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" style={{ position: 'fixed', bottom: 80, right: 16, zIndex: 90, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              background: 'var(--bg-raised)', color: t.kind === 'error' ? 'var(--danger)' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px',
              boxShadow: 'var(--shadow)', maxWidth: 340, fontSize: '0.9rem',
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 6: StatCard, ChartCard, forms.css; mount providers**

`web/src/components/StatCard.tsx`:

```tsx
export function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      {sub ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{sub}</div> : null}
    </div>
  );
}
```

`web/src/components/charts/ChartCard.tsx`:

```tsx
'use client';

import { ResponsiveContainer } from 'recharts';

export function ChartCard({ title, tag, height = 260, children }: {
  title: string; tag?: string; height?: number; children: React.ReactElement;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: '1rem' }}>{title}</h3>
        {tag ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tag}</span> : null}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/** Shared recessive axis/grid/tooltip props (dataviz: grid/axes recessive, labels wear text tokens). */
export const AXIS = { stroke: 'var(--chart-grid)', tick: { fill: 'var(--text-muted)', fontSize: 11 }, tickLine: false } as const;
export const GRID = { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false } as const;
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', fontSize: 12,
  },
  labelStyle: { color: 'var(--text-muted)' },
  cursor: { stroke: 'var(--chart-grid)' },
} as const;
```

`web/src/components/forms.css`:

```css
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.field label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
.field input, .field select, .field textarea {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit;
}
.field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.field .hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; }
.btn {
  padding: 10px 18px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-raised); color: var(--text); font: inherit; font-weight: 600; cursor: pointer;
}
.btn:hover { border-color: var(--accent); }
.btn-primary { background: var(--accent); color: var(--accent-contrast); border-color: transparent; }
.btn-primary:disabled { opacity: 0.6; cursor: wait; }
.btn-danger { color: var(--danger); }
```

Modify `web/src/app/(app)/layout.tsx` — wrap children:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { ConfettiCanvas } from '@/components/Confetti';
import '@/components/forms.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <ToastProvider>
      <div className="shell">
        <Sidebar username={session.user.username} />
        <main className="shell-main">{children}</main>
      </div>
      <ConfettiCanvas />
    </ToastProvider>
  );
}
```

- [ ] **Step 7: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: chart tokens, api client, confetti, toasts, shared UI primitives

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Log page (quick add + full form)

**Files:**
- Create: `web/src/components/SolveForm.tsx`, `web/src/app/(app)/log/QuickAdd.tsx`
- Modify: `web/src/app/(app)/log/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `postJSON`, `parseDuration`, `formatDuration`, `fireConfetti`, `useToast`.
- Produces: `<SolveForm initial? submitLabel onSubmit(values) busy?>` — shared with History's edit modal (Task 4). `values = { pieces: number; time_seconds: number; date: string; puzzle_name: string; brand: string; difficulty_rating: number; notes: string; tags: string; puzzle_type: 'solo'|'duo'|'team'; first_attempt: boolean }`.
- POST response handling (both forms): `{ solve, newAchievements, isPersonalBest }` → toast "Logged {pieces}pc in {formatDuration}"; if `isPersonalBest` also toast "New personal best! 🎉"; `fireConfetti()` when `isPersonalBest || newAchievements.length > 0`.

- [ ] **Step 1: SolveForm**

`web/src/components/SolveForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { parseDuration, formatDuration } from '@/lib/time';

export interface SolveFormValues {
  pieces: number; time_seconds: number; date: string; puzzle_name: string; brand: string;
  difficulty_rating: number; notes: string; tags: string;
  puzzle_type: 'solo' | 'duo' | 'team'; first_attempt: boolean;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SolveForm({ initial, submitLabel, onSubmit, busy }: {
  initial?: Partial<SolveFormValues>;
  submitLabel: string;
  onSubmit: (values: SolveFormValues) => Promise<void> | void;
  busy?: boolean;
}) {
  const [timeText, setTimeText] = useState(initial?.time_seconds ? formatDuration(initial.time_seconds) : '');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const time = parseDuration(timeText);
    const pieces = Number(f.get('pieces'));
    if (time == null || time <= 0) return setError('Time must look like 1:42:07, 42:07, or minutes (90).');
    if (!Number.isInteger(pieces) || pieces <= 0) return setError('Pieces must be a positive number.');
    await onSubmit({
      pieces,
      time_seconds: time,
      date: String(f.get('date') || todayLocal()),
      puzzle_name: String(f.get('puzzle_name') ?? ''),
      brand: String(f.get('brand') ?? ''),
      difficulty_rating: Number(f.get('difficulty_rating') ?? 3),
      notes: String(f.get('notes') ?? ''),
      tags: String(f.get('tags') ?? ''),
      puzzle_type: (f.get('puzzle_type') as SolveFormValues['puzzle_type']) ?? 'solo',
      first_attempt: f.get('first_attempt') === 'on',
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sf-pieces">Pieces *</label>
          <input id="sf-pieces" name="pieces" type="number" min={1} required defaultValue={initial?.pieces ?? 500} />
        </div>
        <div className="field">
          <label htmlFor="sf-time">Time *</label>
          <input id="sf-time" value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="1:42:07" required />
          <div className="hint">h:mm:ss, m:ss, or minutes</div>
        </div>
        <div className="field">
          <label htmlFor="sf-date">Date</label>
          <input id="sf-date" name="date" type="date" defaultValue={initial?.date ?? todayLocal()} />
        </div>
        <div className="field">
          <label htmlFor="sf-name">Puzzle name</label>
          <input id="sf-name" name="puzzle_name" defaultValue={initial?.puzzle_name ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sf-brand">Brand</label>
          <input id="sf-brand" name="brand" defaultValue={initial?.brand ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sf-diff">Difficulty</label>
          <select id="sf-diff" name="difficulty_rating" defaultValue={initial?.difficulty_rating ?? 3}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sf-type">Session type</label>
          <select id="sf-type" name="puzzle_type" defaultValue={initial?.puzzle_type ?? 'solo'}>
            <option value="solo">Solo</option>
            <option value="duo">Duo</option>
            <option value="team">Team</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sf-tags">Tags</label>
          <input id="sf-tags" name="tags" defaultValue={initial?.tags ?? ''} placeholder="gradient, disney" />
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="sf-notes">Notes</label>
        <textarea id="sf-notes" name="notes" rows={2} defaultValue={initial?.notes ?? ''} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0', fontSize: '0.9rem' }}>
        <input type="checkbox" name="first_attempt" defaultChecked={initial?.first_attempt ?? false} />
        First attempt at this puzzle
      </label>
      {error ? <p role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p> : null}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
```

- [ ] **Step 2: QuickAdd + page**

`web/src/app/(app)/log/QuickAdd.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { parseDuration } from '@/lib/time';

const PIECE_PRESETS = [100, 300, 500, 750, 1000, 1500, 2000];

export function QuickAdd({ onLog, busy }: {
  onLog: (values: { pieces: number; time_seconds: number }) => Promise<void> | void;
  busy?: boolean;
}) {
  const [pieces, setPieces] = useState(500);
  const [timeText, setTimeText] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const time = parseDuration(timeText);
    if (time == null || time <= 0) return setError('Time must look like 1:42:07, 42:07, or minutes.');
    await onLog({ pieces, time_seconds: time });
    setTimeText('');
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }} role="radiogroup" aria-label="Piece count">
        {PIECE_PRESETS.map((pc) => (
          <button
            key={pc} type="button" role="radio" aria-checked={pieces === pc}
            className="btn" onClick={() => setPieces(pc)}
            style={pieces === pc ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {pc}
          </button>
        ))}
        <input
          aria-label="Custom piece count" type="number" min={1} placeholder="custom"
          style={{ width: 100, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' }}
          onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPieces(v); }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          aria-label="Time" value={timeText} onChange={(e) => setTimeText(e.target.value)}
          placeholder="1:42:07" required
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' }}
        />
        <button className="btn btn-primary" disabled={busy}>{busy ? '…' : `Log ${pieces}pc`}</button>
      </div>
      {error ? <p role="alert" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p> : null}
    </form>
  );
}
```

Replace `web/src/app/(app)/log/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { postJSON, ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/time';
import { fireConfetti } from '@/components/Confetti';
import { useToast } from '@/components/Toast';
import { SolveForm, type SolveFormValues } from '@/components/SolveForm';
import { QuickAdd } from './QuickAdd';

interface LogResponse {
  solve: { id: number; pieces: number; timeSeconds: number };
  newAchievements: string[];
  isPersonalBest: boolean;
}

export default function LogPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const [busy, setBusy] = useState(false);

  async function log(values: Partial<SolveFormValues> & { pieces: number; time_seconds: number }) {
    setBusy(true);
    try {
      const res = await postJSON<LogResponse>('/api/solves', values);
      toast(`Logged ${res.solve.pieces}pc in ${formatDuration(res.solve.timeSeconds)}`);
      if (res.isPersonalBest) toast('New personal best! 🎉');
      if (res.newAchievements.length > 0) toast(`Achievement unlocked: ${res.newAchievements.length}`);
      if (res.isPersonalBest || res.newAchievements.length > 0) fireConfetti();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to log solve', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Log Puzzle</h1>
          <p className="desc">Record a completed session</p>
        </div>
        <button className="btn" onClick={() => setMode(mode === 'quick' ? 'full' : 'quick')}>
          {mode === 'quick' ? 'Full form' : 'Quick add'}
        </button>
      </div>
      <div className="card">
        {mode === 'quick'
          ? <QuickAdd onLog={log} busy={busy} />
          : <SolveForm submitLabel="Log puzzle" onSubmit={log} busy={busy} />}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: log page with quick add and full form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: History page (table, filter/sort, edit, delete, export, import panel)

**Files:**
- Create: `web/src/app/(app)/history/ImportPanel.tsx`, `web/src/app/(app)/history/history.css`
- Modify: `web/src/app/(app)/history/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `getJSON/putJSON/deleteJSON/postJSON`, `SolveForm`, `parseCsvSolves`, `formatDuration`, `fmtDateFull`, `useToast`.
- Produces: the History screen —
  - Table columns: Date (`fmtDateFull`), Puzzle (name + brand small), Pieces, Time (`formatDuration`), Scaled (`formatDuration(round(scaled))`), ★Difficulty, PB badge (`PB` chip when `isPersonalBest`), type chip when not solo, row actions Edit/Delete.
  - Controls row: piece-count filter (`<select>` built from distinct pieces in the data, `All` default), sort select (`date/time/scaled/pieces`), order toggle, Export CSV link (`<a href="/api/export/csv" download>`), Import button toggling the panel.
  - Edit = modal overlay hosting `SolveForm` with `initial` values, PUT on submit, list refresh. Delete = `confirm()` then DELETE + refresh.
  - `ImportPanel`: file input + drag-drop for `.json` (myspeedpuzzling → `POST /api/import/speedpuzzling` with `{records, include_types}` checkboxes solo/duo/team, solo pre-checked) and `.csv` (parsed client-side with `parseCsvSolves`, preview count + errors, then sequential `POST /api/solves` for valid rows). Reports result via toast + `onDone()` refresh callback.

- [ ] **Step 1: history.css**

```css
.history-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.history-controls select {
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-raised); color: var(--text); font: inherit;
}
.history-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.history-table th {
  text-align: left; padding: 10px 12px; color: var(--text-muted); font-weight: 600;
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}
.history-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.history-table tr:last-child td { border-bottom: none; }
.table-scroll { overflow-x: auto; }
.chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 700;
  background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent);
}
.chip-muted { background: color-mix(in srgb, var(--border) 60%, transparent); color: var(--text-muted); }
.modal-overlay {
  position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.5);
  display: grid; place-items: center; padding: 20px;
}
.modal-card { width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; }
.drop-area {
  border: 2px dashed var(--border); border-radius: var(--radius); padding: 28px;
  text-align: center; color: var(--text-muted); cursor: pointer;
}
.drop-area.dragover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 2: ImportPanel**

`web/src/app/(app)/history/ImportPanel.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { postJSON, ApiError } from '@/lib/api-client';
import { parseCsvSolves, type CsvEntry } from '@/lib/parse-csv';
import { useToast } from '@/components/Toast';

interface ImportCounts { imported: number; duplicates: number; skipped_type: number; invalid: number; total: number }

const todayLocal = () => new Date().toISOString().slice(0, 10);

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<Record<string, boolean>>({ solo: true, duo: false, team: false });
  const [csvPreview, setCsvPreview] = useState<{ entries: CsvEntry[]; errors: number } | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    if (file.name.endsWith('.json')) {
      let records: unknown;
      try { records = JSON.parse(text); } catch { return toast('That .json file could not be parsed', 'error'); }
      setBusy(true);
      try {
        const includeTypes = Object.entries(types).filter(([, on]) => on).map(([t]) => t);
        const res = await postJSON<ImportCounts>('/api/import/speedpuzzling', { records, include_types: includeTypes });
        toast(`Imported ${res.imported} (duplicates ${res.duplicates}, skipped ${res.skipped_type}, invalid ${res.invalid})`);
        onDone();
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Import failed', 'error');
      } finally {
        setBusy(false);
      }
    } else if (file.name.endsWith('.csv')) {
      setCsvPreview(parseCsvSolves(text, todayLocal()));
    } else {
      toast('Please choose a .json or .csv file', 'error');
    }
  }

  async function importCsv() {
    if (!csvPreview) return;
    setBusy(true);
    let ok = 0, failed = 0;
    for (const entry of csvPreview.entries.filter((e) => e.valid)) {
      try {
        await postJSON('/api/solves', { ...entry, valid: undefined });
        ok++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    setCsvPreview(null);
    toast(`Imported ${ok} solves${failed ? `, ${failed} failed` : ''}${csvPreview.errors ? `, ${csvPreview.errors} invalid rows skipped` : ''}`);
    onDone();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Import sessions</h3>
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: '0.85rem' }}>
        {(['solo', 'duo', 'team'] as const).map((t) => (
          <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={types[t]} onChange={(e) => setTypes({ ...types, [t]: e.target.checked })} />
            {t} <span style={{ color: 'var(--text-muted)' }}>(myspeedpuzzling)</span>
          </label>
        ))}
      </div>
      <div
        className={`drop-area${dragover ? ' dragover' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragover(false);
          if (e.dataTransfer.files[0]) void handleFile(e.dataTransfer.files[0]);
        }}
      >
        {busy ? 'Importing…' : 'Drop a myspeedpuzzling .json export or a .csv here — or click to browse'}
      </div>
      <input
        ref={fileRef} type="file" accept=".json,.csv" hidden
        onChange={(e) => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); e.target.value = ''; }}
      />
      {csvPreview ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>
            {csvPreview.entries.filter((e) => e.valid).length} rows ready
            {csvPreview.errors ? `, ${csvPreview.errors} invalid` : ''}
          </span>
          <button className="btn btn-primary" onClick={importCsv} disabled={busy}>Import CSV rows</button>
          <button className="btn" onClick={() => setCsvPreview(null)}>Cancel</button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: History page**

Replace `web/src/app/(app)/history/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, putJSON, deleteJSON, ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/time';
import { fmtDateFull } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { SolveForm, type SolveFormValues } from '@/components/SolveForm';
import { ImportPanel } from './ImportPanel';
import './history.css';

interface Solve {
  id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number;
  puzzleName: string; brand: string; difficultyRating: number; notes: string; tags: string;
  isPersonalBest: boolean; puzzleType: string; firstAttempt: boolean;
}

export default function HistoryPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Solve[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pieces, setPieces] = useState('all');
  const [sort, setSort] = useState<'date' | 'time' | 'scaled' | 'pieces'>('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<Solve | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const qs = new URLSearchParams({ sort, order });
    if (pieces !== 'all') qs.set('pieces', pieces);
    setRows(await getJSON<Solve[]>(`/api/solves?${qs}`));
    setLoaded(true);
  }, [pieces, sort, order]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pieceOptions = [...new Set(rows.map((r) => r.pieces))].sort((a, b) => a - b);

  async function saveEdit(values: SolveFormValues) {
    if (!editing) return;
    setBusy(true);
    try {
      await putJSON(`/api/solves/${editing.id}`, values);
      toast('Session updated');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Solve) {
    if (!window.confirm(`Delete the ${row.pieces}pc session from ${fmtDateFull(row.date)}?`)) return;
    try {
      await deleteJSON(`/api/solves/${row.id}`);
      toast('Session deleted');
      await refresh();
    } catch {
      toast('Delete failed', 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>History</h1>
        <p className="desc">All sessions</p>
      </div>

      <div className="history-controls">
        <select aria-label="Filter by pieces" value={pieces} onChange={(e) => setPieces(e.target.value)}>
          <option value="all">All sizes</option>
          {pieceOptions.map((pc) => <option key={pc} value={pc}>{pc}pc</option>)}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="date">Date</option>
          <option value="time">Time</option>
          <option value="scaled">Scaled</option>
          <option value="pieces">Pieces</option>
        </select>
        <button className="btn" onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')} aria-label="Toggle sort order">
          {order === 'desc' ? '↓' : '↑'}
        </button>
        <span style={{ flex: 1 }} />
        <a className="btn" href="/api/export/csv" download>Export CSV</a>
        <button className="btn" onClick={() => setShowImport(!showImport)}>{showImport ? 'Close import' : 'Import'}</button>
      </div>

      {showImport ? <ImportPanel onDone={refresh} /> : null}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr><th>Date</th><th>Puzzle</th><th>Pieces</th><th>Time</th><th>Scaled</th><th>★</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateFull(r.date)}</td>
                  <td>
                    {r.puzzleName || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    {r.brand ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {r.brand}</span> : null}
                  </td>
                  <td>{r.pieces}</td>
                  <td className="mono">{formatDuration(r.timeSeconds)}</td>
                  <td className="mono">{formatDuration(Math.round(r.scaledTimeSeconds))}</td>
                  <td>{r.difficultyRating}</td>
                  <td>
                    {r.isPersonalBest ? <span className="chip">PB</span> : null}{' '}
                    {r.puzzleType !== 'solo' ? <span className="chip chip-muted">{r.puzzleType}</span> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" style={{ padding: '4px 10px', marginRight: 6 }} onClick={() => setEditing(r)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
              {loaded && rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  No sessions yet — log your first puzzle!
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit session" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="card modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3>Edit session</h3>
              <button className="btn" style={{ padding: '4px 10px' }} onClick={() => setEditing(null)}>✕</button>
            </div>
            <SolveForm
              submitLabel="Save changes"
              busy={busy}
              initial={{
                pieces: editing.pieces, time_seconds: editing.timeSeconds, date: editing.date,
                puzzle_name: editing.puzzleName, brand: editing.brand,
                difficulty_rating: editing.difficultyRating, notes: editing.notes, tags: editing.tags,
                puzzle_type: editing.puzzleType as SolveFormValues['puzzle_type'], first_attempt: editing.firstAttempt,
              }}
              onSubmit={saveEdit}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: history page with filters, edit, delete, export, import

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Dashboard

**Files:**
- Create: `web/src/app/(app)/dashboard/dashboard.css`
- Modify: `web/src/app/(app)/dashboard/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `/api/statistics`, `/api/charts/trend`, `/api/solves?sort=date&order=desc` (first 10 client-side), `calculateLevel`, `getMotivation`, `funStatItems`, `StatCard`, `ChartCard` + Recharts, `formatDuration`, `fmtDate`, `pct`.
- Produces: dashboard layout —
  - Motivation banner (emoji + message).
  - XP bar: `Level {level}` + progress bar (`width: {progress}%`, `var(--accent)`) + `{totalXP} XP`.
  - Stat cards grid: Total puzzles, Total time (`{total_time_hours}h`), Best scaled (`formatDuration`), Median scaled, Current streak (`🔥 {n}` accent when > 0), Improvement (`pct(improvement_pct)`), This week, Pace trend.
  - Community card ONLY when `community.has_data`: beat-avg count/compared, avg vs community `pct`, best rank, podiums, top10.
  - Trend chart (`ChartCard`, height 220): scaled times + MA5 line — slots: scaled = `--chart-2` (dots), MA5 = `--chart-1` (2px line). Legend shown (2 series).
  - Recent sessions list (last 10): date, pieces, time, PB chip.
  - Personal bests row: one `StatCard` per piece count (`personal_bests`), value `formatDuration`, label `{pc}pc PB`.
  - Fun stats card: `funStatItems` rendered as icon/text/val rows.
  - Empty state (no puzzles): single card CTA linking to /log.

- [ ] **Step 1: dashboard.css**

```css
.dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.dash-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 900px) { .dash-cols { grid-template-columns: 1fr; } }
.motivation {
  display: flex; gap: 12px; align-items: center; padding: 14px 18px; margin-bottom: 16px;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-raised));
  border: 1px solid var(--border); border-radius: var(--radius);
}
.motivation .emoji { font-size: 1.6rem; }
.xp-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; font-size: 0.85rem; }
.xp-track { flex: 1; height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--border) 60%, transparent); overflow: hidden; }
.xp-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.4s ease; }
.recent-list { display: flex; flex-direction: column; }
.recent-list .row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
.recent-list .row:last-child { border-bottom: none; }
.fun-list .row { display: flex; gap: 10px; padding: 6px 0; font-size: 0.9rem; align-items: baseline; }
.fun-list .row .t { color: var(--text-muted); flex: 1; }
```

- [ ] **Step 2: Dashboard page**

Replace `web/src/app/(app)/dashboard/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getJSON } from '@/lib/api-client';
import type { Statistics } from '@/lib/stats';
import { calculateLevel } from '@/lib/levels';
import { getMotivation } from '@/lib/motivation';
import { funStatItems } from '@/lib/fun-stats';
import { formatDuration } from '@/lib/time';
import { fmtDate, pct } from '@/lib/format';
import { StatCard } from '@/components/StatCard';
import { ChartCard, AXIS, GRID, TOOLTIP_STYLE } from '@/components/charts/ChartCard';
import './dashboard.css';

interface Solve { id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number; isPersonalBest: boolean }
interface Trend { solves: Solve[]; moving_avg_5: number[] }

export default function DashboardPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [recent, setRecent] = useState<Solve[]>([]);

  useEffect(() => {
    void getJSON<Statistics>('/api/statistics').then(setStats);
    void getJSON<Trend>('/api/charts/trend').then(setTrend);
    void getJSON<Solve[]>('/api/solves?sort=date&order=desc').then((rows) => setRecent(rows.slice(0, 10)));
  }, []);

  if (!stats) return <div className="card">Loading…</div>;

  if (stats.total_puzzles === 0) {
    return (
      <>
        <div className="page-head"><h1>Dashboard</h1><p className="desc">Your speed puzzling overview</p></div>
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>🧩</p>
          <h3 style={{ marginBottom: 8 }}>Welcome to Puzzle Geeks!</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Log your first puzzle to unlock your dashboard.</p>
          <Link className="btn btn-primary" href="/log">Log a puzzle</Link>
        </div>
      </>
    );
  }

  const level = calculateLevel(stats);
  const motivation = getMotivation(stats);
  const fun = funStatItems(stats);
  const trendRows = trend?.solves.map((s, i) => ({
    name: fmtDate(s.date),
    scaled: Math.round(s.scaledTimeSeconds / 60),
    ma5: Math.round((trend.moving_avg_5[i] ?? 0) / 60),
  })) ?? [];

  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><p className="desc">Your speed puzzling overview</p></div>

      <div className="motivation"><span className="emoji" aria-hidden>{motivation.emoji}</span><span>{motivation.msg}</span></div>

      <div className="xp-bar">
        <strong>Level {level.level}</strong>
        <div className="xp-track"><div className="xp-fill" style={{ width: `${level.progress}%` }} /></div>
        <span className="mono" style={{ color: 'var(--text-muted)' }}>{level.totalXP} XP</span>
      </div>

      <div className="dash-grid">
        <StatCard label="Puzzles" value={String(stats.total_puzzles)} sub={`${stats.this_week_count} this week`} />
        <StatCard label="Hours" value={String(stats.total_time_hours)} sub={`${stats.total_pieces.toLocaleString('en-US')} pieces`} />
        <StatCard label="Best scaled" value={formatDuration(stats.best_scaled_time)} sub="500pc equivalent" accent />
        <StatCard label="Median scaled" value={formatDuration(stats.median_scaled_time)} />
        <StatCard label="Streak" value={stats.current_streak > 0 ? `🔥 ${stats.current_streak}` : '0'} sub={`longest ${stats.longest_streak}`} accent={stats.current_streak > 0} />
        <StatCard label="Improvement" value={pct(stats.improvement_pct)} sub={stats.pace_trend} />
      </div>

      {stats.community.has_data ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Community standing <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>myspeedpuzzling</span></h3>
          <div className="dash-grid" style={{ marginBottom: 0 }}>
            <StatCard label="Beat the average" value={`${stats.community.beat_avg_count}/${stats.community.compared_count}`} />
            <StatCard label="Vs community" value={pct(stats.community.avg_vs_community_pct ?? 0)} sub="faster is +" />
            <StatCard label="Best rank" value={stats.community.best_rank ? `#${stats.community.best_rank}` : '—'} />
            <StatCard label="Podiums" value={String(stats.community.podiums ?? 0)} sub={`top-10 ×${stats.community.top10 ?? 0}`} />
          </div>
        </div>
      ) : null}

      <div className="dash-cols">
        <ChartCard title="Progress trend" tag="scaled minutes" height={220}>
          <LineChart data={trendRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
            <Line name="Scaled" dataKey="scaled" stroke="var(--chart-2)" strokeWidth={0} dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }} isAnimationActive={false} />
            <Line name="5-solve average" dataKey="ma5" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartCard>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Recent sessions</h3>
          <div className="recent-list">
            {recent.map((s) => (
              <div className="row" key={s.id}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.date)}</span>
                <span>{s.pieces}pc</span>
                <span className="mono">{formatDuration(s.timeSeconds)}</span>
                <span>{s.isPersonalBest ? <span className="chip">PB</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-cols">
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Personal bests</h3>
          <div className="dash-grid" style={{ marginBottom: 0 }}>
            {Object.entries(stats.personal_bests).map(([pc, t]) => (
              <StatCard key={pc} label={`${pc}pc PB`} value={formatDuration(t)} accent />
            ))}
          </div>
        </div>
        <div className="card fun-list">
          <h3 style={{ marginBottom: 10 }}>Fun stats</h3>
          {fun.map((f) => (
            <div className="row" key={f.text}>
              <span aria-hidden>{f.icon}</span>
              <span className="t">{f.text}</span>
              <strong>{f.val}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

Note: `.chip` styles come from `history.css` — move the `.chip`/`.chip-muted` rules into `globals.css` in this task (delete them from `history.css` if Task 4 already landed them there) so both pages share them.

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: live dashboard with stats, XP, motivation, trend, fun stats

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Analytics page (7 charts)

**Files:**
- Modify: `web/src/app/(app)/analytics/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `/api/charts/trend|piece-breakdown|pace|weekly`, `distributionBins`, `improvementSeries`, `foldPieSlices`, `ChartCard`/`AXIS`/`GRID`/`TOOLTIP_STYLE`, Recharts.
- Produces seven charts (all one-axis; slot colors fixed; tooltips everywhere; legend only where ≥2 series):
  1. **Scaled time + moving averages** (full width, h 300): dots = scaled (`--chart-2`), MA5 line (`--chart-1`), MA10 line (`--chart-4`); legend.
  2. **Best & average by piece count**: grouped bars best (`--chart-1`) / average (`--chart-2`), 4px rounded tops, legend; y = minutes.
  3. **Pace over time**: single line (`--chart-1`), y = sec/piece; no legend.
  4. **Time distribution**: bars from `distributionBins` (`--chart-2`); no legend.
  5. **Sessions by piece count**: pie from piece-breakdown counts via `foldPieSlices` — cells `--chart-1..5` in order + `var(--text-muted)` for "Other"; legend right.
  6. **Improvement over time** (full width): line vs first solve (`--chart-1`), y ticks `+N%`; no legend.
  7. **Weekly summary** (full width): bars = puzzles per week (`--chart-2`); tooltip also shows total h and avg scaled (extra payload keys); no second axis.

- [ ] **Step 1: Implement page**

Replace `web/src/app/(app)/analytics/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { getJSON } from '@/lib/api-client';
import { distributionBins, improvementSeries, foldPieSlices } from '@/lib/chart-transforms';
import { fmtDate } from '@/lib/format';
import { ChartCard, AXIS, GRID, TOOLTIP_STYLE } from '@/components/charts/ChartCard';

interface Solve { id: number; date: string; pieces: number; timeSeconds: number; scaledTimeSeconds: number }
interface Trend { solves: Solve[]; moving_avg_5: number[]; moving_avg_10: number[] }
type Breakdown = Record<string, { count: number; average: number; best: number; worst: number }>;
interface PacePoint { date: string; pace: number; pieces: number; id: number }
interface Week { week: string; count: number; total_time: number; avg_scaled: number; best_scaled: number; total_pieces: number }

const SLOTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const min = (s: number) => Math.round(s / 60);

export default function AnalyticsPage() {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [pace, setPace] = useState<PacePoint[]>([]);
  const [weekly, setWeekly] = useState<Week[]>([]);

  useEffect(() => {
    void getJSON<Trend>('/api/charts/trend').then(setTrend);
    void getJSON<Breakdown>('/api/charts/piece-breakdown').then(setBreakdown);
    void getJSON<PacePoint[]>('/api/charts/pace').then(setPace);
    void getJSON<Week[]>('/api/charts/weekly').then(setWeekly);
  }, []);

  if (!trend || !breakdown) return <div className="card">Loading…</div>;
  if (trend.solves.length === 0) {
    return (
      <>
        <div className="page-head"><h1>Analytics</h1><p className="desc">Performance deep-dive</p></div>
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Charts unlock after your first logged solve.
        </div>
      </>
    );
  }

  const trendRows = trend.solves.map((s, i) => ({
    name: fmtDate(s.date),
    scaled: min(s.scaledTimeSeconds),
    ma5: min(trend.moving_avg_5[i]),
    ma10: min(trend.moving_avg_10[i]),
  }));
  const breakdownRows = Object.entries(breakdown).map(([pc, d]) => ({
    name: `${pc}pc`, best: min(d.best), average: min(d.average),
  }));
  const paceRows = pace.map((p) => ({ name: fmtDate(p.date), pace: p.pace }));
  const distRows = distributionBins(trend.solves.map((s) => s.scaledTimeSeconds));
  const pieRows = foldPieSlices(Object.entries(breakdown).map(([pc, d]) => ({ label: `${pc}pc`, value: d.count })));
  const impRows = improvementSeries(trend.solves.map((s) => s.scaledTimeSeconds)).map((v, i) => ({ name: `#${i + 1}`, imp: v }));
  const weekRows = weekly.map((w) => ({
    name: fmtDate(w.week), count: w.count, hours: Math.round((w.total_time / 3600) * 10) / 10, avgScaled: min(w.avg_scaled),
  }));

  const cols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 };

  return (
    <>
      <div className="page-head"><h1>Analytics</h1><p className="desc">Performance deep-dive</p></div>

      <div style={{ marginBottom: 16 }}>
        <ChartCard title="Scaled time with moving averages" tag="minutes, 500pc equivalent" height={300}>
          <LineChart data={trendRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line name="Scaled" dataKey="scaled" stroke="var(--chart-2)" strokeWidth={0} dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }} isAnimationActive={false} />
            <Line name="5-solve avg" dataKey="ma5" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="10-solve avg" dataKey="ma10" stroke="var(--chart-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      </div>

      <div style={cols}>
        <ChartCard title="Best & average by piece count" tag="minutes">
          <BarChart data={breakdownRows} barGap={2}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar name="Best" dataKey="best" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar name="Average" dataKey="average" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Pace" tag="seconds per piece">
          <LineChart data={paceRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={36} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Line dataKey="pace" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: 'var(--chart-1)', strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Time distribution" tag="scaled minutes">
          <BarChart data={distRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={30} allowDecimals={false} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Sessions by piece count">
          <PieChart>
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} />
            <Pie data={pieRows} dataKey="value" nameKey="label" innerRadius="55%" paddingAngle={2} isAnimationActive={false}>
              {pieRows.map((entry, i) => (
                <Cell key={entry.label} fill={entry.label === 'Other' ? 'var(--text-muted)' : SLOTS[i % SLOTS.length]} stroke="var(--bg-raised)" strokeWidth={2} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ChartCard title="Improvement over time" tag="% vs first solve" height={260}>
          <LineChart data={impRows}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={44} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${Number(v) > 0 ? '+' : ''}${v}%`, 'vs first']} />
            <Line dataKey="imp" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: 'var(--chart-1)', strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title="Weekly summary" tag="sessions per week" height={260}>
        <BarChart data={weekRows}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="name" {...AXIS} />
          <YAxis {...AXIS} width={30} allowDecimals={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v, name, item) => {
              const p = item.payload as { hours: number; avgScaled: number };
              return [`${v} sessions · ${p.hours}h · avg ${p.avgScaled}m scaled`, ''];
            }}
          />
          <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartCard>
    </>
  );
}
```

- [ ] **Step 2: Render check**

`npm run dev` with a dev DB (or rely on Task 9's e2e): open /analytics with a few solves logged; eyeball for label collisions/overflow in BOTH themes (charts must recolor when the theme switches). Fix anything broken.

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: analytics page with seven theme-aware charts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Goals + Awards pages

**Files:**
- Create: `web/src/app/(app)/awards/awards.css`
- Modify: `web/src/app/(app)/goals/page.tsx`, `web/src/app/(app)/awards/page.tsx`

**Interfaces:**
- Consumes: `/api/goals` CRUD, `/api/achievements`, `/api/statistics` (for goal progress = current PB per piece count), `parseDuration`/`formatDuration`, `useToast`.
- Produces:
  - **Goals**: add form (pieces, target time text, description) + list. Each goal card: `{pieces}pc under {formatDuration(target)}`, description, achieved chip + date when done; otherwise progress line `PB {formatDuration(pb)} → target` when a PB exists for that piece count; delete button.
  - **Awards**: grid of all 19 achievements; unlocked = accent border + icon emoji (map: puzzle-piece 🧩, star ⭐, fire 🔥, trophy 🏆, crown 👑, gem 💎, bolt ⚡, mountain 🏔️, calendar 📅, flame 🔥, rocket 🚀, chart-up 📈, trending-up 📊, grid 🔢, globe 🌍, moon 🌙, medal 🥇, clock ⏰, sun ☀️), name, description, unlock date (`fmtDateFull`); locked = dimmed with 🔒 overlay icon.

- [ ] **Step 1: Goals page**

Replace `web/src/app/(app)/goals/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJSON, postJSON, deleteJSON, ApiError } from '@/lib/api-client';
import { parseDuration, formatDuration } from '@/lib/time';
import { fmtDateFull } from '@/lib/format';
import type { Statistics } from '@/lib/stats';
import { useToast } from '@/components/Toast';

interface Goal {
  id: number; pieces: number; targetTimeSeconds: number; description: string;
  achieved: boolean; achievedDate: string | null;
}

export default function GoalsPage() {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pbs, setPbs] = useState<Record<number, number>>({});
  const [timeText, setTimeText] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setGoals(await getJSON<Goal[]>('/api/goals'));
    setPbs((await getJSON<Statistics>('/api/statistics')).personal_bests);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = parseDuration(timeText);
    if (target == null || target <= 0) return toast('Target time must look like 1:00:00 or minutes', 'error');
    setBusy(true);
    try {
      await postJSON('/api/goals', {
        pieces: Number(f.get('pieces')),
        target_time_seconds: target,
        description: String(f.get('description') ?? ''),
      });
      toast('Goal added');
      setTimeText('');
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add goal', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Goal) {
    await deleteJSON(`/api/goals/${g.id}`).catch(() => toast('Delete failed', 'error'));
    await refresh();
  }

  return (
    <>
      <div className="page-head"><h1>Goals</h1><p className="desc">Set targets, track progress</p></div>

      <form className="card" onSubmit={add} style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="g-pieces">Pieces</label>
            <input id="g-pieces" name="pieces" type="number" min={1} required defaultValue={500} />
          </div>
          <div className="field">
            <label htmlFor="g-time">Target time</label>
            <input id="g-time" value={timeText} onChange={(e) => setTimeText(e.target.value)} placeholder="1:00:00" required />
          </div>
          <div className="field">
            <label htmlFor="g-desc">Description</label>
            <input id="g-desc" name="description" placeholder="sub-hour 500" />
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy} style={{ marginTop: 14 }}>Add goal</button>
      </form>

      {goals.map((g) => (
        <div className="card" key={g.id} style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong>{g.pieces}pc under {formatDuration(g.targetTimeSeconds)}</strong>
            {g.description ? <span style={{ color: 'var(--text-muted)' }}> — {g.description}</span> : null}
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {g.achieved
                ? <span className="chip">Achieved {g.achievedDate ? fmtDateFull(g.achievedDate) : ''}</span>
                : pbs[g.pieces]
                  ? `Current PB ${formatDuration(pbs[g.pieces])} — ${pbs[g.pieces] - g.targetTimeSeconds > 0 ? formatDuration(pbs[g.pieces] - g.targetTimeSeconds) + ' to shave' : 'within reach!'}`
                  : 'No solves at this size yet'}
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => remove(g)}>Delete</button>
        </div>
      ))}
      {goals.length === 0 ? <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No goals yet — aim at something!</div> : null}
    </>
  );
}
```

- [ ] **Step 2: Awards page + css**

`web/src/app/(app)/awards/awards.css`:

```css
.awards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.award { position: relative; padding: 16px; }
.award .icon { font-size: 1.8rem; margin-bottom: 6px; }
.award h4 { font-size: 0.95rem; margin-bottom: 2px; }
.award p { font-size: 0.8rem; color: var(--text-muted); }
.award .date { font-size: 0.75rem; color: var(--accent); margin-top: 6px; }
.award.unlocked { border-color: var(--accent); }
.award.locked { opacity: 0.55; }
.award.locked::after { content: '🔒'; position: absolute; top: 12px; right: 12px; }
```

Replace `web/src/app/(app)/awards/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getJSON } from '@/lib/api-client';
import { fmtDateFull } from '@/lib/format';
import './awards.css';

interface Achievement {
  id: number; code: string; name: string; description: string; icon: string;
  unlocked: boolean; unlockedDate: string | null;
}

const ICONS: Record<string, string> = {
  'puzzle-piece': '🧩', star: '⭐', fire: '🔥', trophy: '🏆', crown: '👑', gem: '💎',
  bolt: '⚡', mountain: '🏔️', calendar: '📅', flame: '🔥', rocket: '🚀',
  'chart-up': '📈', 'trending-up': '📊', grid: '🔢', globe: '🌍', moon: '🌙',
  medal: '🥇', clock: '⏰', sun: '☀️',
};

export default function AwardsPage() {
  const [items, setItems] = useState<Achievement[]>([]);
  useEffect(() => { void getJSON<Achievement[]>('/api/achievements').then(setItems); }, []);
  const unlocked = items.filter((a) => a.unlocked).length;

  return (
    <>
      <div className="page-head">
        <h1>Achievements</h1>
        <p className="desc">{items.length ? `${unlocked} of ${items.length} unlocked` : 'Your milestones'}</p>
      </div>
      <div className="awards-grid">
        {items.map((a) => (
          <div key={a.code} className={`card award ${a.unlocked ? 'unlocked' : 'locked'}`}>
            <div className="icon" aria-hidden>{ICONS[a.icon] ?? '🏅'}</div>
            <h4>{a.name}</h4>
            <p>{a.description}</p>
            {a.unlocked && a.unlockedDate ? <div className="date">Unlocked {fmtDateFull(a.unlockedDate)}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: goals and achievements pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Settings — scaling exponent slider with live preview

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx` (add a Scaling card between Theme and Sign out), create `web/src/app/(app)/settings/ScalingCard.tsx`

**Interfaces:**
- Consumes: `/api/settings` GET/PUT, `scalingInfo` + `DEFAULT_SCALING_EXPONENT` from `@/lib/scaling` (client-side preview — no server round-trip while sliding), `formatDuration`, `useToast`.
- Produces: `ScalingCard` — slider 0 to 1 step 0.05, current value shown; live preview table (from `scalingInfo(value)`: piece count → factor → "30min becomes"); Save button PUTs `{scaling_exponent: value}` and toasts "Scaling updated — history rescaled". Explanatory copy: "Normalizes every solve to a 500-piece equivalent so different sizes compare fairly. 0 = raw times."

- [ ] **Step 1: ScalingCard**

`web/src/app/(app)/settings/ScalingCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getJSON, putJSON } from '@/lib/api-client';
import { scalingInfo, DEFAULT_SCALING_EXPONENT } from '@/lib/scaling';
import { formatDuration } from '@/lib/time';
import { useToast } from '@/components/Toast';

export function ScalingCard() {
  const { toast } = useToast();
  const [value, setValue] = useState(DEFAULT_SCALING_EXPONENT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getJSON<Record<string, string>>('/api/settings').then((s) => {
      const v = Number(s.scaling_exponent);
      if (Number.isFinite(v)) setValue(v);
    });
  }, []);

  const info = scalingInfo(value);

  async function save() {
    setBusy(true);
    try {
      await putJSON('/api/settings', { scaling_exponent: value });
      toast('Scaling updated — history rescaled');
    } catch {
      toast('Failed to save scaling', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 6 }}>Scaled time</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 14 }}>
        Normalizes every solve to a 500-piece equivalent so different sizes compare fairly. 0 = raw times.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <input
          type="range" min={0} max={1} step={0.05} value={value}
          aria-label="Scaling exponent"
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span className="mono" style={{ width: 44, textAlign: 'right' }}>{value.toFixed(2)}</span>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="table-scroll">
        <table className="history-table" style={{ fontSize: '0.85rem' }}>
          <thead><tr><th>Pieces</th><th>Factor</th><th>30 min becomes</th></tr></thead>
          <tbody>
            {Object.entries(info.scalingTable).map(([pc, v]) => (
              <tr key={pc}>
                <td>{pc}</td>
                <td className="mono">×{v.scalingFactor}</td>
                <td className="mono">{formatDuration(v.example30min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: `.history-table`/`.table-scroll` classes must be global by now (Task 5 moved `.chip` to `globals.css`; move `.history-table`, `.table-scroll` there too, leaving page-specific rules in `history.css`).

- [ ] **Step 2: Wire into settings page**

In `web/src/app/(app)/settings/page.tsx`, add below the Theme card:

```tsx
import { ScalingCard } from './ScalingCard';
// …inside the returned fragment, after the Theme card:
<ScalingCard />
```

- [ ] **Step 3: Gate + commit**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
cd .. && git add web && git commit -m "feat: scaling exponent slider with live preview in settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end flows + full regression gate

**Files:**
- Create: `web/e2e/core-flows.spec.ts`

**Interfaces:**
- Consumes: everything above; the Task-8 (Plan 1) Playwright setup.

- [ ] **Step 1: Write the e2e spec**

`web/e2e/core-flows.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const uniq = `e2e2_${Date.now()}`;

test('log → dashboard → history edit → goals → awards → analytics → settings scaling', async ({ page }) => {
  // Register
  await page.goto('/register');
  await page.getByLabel('Username').fill(uniq);
  await page.getByLabel('Email').fill(`${uniq}@example.com`);
  await page.getByLabel(/Password/).fill('longenough123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Quick-add a solve
  await page.getByRole('link', { name: /Log/ }).first().click();
  await page.getByRole('radio', { name: '500' }).click();
  await page.getByLabel('Time').fill('45:00');
  await page.getByRole('button', { name: 'Log 500pc' }).click();
  await expect(page.getByText(/Logged 500pc in 45:00/)).toBeVisible();

  // Dashboard reflects it
  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page.getByText('Level 1')).toBeVisible();
  await expect(page.getByText('45:00').first()).toBeVisible();

  // History: edit the time
  await page.getByRole('link', { name: /History/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Time *').fill('40:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Session updated')).toBeVisible();
  await expect(page.getByRole('cell', { name: '40:00' })).toBeVisible();

  // Goals: add and see progress line
  await page.getByRole('link', { name: /Goals/ }).click();
  await page.getByLabel('Target time').fill('35:00');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await expect(page.getByText('500pc under 35:00')).toBeVisible();
  await expect(page.getByText(/Current PB 40:00/)).toBeVisible();

  // Awards: first_puzzle unlocked
  await page.getByRole('link', { name: /Awards/ }).click();
  await expect(page.getByText('First Piece')).toBeVisible();
  await expect(page.getByText(/1 of 19 unlocked/)).toBeVisible();

  // Analytics renders charts
  await page.getByRole('link', { name: /Analytics/ }).click();
  await expect(page.getByText('Scaled time with moving averages')).toBeVisible();

  // Settings: scaling slider saves
  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByLabel('Scaling exponent').fill('0');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Scaling updated — history rescaled')).toBeVisible();
});
```

- [ ] **Step 2: Run the full gate**

```bash
cd web && npm test && npm run lint && npx tsc --noEmit && npm run build
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=puzzlegeeks --name pg-e2e postgres:16
sleep 5
DATABASE_URL=postgres://postgres:pg@localhost:5433/puzzlegeeks npx drizzle-kit migrate
npm run e2e
docker stop pg-e2e
```

Expected: all unit tests + 3 e2e specs (Plan-1's 2 + this one) pass. If a selector is ambiguous, fix the page (prefer accessible names) not the assertion's intent.

- [ ] **Step 3: Commit**

```bash
cd .. && git add web && git commit -m "test: end-to-end core flows (log, edit, goals, awards, analytics, scaling)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (Plan-2B slice):** logging quick+full ✅ (T3); history search/filter/edit/delete ✅ (T4); CSV export link + CSV/myspeedpuzzling import UI ✅ (T4); dashboard stats/PBs/recent/fun/community strip ✅ (T5); XP/streak/confetti/motivation ✅ (T2, T5, T3); analytics = all seven legacy charts ✅ (T6); goals ✅ (T7); achievements ✅ (T7); scaled-time tunable + preview ✅ (T8). Deferred to Plan 3: cockpit timer (the /timer placeholder stays), PWA/offline, data migration, cutover. Community features beyond the read-only myspeedpuzzling card are Phase 2 of the spec (separate plans).
- **Dataviz compliance:** palettes validated (six-checks pass for both themes); fixed slot order; one axis everywhere (weekly summary folds extra measures into the tooltip rather than a second axis); tooltips on all plots; legends only for ≥2 series; labels/text on text tokens; grid recessive; pie folds to ≤6 slices with neutral "Other".
- **Type consistency:** `Statistics` snake_case from `@/lib/stats` used by dashboard/goals; solves camelCase everywhere; `SolveFormValues` shared by log + history edit; `CsvEntry` from T1 consumed by T4.
- **No placeholders:** every step has complete code and exact commands.
