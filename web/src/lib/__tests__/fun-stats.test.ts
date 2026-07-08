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
