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
