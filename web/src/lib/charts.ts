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
