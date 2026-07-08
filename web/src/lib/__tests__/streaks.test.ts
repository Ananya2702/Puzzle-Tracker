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
