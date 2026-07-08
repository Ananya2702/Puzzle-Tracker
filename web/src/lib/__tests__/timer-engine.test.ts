import { describe, it, expect } from 'vitest';
import {
  idleState, start, pause, resume, finish, split,
  elapsedSeconds, payloadSplits, pbComparison, serialize, deserialize,
} from '@/lib/timer-engine';

const T0 = 1_000_000; // arbitrary epoch ms

describe('timer lifecycle', () => {
  it('starts, runs, pauses, resumes, finishes with correct elapsed', () => {
    let s = start(idleState(), T0);
    expect(s.status).toBe('running');
    expect(elapsedSeconds(s, T0 + 5_000)).toBe(5);
    s = pause(s, T0 + 5_000);
    expect(elapsedSeconds(s, T0 + 60_000)).toBe(5); // frozen while paused
    s = resume(s, T0 + 60_000);
    expect(elapsedSeconds(s, T0 + 62_000)).toBe(7);
    s = finish(s, T0 + 62_000);
    expect(s.status).toBe('finished');
    expect(elapsedSeconds(s, T0 + 999_000)).toBe(7);
  });

  it('start from finished begins a fresh solve', () => {
    let s = finish(start(idleState(), T0), T0 + 10_000);
    s = start(s, T0 + 20_000);
    expect(s.splits).toEqual([]);
    expect(elapsedSeconds(s, T0 + 21_000)).toBe(1);
  });

  it('pause/resume/split are no-ops in wrong states', () => {
    const idle = idleState();
    expect(pause(idle, T0)).toBe(idle);
    expect(resume(idle, T0)).toBe(idle);
    expect(split(idle, T0)).toBe(idle);
  });
});

describe('splits', () => {
  it('names splits from the phase plan, then generic', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    s = split(s, T0 + 120_000);
    s = split(s, T0 + 180_000);
    s = split(s, T0 + 240_000);
    expect(s.splits.map((x) => x.phase)).toEqual(['edge', 'sort', 'assembly', 'phase 4']);
    expect(s.splits.map((x) => x.atSeconds)).toEqual([60, 120, 180, 240]);
  });

  it('payloadSplits converts cumulative to per-phase durations incl. the tail', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);   // edge at 60
    s = split(s, T0 + 150_000);  // sort at 150
    expect(payloadSplits(s, 400)).toEqual([
      { phase: 'edge', seconds: 60, position: 0 },
      { phase: 'sort', seconds: 90, position: 1 },
      { phase: 'assembly', seconds: 250, position: 2 }, // tail: 400-150
    ]);
  });

  it('payloadSplits with no splits yields a single full-solve phase', () => {
    const s = start(idleState(), T0);
    expect(payloadSplits(s, 300)).toEqual([{ phase: 'edge', seconds: 300, position: 0 }]);
  });

  it('payloadSplits drops a zero-length tail', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    expect(payloadSplits(s, 60)).toEqual([{ phase: 'edge', seconds: 60, position: 0 }]);
  });
});

describe('pbComparison', () => {
  it('deltas per split, current delta, projected finish', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 50_000);  // 50 vs PB 60 → -10
    s = split(s, T0 + 130_000); // 130 vs PB 120 → +10
    const c = pbComparison(s, T0 + 140_000, [60, 120, 300], 400);
    expect(c.splitDeltas).toEqual([-10, 10]);
    expect(c.currentDelta).toBe(10);
    expect(c.projectedFinish).toBe(410);
  });

  it('null before first split and when PB lacks the split', () => {
    let s = start(idleState(), T0);
    expect(pbComparison(s, T0 + 10_000, [60], 400).currentDelta).toBeNull();
    s = split(s, T0 + 50_000);
    s = split(s, T0 + 90_000);
    const c = pbComparison(s, T0 + 91_000, [60], 400);
    expect(c.splitDeltas).toEqual([-10, null]);
    expect(c.currentDelta).toBe(-10); // falls back to the last split BOTH sides have
    expect(c.projectedFinish).toBe(390);
  });
});

describe('serialize/deserialize', () => {
  it('round-trips a running state', () => {
    let s = start(idleState(), T0);
    s = split(s, T0 + 60_000);
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });
  it('rejects garbage', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"status":"warp"}')).toBeNull();
  });
});
