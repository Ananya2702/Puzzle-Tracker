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
