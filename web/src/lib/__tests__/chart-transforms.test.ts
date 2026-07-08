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
