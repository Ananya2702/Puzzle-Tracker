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
