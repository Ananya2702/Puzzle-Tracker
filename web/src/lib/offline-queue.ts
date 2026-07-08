import { postJSON, ApiError } from './api-client';

const KEY = 'pg-solve-queue';

function read(): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: unknown[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueSolve(body: unknown): void {
  write([...read(), body]);
}

export function queuedSolveCount(): number {
  return read().length;
}

let flushing = false;

/**
 * POST queued solves in order. Persists the remaining queue after each
 * successful post (or drop) so a crash mid-flush doesn't re-send items that
 * already made it to the server. 4xx errors are treated as poison: the item
 * is dropped rather than requeued forever. Single-flight: a call made while
 * a flush is already in progress returns immediately without sending.
 */
export async function flushSolveQueue(
  post: (url: string, body: unknown) => Promise<unknown> = postJSON,
): Promise<{ sent: number; remaining: number; dropped: number }> {
  if (flushing) return { sent: 0, remaining: queuedSolveCount(), dropped: 0 };
  flushing = true;
  try {
    const items = read();
    if (items.length === 0) return { sent: 0, remaining: 0, dropped: 0 };
    let sent = 0;
    let dropped = 0;
    const kept: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await post('/api/solves', item);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          dropped++; // poison item — drop instead of requeuing forever
        } else {
          kept.push(item);
        }
      }
      // persist progress incrementally: items processed so far are gone
      // (sent or dropped), kept failures + not-yet-attempted items remain.
      write([...kept, ...items.slice(i + 1)]);
    }
    return { sent, remaining: kept.length, dropped };
  } finally {
    flushing = false;
  }
}
