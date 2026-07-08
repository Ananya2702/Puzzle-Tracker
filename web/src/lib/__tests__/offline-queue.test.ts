import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueSolve, flushSolveQueue, queuedSolveCount } from '@/lib/offline-queue';

// vitest node env has no localStorage — install a minimal shim
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

describe('offline solve queue', () => {
  it('enqueues and counts', () => {
    expect(queuedSolveCount()).toBe(0);
    enqueueSolve({ pieces: 500, time_seconds: 100 });
    enqueueSolve({ pieces: 300, time_seconds: 200 });
    expect(queuedSolveCount()).toBe(2);
  });

  it('flush posts each in order and clears', async () => {
    enqueueSolve({ n: 1 });
    enqueueSolve({ n: 2 });
    const post = vi.fn().mockResolvedValue({});
    const res = await flushSolveQueue(post);
    expect(res).toEqual({ sent: 2, remaining: 0 });
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ n: 1 }, { n: 2 }]);
    expect(post.mock.calls.every((c) => c[0] === '/api/solves')).toBe(true);
    expect(queuedSolveCount()).toBe(0);
  });

  it('keeps failures (and everything after the first failure order-preserved)', async () => {
    enqueueSolve({ n: 1 });
    enqueueSolve({ n: 2 });
    enqueueSolve({ n: 3 });
    const post = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('offline again'))
      .mockResolvedValueOnce({});
    const res = await flushSolveQueue(post);
    expect(res.sent).toBe(2);
    expect(res.remaining).toBe(1);
    expect(queuedSolveCount()).toBe(1);
  });

  it('no-ops safely with an empty queue', async () => {
    expect(await flushSolveQueue(vi.fn())).toEqual({ sent: 0, remaining: 0 });
  });
});
